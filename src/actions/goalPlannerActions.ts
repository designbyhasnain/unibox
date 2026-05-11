'use server';

import { ensureAuthenticated } from '../lib/safe-action';
import { blockEditorAccess, getAccessibleGmailAccountIds, getOwnerFilter } from '../utils/accessControl';
import { supabase } from '../lib/supabase';
import { generateGoalPlan, topRegionOf, type GoalPlan, type Scenario } from '../services/goalPlannerService';
import {
    createCampaignAction,
    enrollContactsAction,
    launchCampaignAction,
    updateCampaignOptionsAction,
    type CampaignStepInput,
} from './campaignActions';

/**
 * Generate a goal-driven campaign plan for the calling user.
 *
 * Read-only: produces scenario projections; does not write to the DB.
 * The "Build drafts" step is a separate action that wraps createCampaignAction.
 */
export async function generateGoalPlanAction(input: {
    goalAmount: number;
    deadlineISO: string;
}): Promise<{ success: true; plan: GoalPlan } | { success: false; error: string }> {
    try {
        const { userId, role } = await ensureAuthenticated();
        blockEditorAccess(role);

        if (!Number.isFinite(input.goalAmount) || input.goalAmount <= 0) {
            return { success: false, error: 'Goal amount must be a positive number.' };
        }
        const deadline = new Date(input.deadlineISO);
        if (Number.isNaN(deadline.getTime())) {
            return { success: false, error: 'Invalid deadline.' };
        }
        const days = (deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        if (days < 3) {
            return { success: false, error: 'Deadline must be at least 3 days from now.' };
        }
        if (days > 365) {
            return { success: false, error: 'Deadline must be within the next 12 months.' };
        }

        const plan = await generateGoalPlan({
            userId,
            role,
            goalAmount: input.goalAmount,
            deadlineISO: input.deadlineISO,
            tenantNiche: 'wedding_filmmakers', // v1 — see spec §8 for SaaS-future seam
        });

        return { success: true, plan };
    } catch (err: any) {
        console.error('[goalPlanner] generateGoalPlanAction error:', err);
        return { success: false, error: err?.message || 'Failed to generate plan.' };
    }
}

// ─── Build drafts ────────────────────────────────────────────────────────────

const DEFAULT_STEPS: CampaignStepInput[] = [
    {
        stepNumber: 1,
        delayDays: 0,
        subject: 'Quick question about your wedding films',
        body:
            'Hi {{first_name}},\n\nI came across your work and the storytelling really stood out. ' +
            'We help wedding filmmakers like you bring delivery times down without sacrificing quality.\n\n' +
            'Worth a 10-minute conversation?\n\nBest,\n{{sender_name}}',
    },
    {
        stepNumber: 2,
        delayDays: 3,
        subject: 'Re: Quick question about your wedding films',
        body:
            'Hi {{first_name}},\n\nFollowing up — I know things get busy in season. ' +
            'No pressure, but happy to share a sample reel of what we built for someone in your ' +
            'space recently. Want me to send it over?\n\n— {{sender_name}}',
        isSubsequence: true,
        subsequenceTrigger: 'OPENED_NO_REPLY',
        parentStepNumber: 1,
    },
    {
        stepNumber: 3,
        delayDays: 7,
        subject: 'Last note',
        body:
            'Hi {{first_name}},\n\nI\'ll stop following up after this. If editing turnaround is ' +
            'ever a bottleneck for you, just reply with a single word and I\'ll get back to you.\n\n— {{sender_name}}',
        isSubsequence: true,
        subsequenceTrigger: 'OPENED_NO_REPLY',
        parentStepNumber: 2,
    },
];

/**
 * Pick the first ACTIVE Gmail account the user has access to.
 * v1: just uses the first available; v1.5 should round-robin across capacity.
 */
async function pickSendingAccount(userId: string, role: string): Promise<string | null> {
    const accessible = await getAccessibleGmailAccountIds(userId, role);
    let query = supabase.from('gmail_accounts').select('id').eq('status', 'ACTIVE');
    if (accessible !== 'ALL') {
        if (accessible.length === 0) return null;
        query = query.in('id', accessible);
    }
    const { data } = await query.limit(1).maybeSingle();
    return data?.id ?? null;
}

/**
 * Pick the least-recently-loaded Gmail account from the user's accessible pool.
 * Used by `fireGoalPlanAction` to rotate across scenarios in one batch — when
 * firing 3 campaigns simultaneously they should land on 3 different accounts,
 * not pile on the same one.
 *
 * Selection rule (decided in plan):
 *  • Filter to status=ACTIVE accounts the user has access to.
 *  • Skip any in `excludeIds` (so each scenario in the same fire gets a fresh
 *    account, falling back to round-robin reuse if the pool is exhausted).
 *  • Order by sent_count_today ASC — picks the account with the lowest daily
 *    usage so today's load spreads evenly. Tie-break on created_at ASC for
 *    determinism.
 *  • Returns null when there isn't a single usable account — caller surfaces
 *    that as a per-scenario error.
 *
 * No warm-only filter — user opted for max throughput, cold accounts ride
 * along. If deliverability becomes an issue, swap to `warmup_enabled=true`
 * filter here.
 */
async function pickFreshestAccount(
    userId: string,
    role: string,
    excludeIds: Set<string>,
): Promise<string | null> {
    const accessible = await getAccessibleGmailAccountIds(userId, role);
    let query = supabase
        .from('gmail_accounts')
        .select('id, sent_count_today, created_at')
        .eq('status', 'ACTIVE')
        .order('sent_count_today', { ascending: true })
        .order('created_at', { ascending: true });
    if (accessible !== 'ALL') {
        if (accessible.length === 0) return null;
        query = query.in('id', accessible);
    }
    const { data } = await query.limit(50);
    if (!data || data.length === 0) return null;
    // First try a fresh (un-used-this-batch) account; if all are used, allow
    // reuse so we don't fail the whole fire just because the user has fewer
    // accounts than scenarios.
    const fresh = data.find((a: any) => !excludeIds.has(a.id));
    return (fresh ?? data[0])?.id ?? null;
}

/**
 * Build the global "do not contact" set across the entire `campaign_contacts`
 * table — anyone who EVER unsubscribed, bounced, or hit an auto-reply on any
 * prior campaign. Treated as a permanent global block, not per-campaign.
 *
 * Done as one query (paginated) up-front so each scenario doesn't refetch.
 */
async function fetchDoNotContactSet(): Promise<Set<string>> {
    const blocked = new Set<string>();
    let offset = 0;
    while (true) {
        const { data, error } = await supabase
            .from('campaign_contacts')
            .select('contact_id, unsubscribed_at, bounced_at, is_auto_reply')
            .or('unsubscribed_at.not.is.null,bounced_at.not.is.null,is_auto_reply.eq.true')
            .range(offset, offset + 999);
        if (error) {
            console.error('[goalPlanner] fetchDoNotContactSet error:', error);
            break;
        }
        if (!data || data.length === 0) break;
        for (const row of data) {
            if (row.contact_id) blocked.add(row.contact_id);
        }
        if (data.length < 1000) break;
        offset += 1000;
    }
    return blocked;
}

/**
 * Resolve the contact IDs that match a scenario by re-querying the contacts table.
 * Mirrors the same filters used in the scenario builders so the campaign enrols
 * exactly the population the projection counted.
 *
 * v1: caps at 1000 per scenario to keep the campaign sane. The capacity allocator
 * limits sends-per-day; this just bounds the enrollment list.
 *
 * `blocked` is the cross-scenario "do-not-contact" set produced by
 * fetchDoNotContactSet — anyone who has ever unsubscribed, bounced, or
 * triggered an auto-reply.
 */
async function resolveScenarioContactIds(
    scenario: Scenario,
    userId: string,
    role: string,
    blocked: Set<string>
): Promise<string[]> {
    const ownerId = getOwnerFilter(userId, role);
    const cap = Math.min(scenario.poolMax || 1000, 1000);

    const select =
        'id, location, pipeline_stage, is_client, lead_score, followup_count, days_since_last_contact, last_email_at';

    // Stages that are HARD-EXCLUDED from any campaign-build path. Mirrors the
    // isDoNotContact() rule in goalPlannerService — kept separate here so a
    // change in the planner doesn't silently start enrolling closed deals.
    const DO_NOT_CONTACT_STAGES = ['CLOSED', 'OFFER_ACCEPTED', 'NOT_INTERESTED'];

    if (scenario.kind === 'REGION_TOP') {
        // Region label is the top region (e.g. "USA", "California").
        // For COLD outreach the eligible stages are NULL or COLD_LEAD only.
        let query = supabase
            .from('contacts')
            .select(select)
            .ilike('location', `%${scenario.label}%`)
            .eq('is_client', false)
            .or('pipeline_stage.is.null,pipeline_stage.eq.COLD_LEAD');
        if (ownerId) query = query.eq('account_manager_id', ownerId);
        // Over-fetch ×3 so the post-filter (region exactness + blocked set) leaves enough.
        const { data } = await query.limit(cap * 3);
        if (!data) return [];
        return data
            .filter(
                (c: any) =>
                    !blocked.has(c.id) &&
                    (!c.last_email_at || (c.days_since_last_contact ?? 999) > 30) &&
                    topRegionOf(c.location) === scenario.label
            )
            .slice(0, cap)
            .map((c: any) => c.id as string);
    }

    if (scenario.kind === 'DORMANT_REENGAGEMENT') {
        let query = supabase
            .from('contacts')
            .select(select)
            .in('pipeline_stage', ['CONTACTED', 'COLD_LEAD'])
            .eq('is_client', false)
            .gt('days_since_last_contact', 180);
        if (ownerId) query = query.eq('account_manager_id', ownerId);
        const { data } = await query.limit(cap * 2);
        return (data ?? [])
            .filter(
                (c: any) =>
                    !blocked.has(c.id) &&
                    !DO_NOT_CONTACT_STAGES.includes(c.pipeline_stage)
            )
            .slice(0, cap)
            .map((c: any) => c.id as string);
    }

    if (scenario.kind === 'FOLLOWUP_DEPTH') {
        // In-flight conversations only — never closed/offered/not-interested.
        let query = supabase
            .from('contacts')
            .select(select)
            .in('pipeline_stage', ['CONTACTED', 'WARM_LEAD', 'LEAD'])
            .eq('is_client', false)
            .gte('lead_score', 50)
            .lt('followup_count', 3);
        if (ownerId) query = query.eq('account_manager_id', ownerId);
        const { data } = await query.limit(cap * 2);
        return (data ?? [])
            .filter((c: any) => !blocked.has(c.id))
            .slice(0, cap)
            .map((c: any) => c.id as string);
    }

    // SCRAPE_NEEDED has no existing contacts to enrol — caller filters these out.
    return [];
}

function scenarioGoal(scenario: Scenario): 'COLD_OUTREACH' | 'FOLLOW_UP' | 'RETARGETING' {
    if (scenario.kind === 'DORMANT_REENGAGEMENT') return 'RETARGETING';
    if (scenario.kind === 'FOLLOWUP_DEPTH') return 'FOLLOW_UP';
    return 'COLD_OUTREACH';
}

function scenarioCampaignName(scenario: Scenario, deadlineISO: string): string {
    const dateTag = new Date(deadlineISO).toISOString().slice(0, 10);
    switch (scenario.kind) {
        case 'REGION_TOP':
            return `${scenario.label} cold outreach · auto · ${dateTag}`;
        case 'DORMANT_REENGAGEMENT':
            return `Re-engage dormant · auto · ${dateTag}`;
        case 'FOLLOWUP_DEPTH':
            return `Follow-up depth boost · auto · ${dateTag}`;
        case 'SCRAPE_NEEDED':
            return `Scrape needed: ${scenario.label} · auto · ${dateTag}`;
    }
}

export type BuildResult = {
    scenarioId: string;
    scenarioLabel: string;
    success: boolean;
    campaignId?: string;
    enrolled?: number;
    error?: string;
};

export type BuildSummary = {
    blockedCount: number; // size of the global do-not-contact set used during build
};

/**
 * Materialise selected scenarios as DRAFT campaigns. One campaign per scenario.
 * Returns per-scenario result so partial-success can be surfaced in the UI.
 */
export async function buildCampaignsFromPlanAction(input: {
    scenarios: Scenario[];
    deadlineISO: string;
    dailySendLimit?: number;
}): Promise<
    | { success: true; results: BuildResult[]; summary: BuildSummary }
    | { success: false; error: string }
> {
    try {
        const { userId, role } = await ensureAuthenticated();
        blockEditorAccess(role);

        if (!input.scenarios || input.scenarios.length === 0) {
            return { success: false, error: 'No scenarios selected.' };
        }

        const sendingAccountId = await pickSendingAccount(userId, role);
        if (!sendingAccountId) {
            return {
                success: false,
                error:
                    'No active Gmail accounts available. Ask your admin to assign one before building drafts.',
            };
        }

        // Build the global do-not-contact set ONCE up-front so each scenario
        // doesn't re-query. Anyone who has ever unsubscribed, bounced, or
        // triggered an auto-reply on any prior campaign is permanently blocked.
        const blocked = await fetchDoNotContactSet();

        const results: BuildResult[] = [];
        for (const scenario of input.scenarios) {
            // Skip blocker-only scenarios (e.g. SCRAPE_NEEDED): they have nothing to enrol.
            if (scenario.blocker) {
                results.push({
                    scenarioId: scenario.id,
                    scenarioLabel: scenario.label,
                    success: false,
                    error: `Skipped — ${scenario.blocker}`,
                });
                continue;
            }

            const contactIds = await resolveScenarioContactIds(scenario, userId, role, blocked);
            if (contactIds.length === 0) {
                results.push({
                    scenarioId: scenario.id,
                    scenarioLabel: scenario.label,
                    success: false,
                    error: 'No contacts matched the scenario filter.',
                });
                continue;
            }

            const created = await createCampaignAction({
                name: scenarioCampaignName(scenario, input.deadlineISO),
                goal: scenarioGoal(scenario),
                sendingGmailAccountId: sendingAccountId,
                dailySendLimit: input.dailySendLimit ?? 50,
                trackReplies: true,
                autoStopOnReply: true,
                steps: DEFAULT_STEPS,
            });

            if (!created.success || !created.campaignId) {
                results.push({
                    scenarioId: scenario.id,
                    scenarioLabel: scenario.label,
                    success: false,
                    error: created.error || 'Failed to create campaign.',
                });
                continue;
            }

            const enrolled = await enrollContactsAction(created.campaignId, contactIds);
            if (!enrolled.success) {
                results.push({
                    scenarioId: scenario.id,
                    scenarioLabel: scenario.label,
                    success: false,
                    campaignId: created.campaignId,
                    error: enrolled.error || 'Campaign created, but enrollment failed.',
                });
                continue;
            }

            results.push({
                scenarioId: scenario.id,
                scenarioLabel: scenario.label,
                success: true,
                campaignId: created.campaignId,
                enrolled: enrolled.enrolled ?? contactIds.length,
            });
        }

        return { success: true, results, summary: { blockedCount: blocked.size } };
    } catch (err: any) {
        console.error('[goalPlanner] buildCampaignsFromPlanAction error:', err);
        return { success: false, error: err?.message || 'Failed to build drafts.' };
    }
}

// ─── Fire (Phase A: build + launch in one click) ─────────────────────────────

export type FireResult = BuildResult & {
    launched: boolean;
    sendingAccountId?: string;
    dailySendLimit?: number;
};

export type FireSummary = BuildSummary & {
    fired: number;            // how many campaigns successfully launched
    accountsUsed: string[];   // distinct gmail_account_ids used in this fire
    totalDailySends: number;  // summed daily_send_limit across launched campaigns
};

/**
 * Phase A — one-button launch.
 *
 * Replaces the legacy "build draft, then go configure schedule + launch in
 * /campaigns" flow with: pick scenarios → click Fire → campaigns are live
 * within the next cron tick. Uses the existing primitives end-to-end so
 * nothing about the send pipeline changes:
 *
 *   createCampaignAction    →  inserts DRAFT row + steps + variants
 *   updateCampaignOptionsAction  →  schedule + email_gap_minutes + cap
 *   enrollContactsAction    →  PENDING rows in campaign_contacts
 *   launchCampaignAction    →  validates ≥1 step + ≥1 contact, transitions
 *                              to RUNNING, sets next_send_at via
 *                              getNextValidSendTime() in campaignActions.ts
 *
 * Defaults applied (decided in plan):
 *   • Sending account: least-loaded ACTIVE account from the rep's pool,
 *     rotated across scenarios so 3 fires hit 3 different accounts.
 *   • Daily send limit: scenario.sendsAllocated / days, clamped 10–100.
 *   • Schedule: Mon–Fri, 09:00–17:00, UTC (per-user TZ deferred).
 *   • email_gap_minutes: 10 (matches existing default).
 *   • Existing CampaignOptions defaults inherited for everything else.
 *
 * Per-scenario errors don't abort the whole fire — they're returned in the
 * per-result list so the UI can show partial success.
 */
export async function fireGoalPlanAction(input: {
    scenarios: Scenario[];
    deadlineISO: string;
    daysUntilDeadline: number;
    /** Per Phase B — the planner passes the original goal amount so we can
     *  persist a `goals` row before launching. Optional for backwards-compat
     *  with any caller that hasn't migrated. */
    goalAmount?: number;
}): Promise<
    | { success: true; results: FireResult[]; summary: FireSummary; goalId?: string | null }
    | { success: false; error: string }
> {
    try {
        const { userId, role } = await ensureAuthenticated();
        blockEditorAccess(role);

        if (!input.scenarios || input.scenarios.length === 0) {
            return { success: false, error: 'No scenarios selected.' };
        }

        const days = Math.max(1, Math.floor(input.daysUntilDeadline || 30));
        const blocked = await fetchDoNotContactSet();
        const usedAccountIds = new Set<string>();
        const results: FireResult[] = [];

        // Phase B: persist the goal so the dashboard card has something to
        // read. Best-effort — if the `goals` table doesn't exist yet (migration
        // not run), we log and continue without a goalId. Campaigns still fire
        // exactly the same; the persistence layer is a separate concern.
        let goalId: string | null = null;
        if (typeof input.goalAmount === 'number' && input.goalAmount > 0) {
            try {
                // Close any prior ACTIVE goal first — the partial unique
                // index on (user_id) WHERE status='ACTIVE' would block the
                // insert otherwise.
                await supabase
                    .from('goals')
                    .update({ status: 'CANCELLED' })
                    .eq('user_id', userId)
                    .eq('status', 'ACTIVE');
                const { data: inserted, error: insErr } = await supabase
                    .from('goals')
                    .insert({
                        user_id: userId,
                        target_amount: input.goalAmount,
                        deadline: input.deadlineISO.slice(0, 10), // DATE column
                        status: 'ACTIVE',
                    })
                    .select('id')
                    .single();
                if (insErr) {
                    if ((insErr as any).code === '42P01' || /relation .* does not exist/i.test(insErr.message)) {
                        console.warn('[goalPlanner] goals table missing — skipping persistence. Run prisma/goals_migration.sql.');
                    } else {
                        console.warn('[goalPlanner] could not persist goal:', insErr.message);
                    }
                } else {
                    goalId = (inserted as any)?.id ?? null;
                }
            } catch (err) {
                console.warn('[goalPlanner] goal persistence failed (non-fatal):', err);
            }
        }

        for (const scenario of input.scenarios) {
            // Blocker scenarios (e.g. SCRAPE_NEEDED) have nothing to enrol.
            if (scenario.blocker) {
                results.push({
                    scenarioId: scenario.id,
                    scenarioLabel: scenario.label,
                    success: false,
                    launched: false,
                    error: `Skipped — ${scenario.blocker}`,
                });
                continue;
            }

            // 1. Resolve contacts.
            const contactIds = await resolveScenarioContactIds(scenario, userId, role, blocked);
            if (contactIds.length === 0) {
                results.push({
                    scenarioId: scenario.id,
                    scenarioLabel: scenario.label,
                    success: false,
                    launched: false,
                    error: 'No contacts matched the scenario filter.',
                });
                continue;
            }

            // 2. Pick a sending account fresh to this fire batch.
            const sendingAccountId = await pickFreshestAccount(userId, role, usedAccountIds);
            if (!sendingAccountId) {
                results.push({
                    scenarioId: scenario.id,
                    scenarioLabel: scenario.label,
                    success: false,
                    launched: false,
                    error: 'No active Gmail accounts available. Ask Admin to assign one.',
                });
                continue;
            }
            usedAccountIds.add(sendingAccountId);

            // 3. Spread the allocated sends across the goal window.
            const dailyRate = Math.min(
                100,
                Math.max(10, Math.ceil(scenario.sendsAllocated / days)),
            );

            // 4. Create DRAFT.
            const created = await createCampaignAction({
                name: scenarioCampaignName(scenario, input.deadlineISO),
                goal: scenarioGoal(scenario),
                sendingGmailAccountId: sendingAccountId,
                dailySendLimit: dailyRate,
                trackReplies: true,
                autoStopOnReply: true,
                steps: DEFAULT_STEPS,
            });
            if (!created.success || !created.campaignId) {
                results.push({
                    scenarioId: scenario.id,
                    scenarioLabel: scenario.label,
                    success: false,
                    launched: false,
                    error: created.error || 'Failed to create campaign.',
                });
                continue;
            }

            // 4b. Stamp goal_id on the new campaign so the progress card can
            // attribute downstream projects. Best-effort — if the column
            // doesn't exist yet (migration not run), log and continue. The
            // campaign still fires successfully without the link; it just
            // won't show in the dashboard goal card.
            if (goalId) {
                const { error: linkErr } = await supabase
                    .from('campaigns')
                    .update({ goal_id: goalId })
                    .eq('id', created.campaignId);
                if (linkErr) {
                    if (!/column .* does not exist/i.test(linkErr.message)) {
                        console.warn('[goalPlanner] could not stamp goal_id on campaign:', linkErr.message);
                    }
                }
            }

            // 5. Apply schedule + spacing defaults via the generic options
            // updater. dailySendLimit already set on create, but pass it
            // again so the campaign row reflects the planner's allocation
            // unambiguously.
            await updateCampaignOptionsAction(created.campaignId, {
                schedule_enabled: true,
                schedule_days: [1, 2, 3, 4, 5],     // Mon–Fri
                schedule_start_time: '09:00',
                schedule_end_time: '17:00',
                schedule_timezone: 'UTC',
                email_gap_minutes: 10,
                daily_send_limit: dailyRate,
            });

            // 6. Enrol.
            const enrolled = await enrollContactsAction(created.campaignId, contactIds);
            if (!enrolled.success) {
                results.push({
                    scenarioId: scenario.id,
                    scenarioLabel: scenario.label,
                    success: false,
                    launched: false,
                    campaignId: created.campaignId,
                    sendingAccountId,
                    dailySendLimit: dailyRate,
                    error: enrolled.error || 'Campaign created, but enrollment failed.',
                });
                continue;
            }

            // 7. Launch — DRAFT → RUNNING, contacts PENDING → IN_PROGRESS.
            const launched = await launchCampaignAction(created.campaignId);
            if (!launched.success) {
                // Campaign + contacts exist; rep can launch manually from /campaigns.
                results.push({
                    scenarioId: scenario.id,
                    scenarioLabel: scenario.label,
                    success: true,
                    launched: false,
                    campaignId: created.campaignId,
                    enrolled: enrolled.enrolled ?? contactIds.length,
                    sendingAccountId,
                    dailySendLimit: dailyRate,
                    error: `Enrolled ${enrolled.enrolled} but launch failed: ${launched.error}. Open the campaign and click Launch.`,
                });
                continue;
            }

            results.push({
                scenarioId: scenario.id,
                scenarioLabel: scenario.label,
                success: true,
                launched: true,
                campaignId: created.campaignId,
                enrolled: enrolled.enrolled ?? contactIds.length,
                sendingAccountId,
                dailySendLimit: dailyRate,
            });
        }

        const fired = results.filter(r => r.launched).length;
        const totalDailySends = results
            .filter(r => r.launched)
            .reduce((sum, r) => sum + (r.dailySendLimit ?? 0), 0);

        return {
            success: true,
            results,
            summary: {
                blockedCount: blocked.size,
                fired,
                accountsUsed: [...usedAccountIds],
                totalDailySends,
            },
            goalId,
        };
    } catch (err: any) {
        console.error('[goalPlanner] fireGoalPlanAction error:', err);
        return { success: false, error: err?.message || 'Failed to fire goal plan.' };
    }
}
