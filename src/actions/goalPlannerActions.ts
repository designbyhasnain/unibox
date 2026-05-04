'use server';

import { ensureAuthenticated } from '../lib/safe-action';
import { blockEditorAccess, getAccessibleGmailAccountIds, getOwnerFilter } from '../utils/accessControl';
import { supabase } from '../lib/supabase';
import { generateGoalPlan, topRegionOf, type GoalPlan, type Scenario } from '../services/goalPlannerService';
import { createCampaignAction, enrollContactsAction, type CampaignStepInput } from './campaignActions';

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
