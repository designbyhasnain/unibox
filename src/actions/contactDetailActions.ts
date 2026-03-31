'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';

export async function getContactDetailAction(contactId: string) {
    await ensureAuthenticated();

    // Fetch contact, emails, projects, and activity in parallel
    const [contactRes, emailsRes, projectsRes, activityRes] = await Promise.all([
        supabase.from('contacts').select('*').eq('id', contactId).single(),
        supabase.from('email_messages')
            .select('id, subject, from_email, to_email, direction, sent_at, snippet, body, is_unread, thread_id, gmail_account_id')
            .eq('contact_id', contactId)
            .order('sent_at', { ascending: false })
            .limit(100),
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

    if (contactRes.error || !contactRes.data) {
        return null;
    }

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
    };
}

export async function updateContactAction(contactId: string, data: {
    name?: string; company?: string; phone?: string; notes?: string; priority?: string;
}) {
    await ensureAuthenticated();
    const { error } = await supabase.from('contacts').update(data).eq('id', contactId);
    if (error) throw new Error(error.message);
    return { success: true };
}
