import 'server-only';
import { supabase } from '../lib/supabase';

/**
 * Goal tracking — read-only computation of progress against a persisted goal.
 *
 * The goal itself is owned by goalPlannerService (the planner inserts the row
 * inside `fireGoalPlanAction`). This module is the read side: given a goalId,
 * compute booked revenue, projected revenue, days remaining, etc., from the
 * downstream signal (projects attributed to contacts enrolled in the goal's
 * campaigns).
 *
 * Attribution chain (worth understanding before changing):
 *
 *   goal
 *     └─ campaigns where goal_id = :goalId
 *          └─ campaign_contacts (the contact list at fire-time)
 *               └─ contacts
 *                    └─ projects where contact_id = ... AND created_at >= goal.created_at
 *                         └─ project.project_value  (or paid amount, if paid_status indicates)
 *
 * We count a project as "booked" once it's in the projects table, regardless
 * of paid_status — that matches the Hormozi "booked = signed contract", not
 * "money in the bank". Use `bookedPaid` if you want the cash version.
 *
 * Edge cases:
 *  • A contact enrolled twice (across multiple campaigns of the same goal)
 *    must only count once. We DISTINCT on contact_id.
 *  • A project linked to a contact who joined this goal's campaign list AFTER
 *    the project was booked → still counts (the rep deserves credit for
 *    sourcing the contact). Hormozi: attribution by enrollment, not by date
 *    of booking.
 *  • Goal with 0 campaigns yet → returns zeros gracefully.
 */

export type GoalProgress = {
    goalId: string;
    targetAmount: number;
    deadline: string;          // ISO date
    daysRemaining: number;     // 0 if past deadline
    daysElapsed: number;       // since goal created
    booked: number;            // sum of project_value across attributed projects
    bookedPaid: number;        // sum of paid amounts (subset of booked)
    projected: number;         // linear forecast: booked / daysElapsed × totalDays
    pctOfTarget: number;       // 0–1, capped at 1
    onTrack: boolean;          // projected ≥ target
    campaignsFired: number;
    contactsReached: number;
    repliesIn: number;         // count of contacts with status=REPLIED across campaigns
    sendsOut: number;          // sum of campaign_send_queue rows status=SENT
    status: 'ACTIVE' | 'ACHIEVED' | 'EXPIRED' | 'CANCELLED';
};

/**
 * The single active goal for a user. Returns null if the user hasn't fired a
 * goal yet (or only has closed-out historical goals).
 */
export async function getActiveGoal(userId: string): Promise<{
    id: string;
    user_id: string;
    target_amount: number;
    deadline: string;
    status: string;
    created_at: string;
    achieved_at: string | null;
} | null> {
    const { data, error } = await supabase
        .from('goals')
        .select('id, user_id, target_amount, deadline, status, created_at, achieved_at')
        .eq('user_id', userId)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) {
        // Most likely "relation does not exist" — the migration hasn't run yet.
        // Treat as no active goal so the dashboard card hides gracefully.
        if ((error as any).code === '42P01' || /relation .* does not exist/i.test(error.message)) {
            return null;
        }
        console.error('[goalTracking] getActiveGoal error:', error);
        return null;
    }
    return data as any;
}

/**
 * Compute booked + projected + counters for a goal. Cheap reads only — meant
 * to be called from a dashboard fetch, not a tight loop.
 */
export async function computeGoalProgress(goalId: string): Promise<GoalProgress | null> {
    const goal = await fetchGoalById(goalId);
    if (!goal) return null;

    // 1. Campaigns under this goal.
    const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id')
        .eq('goal_id', goalId);
    const campaignIds = (campaigns ?? []).map((c: any) => c.id as string);

    if (campaignIds.length === 0) {
        return summariseEmptyGoal(goal);
    }

    // 2. Contacts enrolled across those campaigns. DISTINCT so a contact
    // re-enrolled across scenarios doesn't double-count.
    const contactIdSet = new Set<string>();
    let repliesIn = 0;
    let off = 0;
    while (true) {
        const { data, error } = await supabase
            .from('campaign_contacts')
            .select('contact_id, status')
            .in('campaign_id', campaignIds)
            .range(off, off + 999);
        if (error || !data || data.length === 0) break;
        for (const row of data) {
            if (row.contact_id) contactIdSet.add(row.contact_id as string);
            if (row.status === 'REPLIED') repliesIn++;
        }
        if (data.length < 1000) break;
        off += 1000;
    }
    const contactIds = [...contactIdSet];

    // 3. Projects attributed — those whose contact landed in our enrollment
    // set AND were booked after the goal opened.
    let booked = 0;
    let bookedPaid = 0;
    if (contactIds.length > 0) {
        // PostgREST has a practical IN-list limit; chunk into 1k batches.
        const CHUNK = 1000;
        for (let i = 0; i < contactIds.length; i += CHUNK) {
            const slice = contactIds.slice(i, i + CHUNK);
            const { data: projects } = await supabase
                .from('projects')
                .select('project_value, paid, paid_status')
                .in('contact_id', slice)
                .gte('created_at', goal.created_at);
            for (const p of projects ?? []) {
                const value = Number(p.project_value) || 0;
                booked += value;
                const paid = Number(p.paid) || 0;
                // `paid` is the typed amount; some rows just set paid_status without paid.
                if (paid > 0) bookedPaid += paid;
                else if (p.paid_status === 'PAID') bookedPaid += value;
            }
        }
    }

    // 4. Sends out — what's actually left the building.
    let sendsOut = 0;
    {
        const { count } = await supabase
            .from('campaign_send_queue')
            .select('id', { count: 'exact', head: true })
            .in('campaign_id', campaignIds)
            .eq('status', 'SENT');
        sendsOut = count ?? 0;
    }

    // 5. Time math.
    const now = Date.now();
    const created = new Date(goal.created_at).getTime();
    const deadline = new Date(goal.deadline).getTime();
    const totalMs = Math.max(1, deadline - created);
    const elapsedMs = Math.max(0, now - created);
    const remainingMs = Math.max(0, deadline - now);
    const daysElapsed = Math.max(0.001, elapsedMs / 86_400_000);
    const totalDays = totalMs / 86_400_000;
    const daysRemaining = Math.ceil(remainingMs / 86_400_000);

    // Linear forecast: simplest defensible. Future v2 could weight by reply
    // velocity, but for v1 booked/elapsed × total is honest enough.
    const projected = (booked / daysElapsed) * totalDays;

    const target = Number(goal.target_amount);
    return {
        goalId: goal.id,
        targetAmount: target,
        deadline: goal.deadline,
        daysRemaining,
        daysElapsed: Math.floor(daysElapsed),
        booked: round2(booked),
        bookedPaid: round2(bookedPaid),
        projected: round2(projected),
        pctOfTarget: Math.min(1, booked / target),
        onTrack: projected >= target,
        campaignsFired: campaignIds.length,
        contactsReached: contactIds.length,
        repliesIn,
        sendsOut,
        status: goal.status as any,
    };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchGoalById(goalId: string) {
    const { data, error } = await supabase
        .from('goals')
        .select('id, user_id, target_amount, deadline, status, created_at, achieved_at')
        .eq('id', goalId)
        .maybeSingle();
    if (error) {
        if ((error as any).code === '42P01' || /relation .* does not exist/i.test(error.message)) {
            return null;
        }
        console.error('[goalTracking] fetchGoalById error:', error);
        return null;
    }
    return data as any;
}

function summariseEmptyGoal(goal: any): GoalProgress {
    const now = Date.now();
    const created = new Date(goal.created_at).getTime();
    const deadline = new Date(goal.deadline).getTime();
    const daysRemaining = Math.max(0, Math.ceil((deadline - now) / 86_400_000));
    const daysElapsed = Math.max(0, Math.floor((now - created) / 86_400_000));
    return {
        goalId: goal.id,
        targetAmount: Number(goal.target_amount),
        deadline: goal.deadline,
        daysRemaining,
        daysElapsed,
        booked: 0,
        bookedPaid: 0,
        projected: 0,
        pctOfTarget: 0,
        onTrack: false,
        campaignsFired: 0,
        contactsReached: 0,
        repliesIn: 0,
        sendsOut: 0,
        status: goal.status,
    };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
