'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';

export type ActiveEditor = {
    id: string;
    name: string;
    email: string;
};

/**
 * List all active VIDEO_EDITOR users — used by the admin Projects table to
 * populate the Editor assignment dropdown.
 *
 * Open to ADMIN, ACCOUNT_MANAGER, and SALES (the latter two need to know the
 * roster too when looking at projects). Editors don't see this surface.
 */
export async function listActiveEditorsAction(): Promise<{ success: true; editors: ActiveEditor[] } | { success: false; error: string }> {
    const { role } = await ensureAuthenticated();
    if (role === 'VIDEO_EDITOR') return { success: false, error: 'Forbidden' };

    const { data, error } = await supabase
        .from('users')
        .select('id, name, email, crm_status')
        .eq('role', 'VIDEO_EDITOR')
        .order('name', { ascending: true });

    if (error) {
        console.error('[listActiveEditorsAction]', error);
        return { success: false, error: error.message };
    }

    const editors = (data || [])
        .filter((u: { crm_status: string | null }) => u.crm_status !== 'REVOKED')
        .map((u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name, email: u.email }));

    return { success: true, editors };
}

/**
 * Assign / unassign the editor on a single project. Admin/AM only.
 * Pass `editorId: null` to clear the assignment.
 */
export async function assignEditorAction(projectId: string, editorId: string | null) {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };

    const { error } = await supabase
        .from('edit_projects')
        .update({ editor_id: editorId })
        .eq('id', projectId);

    if (error) {
        console.error('[assignEditorAction]', error);
        return { success: false, error: error.message };
    }
    return { success: true };
}
