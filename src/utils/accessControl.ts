import 'server-only';
import { supabase } from '../lib/supabase';

/**
 * Returns the list of Gmail account IDs this user can access.
 * ADMIN → 'ALL' (no filter needed)
 * SALES → array of assigned gmail account IDs from UserGmailAssignment
 */
export async function getAccessibleGmailAccountIds(
    userId: string,
    role: string
): Promise<string[] | 'ALL'> {
    if (role === 'ADMIN') return 'ALL';

    const { data } = await supabase
        .from('user_gmail_assignments')
        .select('gmail_account_id')
        .eq('user_id', userId);

    if (!data || data.length === 0) return [];
    return data.map(row => row.gmail_account_id);
}

/**
 * Throws an error if the user is not an ADMIN.
 */
export function requireAdmin(role: string): void {
    if (role !== 'ADMIN') {
        throw new Error('ADMIN_REQUIRED');
    }
}
