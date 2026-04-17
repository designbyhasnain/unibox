'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { computeContactHabit } from '../utils/clientHabits';
import { getOwnerFilter, blockEditorAccess } from '../utils/accessControl';

export async function getContactDetailAction(contactId: string) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);

    const ownerFilter = getOwnerFilter(userId, role);
    let contactQuery = supabase.from('contacts').select('*').eq('id', contactId);
    if (ownerFilter) contactQuery = contactQuery.eq('account_manager_id', ownerFilter);
    const contactRes = await contactQuery.maybeSingle();
    if (contactRes.error || !contactRes.data) return null;

    // Try fetching emails by contact_id (fast path), fall back to email address match
    let emailsRes = await supabase.from('email_messages')
        .select('id, subject, from_email, to_email, direction, sent_at, snippet, body, is_unread, thread_id, gmail_account_id')
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false })
        .limit(100);

    // Trigger fallback if:
    // 1. Zero emails found by contact_id, OR
    // 2. The contact's stored stats indicate many more emails exist than we found
    //    (common case: emails are linked to a different contact_id due to sync race conditions)
    const expectedTotal = (contactRes.data.total_emails_sent || 0) + (contactRes.data.total_emails_received || 0);
    const foundCount = emailsRes.data?.length || 0;
    const needsFallback = contactRes.data.email && (foundCount === 0 || foundCount < expectedTotal * 0.5);

    if (needsFallback) {
        const emailFields = 'id, subject, from_email, to_email, direction, sent_at, snippet, body, is_unread, thread_id, gmail_account_id';
        const emailPattern = `%${contactRes.data.email}%`;

        const [fromRes, toRes] = await Promise.all([
            supabase.from('email_messages')
                .select(emailFields)
                .ilike('from_email', emailPattern)
                .order('sent_at', { ascending: false })
                .limit(100),
            supabase.from('email_messages')
                .select(emailFields)
                .ilike('to_email', emailPattern)
                .order('sent_at', { ascending: false })
                .limit(100),
        ]);

        // Merge and deduplicate
        const merged = [...(fromRes.data || []), ...(toRes.data || [])];
        const seen = new Set<string>();
        const unique = merged.filter((e: any) => {
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
        });
        unique.sort((a: any, b: any) => new Date(b.sent_at || 0).getTime() - new Date(a.sent_at || 0).getTime());
        emailsRes = { data: unique.slice(0, 100), error: null } as typeof emailsRes;

        // Self-heal: backfill contact_id on orphan rows
        if (unique.length > 0) {
            const ids = unique.map((e: any) => e.id);
            void supabase
                .from('email_messages')
                .update({ contact_id: contactId })
                .in('id', ids)
                .is('contact_id', null)
                .then();
        }
    }

    // Fetch projects and activity in parallel
    const [projectsRes, activityRes] = await Promise.all([
        supabase.from('projects')
            .select('id, project_name, status, paid_status, project_value, total_amount, project_date, account_manager')
            .eq('client_id', contactId)
            .order('project_date', { ascending: false }),
        supabase.from('activity_logs')
            .select('id, action, details, created_at')
            .eq('contact_id', contactId)
            .order('created_at', { ascending: false })
            .limit(50),
    ]);

    // Aggregate email stats
    const emails = emailsRes.data || [];
    const sent = emails.filter((e: any) => e.direction === 'SENT').length;
    const received = emails.filter((e: any) => e.direction === 'RECEIVED').length;

    // Group emails by thread
    const threads: Record<string, any[]> = {};
    emails.forEach((e: any) => {
        const tid = e.thread_id || e.id;
        if (!threads[tid]) threads[tid] = [];
        threads[tid].push(e);
    });

    // Compute communication habit from email history
    const habit = computeContactHabit(
        emails.map((e: { direction: string; sent_at: string | null; thread_id: string | null }) => ({
            direction: e.direction,
            sent_at: e.sent_at,
            thread_id: e.thread_id,
        }))
    );

    return {
        contact: contactRes.data,
        emails,
        threads: Object.entries(threads).map(([id, msgs]) => ({
            id,
            subject: msgs[0]?.subject || 'No Subject',
            messages: msgs.sort((a: any, b: any) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()),
            lastDate: msgs[0]?.sent_at,
        })).sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()),
        projects: projectsRes.data || [],
        activity: activityRes.data || [],
        stats: { sent, received, total: emails.length },
        habit,
    };
}

export async function updateContactAction(contactId: string, data: {
    name?: string; company?: string; phone?: string; notes?: string; priority?: string;
}) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);

    let q = supabase.from('contacts').update(data).eq('id', contactId);
    if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { success: true };
}
