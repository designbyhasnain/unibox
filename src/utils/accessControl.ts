import 'server-only';
import { cache } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Strict identity-based data scoping.
 *
 * Role semantics:
 *   ADMIN / ACCOUNT_MANAGER  → full access (legacy ACCOUNT_MANAGER treated as admin).
 *   SALES                    → only assigned Gmail accounts + contacts/projects/campaigns they own.
 *   VIDEO_EDITOR             → only EditProject rows assigned to them. No Gmail/Contact/Campaign access.
 *   Any other role           → treated as SALES-equivalent (no implicit admin escalation).
 */

export function isAdmin(role: string): boolean {
    return role === 'ADMIN' || role === 'ACCOUNT_MANAGER';
}

export function isEditor(role: string): boolean {
    return role === 'VIDEO_EDITOR';
}

export function isSales(role: string): boolean {
    return role === 'SALES';
}

/**
 * Returns the list of Gmail account IDs this user can access.
 * ADMIN → 'ALL' (no filter needed)
 * VIDEO_EDITOR → [] (no Gmail access at all)
 * SALES → array of assigned gmail account IDs from UserGmailAssignment (may be empty)
 * Cached per-request to avoid redundant DB queries.
 */
export const getAccessibleGmailAccountIds = cache(async function getAccessibleGmailAccountIds(
    userId: string,
    role: string
): Promise<string[] | 'ALL'> {
    if (isAdmin(role)) return 'ALL';
    if (isEditor(role)) return [];

    try {
        const { data, error } = await supabase
            .from('user_gmail_assignments')
            .select('gmail_account_id')
            .eq('user_id', userId);

        if (error) {
            console.warn('[accessControl] user_gmail_assignments query failed:', error.message);
            return [];
        }

        if (!data || data.length === 0) return [];
        return data.map(row => row.gmail_account_id);
    } catch {
        return [];
    }
});

/**
 * Returns true if the user can access the given Gmail account id (send, sync, modify, etc.).
 * Admins always true; editors always false; sales only if assigned.
 */
export async function canAccessGmailAccount(
    userId: string,
    role: string,
    accountId: string
): Promise<boolean> {
    const accessible = await getAccessibleGmailAccountIds(userId, role);
    if (accessible === 'ALL') return true;
    return accessible.includes(accountId);
}

/**
 * Returns the account-manager filter for Contact/Project queries.
 * null → no filter (admin sees all).
 * string → must equal this userId.
 *
 * Editors should never reach contact/project tables; returning the userId (which will
 * almost never match account_manager_id) guarantees an empty result as a hard fallback.
 */
export function getOwnerFilter(userId: string, role: string): string | null {
    if (isAdmin(role)) return null;
    return userId;
}

/**
 * Throws an error if the user is not an ADMIN.
 */
export function requireAdmin(role: string): void {
    if (!isAdmin(role)) {
        throw new Error('ADMIN_REQUIRED');
    }
}

/**
 * Throws an error if the user is a VIDEO_EDITOR. Use to guard sales/crm surfaces
 * (Inbox, Accounts, Campaigns, Clients, Finance, etc.).
 */
export function blockEditorAccess(role: string): void {
    if (isEditor(role)) {
        throw new Error('EDITOR_FORBIDDEN');
    }
}
