import 'server-only';
import { supabase } from '../lib/supabase';

/**
 * One-time migration to set up RBAC for existing data.
 * - Sets DEFAULT_USER_ID user's role to ADMIN
 * - Creates UserGmailAssignment records for admin for all existing accounts
 */
export async function migrateExistingData() {
    const defaultUserId = process.env.DEFAULT_USER_ID || process.env.NEXT_PUBLIC_DEFAULT_USER_ID;
    if (!defaultUserId) {
        console.error('[migration] No DEFAULT_USER_ID found');
        return { success: false, error: 'No DEFAULT_USER_ID' };
    }

    // 1. Set the default user's role to ADMIN
    const { error: roleError } = await supabase
        .from('users')
        .update({ role: 'ADMIN' })
        .eq('id', defaultUserId);

    if (roleError) {
        console.error('[migration] Failed to set admin role:', roleError);
        return { success: false, error: roleError.message };
    }

    // 2. Get all existing gmail accounts
    const { data: accounts } = await supabase
        .from('gmail_accounts')
        .select('id');

    if (!accounts || accounts.length === 0) {
        return { success: true, message: 'No accounts to assign' };
    }

    // 3. Create UserGmailAssignment for each account
    const assignments = accounts.map(acc => ({
        user_id: defaultUserId,
        gmail_account_id: acc.id,
        assigned_by: defaultUserId,
        assigned_at: new Date().toISOString(),
    }));

    const { error: assignError } = await supabase
        .from('user_gmail_assignments')
        .upsert(assignments, { onConflict: 'user_id,gmail_account_id' });

    if (assignError) {
        console.error('[migration] Failed to create assignments:', assignError);
        return { success: false, error: assignError.message };
    }

    return { success: true, message: `Assigned ${accounts.length} accounts to admin` };
}
