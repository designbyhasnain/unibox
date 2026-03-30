import { supabase } from '../lib/supabase';

/**
 * Sales Automation Service (v2)
 * 5 automations to 5x sales:
 * 1. Auto follow-up sequences
 * 2. Hot lead detection (open tracking → WARM_LEAD)
 * 3. Re-engagement campaigns
 * 4. Best time to send optimization
 * 5. Lead scoring
 */

// ─── 1. Auto Follow-Up Logic ─────────────────────────────────────────────────

export interface FollowUpCandidate {
    contactId: string;
    contactEmail: string;
    contactName: string;
    lastSentAt: string;
    daysSinceLast: number;
    followupCount: number;
    openCount: number;
    pipelineStage: string;
    gmailAccountId: string;
}

/** Get contacts that need a follow-up email */
export async function getContactsNeedingFollowUp(
    daysSinceLast: number = 3,
    maxFollowups: number = 3
): Promise<FollowUpCandidate[]> {
    const { data, error } = await supabase.rpc('get_contacts_needing_followup', {
        p_days_since_last: daysSinceLast,
        p_max_followups: maxFollowups,
    });

    if (error) {
        console.error('[AutoFollowUp] RPC error:', error);
        return [];
    }

    return (data || []).map((r: any) => ({
        contactId: r.contact_id,
        contactEmail: r.contact_email,
        contactName: r.contact_name,
        lastSentAt: r.last_sent_at,
        daysSinceLast: r.days_since_last,
        followupCount: r.followup_count,
        openCount: r.open_count,
        pipelineStage: r.pipeline_stage,
        gmailAccountId: r.gmail_account_id,
    }));
}

/** Mark a contact's follow-up as sent */
export async function markFollowUpSent(contactId: string): Promise<void> {
    await supabase
        .from('contacts')
        .update({
            next_followup_at: null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', contactId);

    // Increment followup_count
    const { data } = await supabase
        .from('contacts')
        .select('followup_count')
        .eq('id', contactId)
        .single();

    if (data) {
        await supabase
            .from('contacts')
            .update({ followup_count: (data.followup_count || 0) + 1 })
            .eq('id', contactId);
    }
}

/** Get follow-up email templates based on follow-up number */
export function getFollowUpTemplate(followupNumber: number, contactName: string): {
    subject: string;
    body: string;
} {
    const name = contactName || 'there';

    switch (followupNumber) {
        case 0: // First follow-up (day 3)
            return {
                subject: 'Re: Quick follow up',
                body: `Hi ${name},\n\nJust wanted to circle back on my last note. I'd love to cut a free 30-second teaser from your recent work to show what we can do.\n\nWould you be open to that?\n\nBest`,
            };
        case 1: // Second follow-up (day 7)
            return {
                subject: 'Re: One more thought',
                body: `Hi ${name},\n\nI know you're busy — just wanted to share that we've helped filmmakers like you save 15+ hours per wedding on editing.\n\nHappy to chat whenever works for you.\n\nCheers`,
            };
        case 2: // Final follow-up (day 14, only if opened)
            return {
                subject: 'Re: Last one from me',
                body: `Hi ${name},\n\nI'll keep this short — if editing is ever something you'd like to outsource, we're here.\n\nNo pressure at all. Wishing you a great season ahead!\n\nBest`,
            };
        default:
            return {
                subject: 'Re: Following up',
                body: `Hi ${name},\n\nJust checking in. Let me know if you'd like to chat.\n\nBest`,
            };
    }
}

// ─── 2. Hot Lead Detection ───────────────────────────────────────────────────

/** Detect contacts who opened emails 2+ times but haven't replied → WARM_LEAD */
export async function detectWarmLeads(): Promise<number> {
    const { data, error } = await supabase.rpc('detect_warm_leads');
    if (error) {
        console.error('[WarmLeadDetection] RPC error:', error);
        return 0;
    }
    return data || 0;
}

// ─── 3. Re-Engagement ────────────────────────────────────────────────────────

/** Find stale contacts for re-engagement (no activity in 90+ days) */
export async function getReEngagementCandidates(staleDays: number = 90): Promise<any[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - staleDays);

    const { data } = await supabase
        .from('contacts')
        .select('id, name, email, pipeline_stage, last_email_at, open_count, lead_score')
        .in('pipeline_stage', ['CONTACTED', 'COLD_LEAD'])
        .lt('last_email_at', cutoff.toISOString())
        .gt('open_count', 0) // Only re-engage those who showed some interest
        .eq('auto_followup_enabled', true)
        .order('lead_score', { ascending: false })
        .limit(100);

    return data || [];
}

// ─── 4. Best Send Time ──────────────────────────────────────────────────────

/** Get optimal send times based on historical data */
export async function getBestSendTimes(accountIds?: string[]): Promise<{
    bestHours: { hour: number; opens: number; replies: number }[];
    bestDays: { day: number; dayName: string; opens: number; replies: number }[];
    avgOpenRate: number;
}> {
    const { data, error } = await supabase.rpc('get_best_send_times', {
        p_account_ids: accountIds || null,
    });

    if (error) {
        console.error('[BestSendTime] RPC error:', error);
        return { bestHours: [], bestDays: [], avgOpenRate: 0 };
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return {
        bestHours: (data?.bestHours || []).map((h: any) => ({
            hour: h.hour,
            opens: h.opens || 0,
            replies: h.replies || 0,
        })),
        bestDays: (data?.bestDays || []).map((d: any) => ({
            day: d.day,
            dayName: dayNames[d.day] || 'Unknown',
            opens: d.opens || 0,
            replies: d.replies || 0,
        })),
        avgOpenRate: data?.avgOpenRate || 0,
    };
}

// ─── 5. Lead Scoring ─────────────────────────────────────────────────────────

/** Recalculate lead scores for all active contacts */
export async function recalculateLeadScores(): Promise<number> {
    const { data, error } = await supabase.rpc('calculate_lead_scores');
    if (error) {
        console.error('[LeadScoring] RPC error:', error);
        return 0;
    }
    return data || 0;
}

/** Get top leads by score */
export async function getTopLeads(limit: number = 20): Promise<any[]> {
    const { data } = await supabase
        .from('contacts')
        .select('id, name, email, company, lead_score, open_count, pipeline_stage, last_email_at, last_opened_at')
        .gt('lead_score', 0)
        .order('lead_score', { ascending: false })
        .limit(limit);

    return data || [];
}

// ─── Cron Runner — call from /api/cron ───────────────────────────────────────

/** Run all automations (call every 6 hours via cron) */
export async function runAllAutomations(): Promise<{
    leadsScored: number;
    warmLeadsDetected: number;
    followUpCandidates: number;
}> {
    const [leadsScored, warmLeadsDetected, followUpCandidates] = await Promise.all([
        recalculateLeadScores(),
        detectWarmLeads(),
        getContactsNeedingFollowUp().then(c => c.length),
    ]);

    console.log(`[Automations] Scored: ${leadsScored}, Warm: ${warmLeadsDetected}, Follow-ups: ${followUpCandidates}`);

    return { leadsScored, warmLeadsDetected, followUpCandidates };
}
