'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds } from '../utils/accessControl';

export type ActionItem = {
    id: string;
    contactId: string;
    name: string;
    email: string;
    company: string | null;
    phone: string | null;
    location: string | null;
    stage: string;
    actionType: 'REPLY_NOW' | 'FOLLOW_UP' | 'WIN_BACK' | 'NEW_LEAD' | 'STALE';
    urgency: 'critical' | 'high' | 'medium' | 'low';
    reason: string;
    daysSinceContact: number;
    totalEmailsSent: number;
    totalEmailsReceived: number;
    lastEmailSubject: string | null;
    lastEmailDirection: string | null;
    estimatedValue: number | null;
    leadScore: number | null;
};

const CONTACT_FIELDS = 'id, name, email, company, phone, location, pipeline_stage, days_since_last_contact, total_emails_sent, total_emails_received, estimated_value, lead_score, last_email_subject, last_message_direction';

export async function getActionQueueAction(): Promise<{
    actions: ActionItem[];
    counts: { critical: number; high: number; medium: number; low: number; total: number };
}> {
    const { userId, role } = await ensureAuthenticated();

    try {
    const accessible = await getAccessibleGmailAccountIds(userId, role);
    const accountIds = accessible === 'ALL' ? null : accessible;

    if (Array.isArray(accountIds) && accountIds.length === 0) {
        return { actions: [], counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 } };
    }

    const managerFilter = accountIds ? { account_manager_id: userId } : {};

    // 1. REPLY_NOW: They replied, you haven't responded
    let replyQuery = supabase
        .from('contacts')
        .select(CONTACT_FIELDS)
        .eq('last_message_direction', 'RECEIVED')
        .gt('total_emails_received', 0)
        .not('email', 'ilike', '%noreply%')
        .not('email', 'ilike', '%mailer-daemon%')
        .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED'])
        .order('days_since_last_contact', { ascending: true })
        .limit(30);
    if (accountIds) replyQuery = replyQuery.match(managerFilter);
    const { data: needReply } = await replyQuery;

    // 2. NEW_LEAD: Added in last 48h, never emailed
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    let newQuery = supabase
        .from('contacts')
        .select(CONTACT_FIELDS)
        .gte('created_at', twoDaysAgo)
        .eq('total_emails_sent', 0)
        .in('pipeline_stage', ['COLD_LEAD', 'LEAD'])
        .order('lead_score', { ascending: false })
        .limit(20);
    if (accountIds) newQuery = newQuery.match(managerFilter);
    const { data: newLeads } = await newQuery;

    // 3. FOLLOW_UP: You emailed, no reply, 3-14 days ago
    let followQuery = supabase
        .from('contacts')
        .select(CONTACT_FIELDS)
        .eq('last_message_direction', 'SENT')
        .eq('total_emails_received', 0)
        .gte('days_since_last_contact', 3)
        .lte('days_since_last_contact', 14)
        .gt('total_emails_sent', 0)
        .lte('total_emails_sent', 3)
        .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED'])
        .order('days_since_last_contact', { ascending: true })
        .limit(30);
    if (accountIds) followQuery = followQuery.match(managerFilter);
    const { data: needFollowUp } = await followQuery;

    // 4. WIN_BACK: Was engaged (5+ replies), went silent 30+ days
    let winQuery = supabase
        .from('contacts')
        .select(CONTACT_FIELDS)
        .gt('total_emails_received', 4)
        .gt('days_since_last_contact', 30)
        .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED'])
        .order('total_emails_received', { ascending: false })
        .limit(20);
    if (accountIds) winQuery = winQuery.match(managerFilter);
    const { data: winBack } = await winQuery;

    const actions: ActionItem[] = [];

    for (const c of needReply || []) {
        const days = c.days_since_last_contact || 0;
        actions.push({
            id: `reply-${c.id}`,
            contactId: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
            phone: c.phone,
            location: c.location,
            stage: c.pipeline_stage,
            actionType: 'REPLY_NOW',
            urgency: days <= 1 ? 'critical' : days <= 3 ? 'high' : 'medium',
            reason: days === 0 ? 'Replied today \u2014 respond now!' : `Replied ${days}d ago \u2014 don\u2019t lose momentum`,
            daysSinceContact: days,
            totalEmailsSent: c.total_emails_sent || 0,
            totalEmailsReceived: c.total_emails_received || 0,
            lastEmailSubject: c.last_email_subject,
            lastEmailDirection: c.last_message_direction,
            estimatedValue: c.estimated_value,
            leadScore: c.lead_score,
        });
    }

    for (const c of newLeads || []) {
        actions.push({
            id: `new-${c.id}`,
            contactId: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
            phone: c.phone,
            location: c.location,
            stage: c.pipeline_stage,
            actionType: 'NEW_LEAD',
            urgency: 'high',
            reason: 'New lead \u2014 send first outreach',
            daysSinceContact: c.days_since_last_contact || 0,
            totalEmailsSent: 0,
            totalEmailsReceived: 0,
            lastEmailSubject: null,
            lastEmailDirection: null,
            estimatedValue: c.estimated_value,
            leadScore: c.lead_score,
        });
    }

    for (const c of needFollowUp || []) {
        actions.push({
            id: `followup-${c.id}`,
            contactId: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
            phone: c.phone,
            location: c.location,
            stage: c.pipeline_stage,
            actionType: 'FOLLOW_UP',
            urgency: 'medium',
            reason: `No reply after ${c.total_emails_sent} email${(c.total_emails_sent || 0) > 1 ? 's' : ''} \u2014 follow up`,
            daysSinceContact: c.days_since_last_contact || 0,
            totalEmailsSent: c.total_emails_sent || 0,
            totalEmailsReceived: 0,
            lastEmailSubject: c.last_email_subject,
            lastEmailDirection: 'SENT',
            estimatedValue: c.estimated_value,
            leadScore: c.lead_score,
        });
    }

    for (const c of winBack || []) {
        actions.push({
            id: `winback-${c.id}`,
            contactId: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
            phone: c.phone,
            location: c.location,
            stage: c.pipeline_stage,
            actionType: 'WIN_BACK',
            urgency: 'low',
            reason: `Was active (${c.total_emails_received} replies), silent ${c.days_since_last_contact}d`,
            daysSinceContact: c.days_since_last_contact || 0,
            totalEmailsSent: c.total_emails_sent || 0,
            totalEmailsReceived: c.total_emails_received || 0,
            lastEmailSubject: c.last_email_subject,
            lastEmailDirection: c.last_message_direction,
            estimatedValue: c.estimated_value,
            leadScore: c.lead_score,
        });
    }

    // Sort: critical first, then high, medium, low
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    actions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    const counts = {
        critical: actions.filter(a => a.urgency === 'critical').length,
        high: actions.filter(a => a.urgency === 'high').length,
        medium: actions.filter(a => a.urgency === 'medium').length,
        low: actions.filter(a => a.urgency === 'low').length,
        total: actions.length,
    };

    return { actions, counts };

    } catch (error) {
        console.error('getActionQueueAction error:', error);
        return { actions: [], counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 } };
    }
}

export async function snoozeActionAction(contactId: string, days: number) {
    await ensureAuthenticated();
    try {
        const snoozeUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        const { error } = await supabase.from('contacts').update({ next_followup_at: snoozeUntil }).eq('id', contactId);
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('snoozeActionAction error:', error);
        return { success: false, error: 'Failed to snooze' };
    }
}

export async function markActionDoneAction(contactId: string) {
    await ensureAuthenticated();
    try {
        const { error } = await supabase.from('contacts').update({
            next_followup_at: null,
            auto_followup_enabled: false,
        }).eq('id', contactId);
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('markActionDoneAction error:', error);
        return { success: false, error: 'Failed to mark done' };
    }
}
