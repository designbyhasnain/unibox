'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';

function requireAdmin(role: string) {
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') {
        throw new Error('Admin access required');
    }
}

export type DataHealthSnapshot = {
    totalEmails: number;
    totalContacts: number;
    totalProjects: number;
    orphanEmails: number;
    orphanProjects: number;
    unassignedContacts: number;
    contactsNotTouched60d: number;
    overdueUnpaid: number;
    recentBackfillCount: number;
};

export async function getDataHealthAction(): Promise<{ success: boolean; data?: DataHealthSnapshot; error?: string }> {
    try {
        const { role } = await ensureAuthenticated();
        requireAdmin(role);

        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const [
            emails,
            contacts,
            projects,
            orphanEmails,
            orphanProjects,
            unassigned,
            stale,
            overdue,
        ] = await Promise.all([
            supabase.from('email_messages').select('id', { count: 'exact', head: true }),
            supabase.from('contacts').select('id', { count: 'exact', head: true }),
            supabase.from('projects').select('id', { count: 'exact', head: true }),
            supabase.from('email_messages').select('id', { count: 'exact', head: true }).is('contact_id', null),
            supabase.from('projects').select('id', { count: 'exact', head: true }).is('client_id', null),
            supabase.from('contacts').select('id', { count: 'exact', head: true }).is('account_manager_id', null),
            supabase.from('contacts').select('id', { count: 'exact', head: true })
                .lt('updated_at', sixtyDaysAgo)
                .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED']),
            supabase.from('projects').select('id', { count: 'exact', head: true })
                .eq('paid_status', 'UNPAID')
                .lt('project_date', thirtyDaysAgo),
        ]);

        return {
            success: true,
            data: {
                totalEmails: emails.count || 0,
                totalContacts: contacts.count || 0,
                totalProjects: projects.count || 0,
                orphanEmails: orphanEmails.count || 0,
                orphanProjects: orphanProjects.count || 0,
                unassignedContacts: unassigned.count || 0,
                contactsNotTouched60d: stale.count || 0,
                overdueUnpaid: overdue.count || 0,
                recentBackfillCount: 0,
            },
        };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load data health';
        return { success: false, error: msg };
    }
}
