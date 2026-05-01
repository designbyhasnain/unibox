import 'server-only';
import { supabase } from '../lib/supabase';

/**
 * A/B Auto-Promote Service
 * ─────────────────────────────────────────────────────────────────────────
 * Phase 7 Step 4a — Innovation Lead's #1 ranked feature.
 *
 * Hourly cron monitors every campaign step that has multiple A/B variants.
 * When one variant has been beating the other by >8 percentage points on
 * open rate for 48+ hours AND each variant has ≥100 sends, we:
 *   - set the winner's `weight` to 100
 *   - set the loser's `weight` to 0 (effectively pausing it)
 *   - log an `A_B_AUTO_PROMOTE` activity row so admins can audit the call
 *
 * Why open rate, not reply rate? Reply rate at 100 sends is too noisy
 * (often 1-3 replies — single-digit). Open rate at 100 sends is
 * statistically meaningful and a leading indicator. We can switch to
 * reply rate later if the team wants the longer feedback loop.
 *
 * Audit ref: docs/UNIBOX-AUDIT-PHASE6-2026-05-01.md Innovation Lead #1.
 */

const MIN_SENDS_PER_VARIANT = 100;
const MIN_LEAD_PCT = 8;
const MIN_LEAD_HOURS = 48;

interface VariantMetrics {
    id: string;
    label: string;
    sends: number;
    opens: number;
    openRate: number;
    earliestSent: string | null;
    weight: number;
}

interface PromoteResult {
    stepsScanned: number;
    stepsPromoted: number;
    skipped: Array<{ stepId: string; reason: string }>;
}

export async function processABAutoPromotes(): Promise<PromoteResult> {
    const result: PromoteResult = { stepsScanned: 0, stepsPromoted: 0, skipped: [] };

    // 1. Find all steps that have ≥2 variants AND aren't already a clear winner
    //    (i.e. variants with weight > 0 on more than one). One DB hit.
    const { data: stepsWithVariants, error: stepsErr } = await supabase
        .from('campaign_variants')
        .select('step_id, id, variant_label, weight')
        .order('step_id');

    if (stepsErr || !stepsWithVariants) {
        console.error('[abPromote] failed to load variants:', stepsErr);
        return result;
    }

    // Group by step_id; only process steps with ≥2 active variants
    const byStep = new Map<string, Array<typeof stepsWithVariants[number]>>();
    for (const v of stepsWithVariants) {
        if (!byStep.has(v.step_id)) byStep.set(v.step_id, []);
        byStep.get(v.step_id)!.push(v);
    }

    const candidateSteps = Array.from(byStep.entries())
        .filter(([, vs]) => vs.length >= 2 && vs.filter(v => v.weight > 0).length >= 2);

    result.stepsScanned = candidateSteps.length;

    for (const [stepId, variants] of candidateSteps) {
        // 2. For each step, compute (sends, opens, earliestSent) per variant
        //    via campaign_emails JOIN email_messages.
        //    We could RPC this; for first ship, do it via two .in() queries.
        const variantIds = variants.map(v => v.id);
        const variantLabels = new Map(variants.map(v => [v.variant_label, v.id]));

        // sends + earliestSent per variant_label, scoped to this step
        const { data: emails } = await supabase
            .from('campaign_emails')
            .select('variant_label, sent_at, email_id')
            .eq('step_id', stepId);

        if (!emails || emails.length === 0) {
            result.skipped.push({ stepId, reason: 'no campaign_emails yet' });
            continue;
        }

        // Build metrics
        const metricsByLabel = new Map<string, VariantMetrics>();
        for (const v of variants) {
            metricsByLabel.set(v.variant_label, {
                id: v.id,
                label: v.variant_label,
                sends: 0,
                opens: 0,
                openRate: 0,
                earliestSent: null,
                weight: v.weight,
            });
        }

        // Collect emailIds we need open data for
        const emailIdsByLabel = new Map<string, string[]>();
        for (const e of emails) {
            if (!e.variant_label) continue;
            const m = metricsByLabel.get(e.variant_label);
            if (!m) continue;
            m.sends++;
            if (!m.earliestSent || e.sent_at < m.earliestSent) m.earliestSent = e.sent_at;
            if (!emailIdsByLabel.has(e.variant_label)) emailIdsByLabel.set(e.variant_label, []);
            emailIdsByLabel.get(e.variant_label)!.push(e.email_id);
        }

        // Fetch opens in one batch per label
        for (const [label, emailIds] of emailIdsByLabel) {
            if (emailIds.length === 0) continue;
            const { count } = await supabase
                .from('email_messages')
                .select('id', { count: 'exact', head: true })
                .in('id', emailIds)
                .not('opened_at', 'is', null);
            const m = metricsByLabel.get(label)!;
            m.opens = count || 0;
            m.openRate = m.sends > 0 ? (m.opens / m.sends) * 100 : 0;
        }

        const allMetrics = Array.from(metricsByLabel.values());
        const minSends = Math.min(...allMetrics.map(m => m.sends));
        if (minSends < MIN_SENDS_PER_VARIANT) {
            result.skipped.push({ stepId, reason: `min sends ${minSends} < ${MIN_SENDS_PER_VARIANT}` });
            continue;
        }

        // Sort by openRate desc; check the leader vs runner-up
        allMetrics.sort((a, b) => b.openRate - a.openRate);
        const winner = allMetrics[0]!;
        const runnerUp = allMetrics[1]!;
        const leadPct = winner.openRate - runnerUp.openRate;

        if (leadPct < MIN_LEAD_PCT) {
            result.skipped.push({
                stepId,
                reason: `lead ${leadPct.toFixed(1)}pp < ${MIN_LEAD_PCT}pp (${winner.label}=${winner.openRate.toFixed(1)}% vs ${runnerUp.label}=${runnerUp.openRate.toFixed(1)}%)`,
            });
            continue;
        }

        // Has the lead held for ≥48h? Use earliestSent of the winner as a proxy
        // (we don't track historical metrics; the campaign needs to have been
        // running for at least MIN_LEAD_HOURS to even be eligible).
        if (winner.earliestSent) {
            const hoursSinceFirstSend = (Date.now() - new Date(winner.earliestSent).getTime()) / 36e5;
            if (hoursSinceFirstSend < MIN_LEAD_HOURS) {
                result.skipped.push({
                    stepId,
                    reason: `running ${hoursSinceFirstSend.toFixed(1)}h < ${MIN_LEAD_HOURS}h soak`,
                });
                continue;
            }
        }

        // Promote: winner.weight = 100, all others = 0
        for (const m of allMetrics) {
            const target = m.id === winner.id ? 100 : 0;
            if (m.weight === target) continue;
            await supabase.from('campaign_variants').update({ weight: target }).eq('id', m.id);
        }

        // Audit log — best effort. activity_logs.action is a TEXT column, no enum.
        try {
            await supabase.from('activity_logs').insert({
                action: 'A_B_AUTO_PROMOTE',
                note: JSON.stringify({
                    step_id: stepId,
                    winner_label: winner.label,
                    winner_open_rate: Number(winner.openRate.toFixed(2)),
                    runner_up_label: runnerUp.label,
                    runner_up_open_rate: Number(runnerUp.openRate.toFixed(2)),
                    lead_pp: Number(leadPct.toFixed(2)),
                    sends_per_variant: allMetrics.map(m => ({ label: m.label, sends: m.sends })),
                }),
            });
        } catch (err) {
            console.error('[abPromote] failed to write audit row:', err);
        }

        console.log(
            `[abPromote] step ${stepId} → ${winner.label} won ` +
            `(${winner.openRate.toFixed(1)}% vs ${runnerUp.openRate.toFixed(1)}%, +${leadPct.toFixed(1)}pp)`
        );
        result.stepsPromoted++;
    }

    return result;
}
