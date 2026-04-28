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

    const { data: users, error, count } = await supabase
        .from('users')
        .select('*', { count: 'exact' });

    if (error) {
        return { success: false, users: [], error: `DB error: ${error.message} (code: ${error.code})` };
    }

    if (!users || users.length === 0) {
        return { success: false, users: [], error: `No users found (count: ${count}, role: ${role})` };
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
export async function updateUserRoleAction(targetUserId: string, newRole: 'ADMIN' | 'SALES' | 'VIDEO_EDITOR') {
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
        .update({ crm_status: 'REVOKED' })
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
        .update({ crm_status: 'ACTIVE' })
        .eq('id', targetUserId);

    if (error) {
        console.error('[userManagement] reactivateUserAction error:', error);
        return { success: false, error: 'Failed to reactivate user' };
    }

    return { success: true };
}

/**
 * Permanently delete a user. ADMIN only.
 *
 * FK strategy — `gmail_accounts.user_id`, `campaigns.created_by_id`,
 * `email_templates.created_by_id`, `edit_projects.user_id`, `invitations.invited_by`
 * all point at users with destructive defaults (CASCADE) or NOT-NULL columns. Naively
 * deleting would either nuke connected Gmail inboxes (and all their emails) or fail.
 * We reassign those rows to the calling admin first; nullable refs (`projects.account_manager_id`)
 * get set to NULL; `contacts.account_manager_id` is `SetNull`; `user_gmail_assignments`
 * is explicitly cleared per the spec (cascade would also work).
 */
export async function deleteUserAction(targetUserId: string) {
    const { userId, role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };
    if (targetUserId === userId) return { success: false, error: 'Cannot delete yourself' };

    // 1. Clean up user_gmail_assignments (per spec)
    {
        const { error } = await supabase.from('user_gmail_assignments').delete().eq('user_id', targetUserId);
        if (error) {
            console.error('[userManagement] deleteUserAction: failed to clear gmail assignments', error);
            return { success: false, error: 'Failed to clear Gmail assignments' };
        }
    }

    // 2. Reassign Gmail accounts to the calling admin so OAuth tokens + emails survive.
    {
        const { error } = await supabase.from('gmail_accounts').update({ user_id: userId }).eq('user_id', targetUserId);
        if (error) {
            console.error('[userManagement] deleteUserAction: failed to reassign gmail accounts', error);
            return { success: false, error: 'Failed to reassign Gmail accounts' };
        }
    }

    // 3. Reassign campaigns (CASCADE would drop them).
    {
        const { error } = await supabase.from('campaigns').update({ created_by_id: userId }).eq('created_by_id', targetUserId);
        if (error) console.error('[userManagement] deleteUserAction: campaigns reassign warn', error);
    }

    // 4. Reassign email templates (CASCADE would drop them).
    {
        const { error } = await supabase.from('email_templates').update({ created_by_id: userId }).eq('created_by_id', targetUserId);
        if (error) console.error('[userManagement] deleteUserAction: templates reassign warn', error);
    }

    // 5. Reassign edit_projects.user_id (NOT NULL, RESTRICT — cannot null out).
    {
        const { error } = await supabase.from('edit_projects').update({ user_id: userId }).eq('user_id', targetUserId);
        if (error) console.error('[userManagement] deleteUserAction: edit_projects reassign warn', error);
    }

    // 6. Null out projects.account_manager_id (RESTRICT, but column is nullable).
    {
        const { error } = await supabase.from('projects').update({ account_manager_id: null }).eq('account_manager_id', targetUserId);
        if (error) console.error('[userManagement] deleteUserAction: projects null-out warn', error);
    }

    // 7. Reassign invitations sent by this user (invited_by is NOT NULL).
    {
        const { error } = await supabase.from('invitations').update({ invited_by: userId }).eq('invited_by', targetUserId);
        if (error) console.error('[userManagement] deleteUserAction: invitations reassign warn', error);
    }

    // 8. Finally, delete the user row.
    const { error } = await supabase.from('users').delete().eq('id', targetUserId);
    if (error) {
        console.error('[userManagement] deleteUserAction: final delete failed', error);
        return { success: false, error: `Failed to delete user: ${error.message}` };
    }

    return { success: true };
}

/**
 * Set a user's password. ADMIN only.
 */
export async function setUserPasswordAction(targetUserId: string, newPassword: string) {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };

    if (!newPassword || newPassword.length < 8) {
        return { success: false, error: 'Password must be at least 8 characters' };
    }

    const bcrypt = await import('bcryptjs');
    const hashed = await bcrypt.hash(newPassword, 12);

    const { error } = await supabase
        .from('users')
        .update({ password: hashed })
        .eq('id', targetUserId);

    if (error) {
        console.error('[userManagement] setUserPasswordAction error:', error);
        return { success: false, error: 'Failed to set password' };
    }

    return { success: true };
}
