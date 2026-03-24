import 'server-only';
import { cache } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Returns the list of Gmail account IDs this user can access.
 * ADMIN → 'ALL' (no filter needed)
 * SALES → array of assigned gmail account IDs from UserGmailAssignment
 * Cached per-request to avoid redundant DB queries.
 */
export const getAccessibleGmailAccountIds = cache(async function getAccessibleGmailAccountIds(
    userId: string,
    role: string
): Promise<string[] | 'ALL'> {
    // ADMIN (and legacy roles like ACCOUNT_MANAGER) get full access
    if (role === 'ADMIN' || role === 'ACCOUNT_MANAGER') return 'ALL';

    try {
        const { data, error } = await supabase
            .from('user_gmail_assignments')
            .select('gmail_account_id')
            .eq('user_id', userId);

        // If table doesn't exist yet (pre-migration), fall back to all access
        if (error) {
            console.warn('[accessControl] user_gmail_assignments query failed (pre-migration?), granting full access:', error.message);
            return 'ALL';
        }

        if (!data || data.length === 0) return [];
        return data.map(row => row.gmail_account_id);
    } catch {
        // Fallback: grant full access if anything goes wrong
        return 'ALL';
    }
});

/**
 * Throws an error if the user is not an ADMIN.
 */
export function requireAdmin(role: string): void {
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') {
        throw new Error('ADMIN_REQUIRED');
    }
}
