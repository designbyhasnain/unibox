'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';

/**
 * List all users with their assigned Gmail accounts. ADMIN only.
 */
export async function listUsersAction() {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') {
        return { success: false, users: [], error: `Admin access required (your role: ${role})` };
    }

    const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[userManagement] listUsersAction error:', JSON.stringify(error));
        return { success: false, users: [], error: `Failed to fetch users: ${error.message}` };
    }

    // Fetch assignments for all users
    const { data: assignments } = await supabase
        .from('user_gmail_assignments')
        .select('user_id, gmail_account_id, gmail_accounts(email)');

    // Group assignments by user
    const assignmentMap: Record<string, { gmailAccountId: string; email: string }[]> = {};
    for (const a of (assignments || [])) {
        const uid = a.user_id;
        if (!assignmentMap[uid]) assignmentMap[uid] = [];
        const acc = Array.isArray(a.gmail_accounts) ? a.gmail_accounts[0] : a.gmail_accounts;
        assignmentMap[uid]!.push({
            gmailAccountId: a.gmail_account_id,
            email: (acc as any)?.email || 'Unknown',
        });
    }

    const enrichedUsers = (users || []).map(u => ({
        ...u,
        assignedAccounts: assignmentMap[u.id] || [],
    }));

    return { success: true, users: enrichedUsers };
}

/**
 * Assign a Gmail account to a user. ADMIN only.
 */
export async function assignGmailToUserAction(targetUserId: string, gmailAccountId: string) {
    const { userId, role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };

    const { error } = await supabase
        .from('user_gmail_assignments')
        .upsert({
            user_id: targetUserId,
            gmail_account_id: gmailAccountId,
            assigned_by: userId,
        }, { onConflict: 'user_id,gmail_account_id' });

    if (error) {
        console.error('[userManagement] assignGmailToUserAction error:', error);
        return { success: false, error: 'Failed to assign account' };
    }

    return { success: true };
}

/**
 * Remove a Gmail account assignment from a user. ADMIN only.
 */
export async function removeGmailFromUserAction(targetUserId: string, gmailAccountId: string) {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };

    const { error } = await supabase
        .from('user_gmail_assignments')
        .delete()
        .eq('user_id', targetUserId)
        .eq('gmail_account_id', gmailAccountId);

    if (error) {
        console.error('[userManagement] removeGmailFromUserAction error:', error);
        return { success: false, error: 'Failed to remove account assignment' };
    }

    return { success: true };
}

/**
 * Update a user's role. ADMIN only.
 */
export async function updateUserRoleAction(targetUserId: string, newRole: 'ADMIN' | 'SALES') {
    const { userId, role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };
    if (targetUserId === userId) return { success: false, error: 'Cannot change your own role' };

    const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', targetUserId);

    if (error) {
        console.error('[userManagement] updateUserRoleAction error:', error);
        return { success: false, error: 'Failed to update role' };
    }

    return { success: true };
}

/**
 * Deactivate a user. ADMIN only.
 */
export async function deactivateUserAction(targetUserId: string) {
    const { userId, role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };
    if (targetUserId === userId) return { success: false, error: 'Cannot deactivate yourself' };

    const { error } = await supabase
        .from('users')
        .update({ status: 'REVOKED' })
        .eq('id', targetUserId);

    if (error) {
        console.error('[userManagement] deactivateUserAction error:', error);
        return { success: false, error: 'Failed to deactivate user' };
    }

    return { success: true };
}

/**
 * Reactivate a user. ADMIN only.
 */
export async function reactivateUserAction(targetUserId: string) {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };

    const { error } = await supabase
        .from('users')
        .update({ status: 'ACTIVE' })
        .eq('id', targetUserId);

    if (error) {
        console.error('[userManagement] reactivateUserAction error:', error);
        return { success: false, error: 'Failed to reactivate user' };
    }

    return { success: true };
}
