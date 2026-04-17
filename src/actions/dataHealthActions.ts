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

export type GmailSyncHealth = {
    totalAccounts: number;
    active: number;
    syncing: number;
    error: number;
    disconnected: number;
    paused: number;
    rateLimited: number;
    oauth: number;
    manual: number;
    recentlyFailed: { email: string; lastError: string; failCount: number; lastErrorAt: string | null }[];
    freshAccounts: number;
    stalestAccount: { email: string; daysAgo: number } | null;
};

export async function getGmailSyncHealthAction(): Promise<{ success: boolean; data?: GmailSyncHealth; error?: string }> {
    try {
        const { role } = await ensureAuthenticated();
        requireAdmin(role);

        const { data: accounts, error } = await supabase
            .from('gmail_accounts')
            .select('email, status, connection_method, last_synced_at, last_error_message, last_error_at, sync_fail_count');

        if (error || !accounts) return { success: false, error: error?.message || 'Failed to load accounts' };

        const now = Date.now();
        const fresh = accounts.filter(a => a.last_synced_at && now - new Date(a.last_synced_at).getTime() < 6 * 3600_000);
        const withSync = accounts.filter(a => a.last_synced_at);
        const stalest = withSync.length
            ? withSync.reduce((acc, a) => {
                const t = new Date(a.last_synced_at!).getTime();
                return !acc || t < acc.t ? { t, email: a.email } : acc;
            }, null as null | { t: number; email: string })
            : null;

        const recentlyFailed = accounts
            .filter(a => (a.sync_fail_count || 0) > 0 || (a.last_error_message && a.last_error_message !== ''))
            .sort((a, b) => (b.sync_fail_count || 0) - (a.sync_fail_count || 0))
            .slice(0, 10)
            .map(a => ({
                email: a.email,
                lastError: (a.last_error_message || '').slice(0, 140),
                failCount: a.sync_fail_count || 0,
                lastErrorAt: a.last_error_at,
            }));

        const rateLimited = accounts.filter(a => /rate limit/i.test(a.last_error_message || '')).length;

        return {
            success: true,
            data: {
                totalAccounts: accounts.length,
                active: accounts.filter(a => a.status === 'ACTIVE').length,
                syncing: accounts.filter(a => a.status === 'SYNCING').length,
                error: accounts.filter(a => a.status === 'ERROR').length,
                disconnected: accounts.filter(a => a.status === 'DISCONNECTED').length,
                paused: accounts.filter(a => a.status === 'PAUSED').length,
                rateLimited,
                oauth: accounts.filter(a => a.connection_method === 'OAUTH').length,
                manual: accounts.filter(a => a.connection_method === 'MANUAL').length,
                recentlyFailed,
                freshAccounts: fresh.length,
                stalestAccount: stalest ? { email: stalest.email, daysAgo: Math.round((now - stalest.t) / 86400_000) } : null,
            },
        };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load Gmail sync health';
        return { success: false, error: msg };
    }
}

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
            supabase.from('email_messages').select('id', { count: 'estimated', head: true }),
            supabase.from('contacts').select('id', { count: 'estimated', head: true }),
            supabase.from('projects').select('id', { count: 'estimated', head: true }),
            supabase.from('email_messages').select('id', { count: 'estimated', head: true }).is('contact_id', null),
            supabase.from('projects').select('id', { count: 'estimated', head: true }).is('client_id', null),
            supabase.from('contacts').select('id', { count: 'estimated', head: true }).is('account_manager_id', null),
            supabase.from('contacts').select('id', { count: 'estimated', head: true })
                .lt('updated_at', sixtyDaysAgo)
                .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED']),
            supabase.from('projects').select('id', { count: 'estimated', head: true })
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
