'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';

/**
 * Lists potential Account Managers for the Projects table dropdown.
 * Anyone with a CRM-facing role (ADMIN, ACCOUNT_MANAGER, SALES) qualifies.
 * VIDEO_EDITORs are excluded.
 *
 * The list refreshes every time the dropdown opens, so newly-invited team
 * members appear automatically — no rebuild needed.
 */
export type AmCandidate = { id: string; name: string; email: string };

export async function listAccountManagersAction(): Promise<{ success: true; users: AmCandidate[] } | { success: false; error: string }> {
    const { role } = await ensureAuthenticated();
    if (role === 'VIDEO_EDITOR') return { success: false, error: 'Forbidden' };

    const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, crm_status')
        .in('role', ['ADMIN', 'ACCOUNT_MANAGER', 'SALES'])
        .order('name', { ascending: true });

    if (error) {
        console.error('[listAccountManagersAction]', error);
        return { success: false, error: error.message };
    }

    const users = (data || [])
        .filter((u: { crm_status: string | null }) => u.crm_status !== 'REVOKED')
        .map((u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name, email: u.email }));

    return { success: true, users };
}

/**
 * Returns the unique set of tags used across all edit_projects, sorted by
 * frequency (most-used first). The TagsCell uses this to surface previously
 * created tags so editors can pick instead of retyping. New tags created via
 * the cell automatically appear here on next open because they're already
 * stored on edit_projects.tags[].
 */
export async function listExistingTagsAction(): Promise<{ success: true; tags: string[] } | { success: false; error: string }> {
    const { role } = await ensureAuthenticated();
    if (role === 'VIDEO_EDITOR') return { success: false, error: 'Forbidden' };

    // No DISTINCT-on-array helper in PostgREST; pull tags column and dedupe in JS.
    // Bounded to 5000 most-recently-updated rows to keep the call fast at scale.
    const { data, error } = await supabase
        .from('edit_projects')
        .select('tags')
        .order('updated_at', { ascending: false })
        .limit(5000);

    if (error) {
        console.error('[listExistingTagsAction]', error);
        return { success: false, error: error.message };
    }

    const counts = new Map<string, number>();
    for (const row of (data || []) as { tags: string[] | null }[]) {
        const tags = row.tags || [];
        for (const t of tags) {
            const k = String(t).trim();
            if (!k) continue;
            counts.set(k, (counts.get(k) || 0) + 1);
        }
    }
    const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return { success: true, tags };
}

/**
 * Returns unique hard_drive label values (strings like "HDD-04", "Arizona 2TB",
 * etc.) used across edit_projects, sorted by frequency. New labels created
 * via the HardDriveCell appear automatically — they're written straight to
 * edit_projects.hard_drive.
 */
export async function listExistingHardDrivesAction(): Promise<{ success: true; drives: string[] } | { success: false; error: string }> {
    const { role } = await ensureAuthenticated();
    if (role === 'VIDEO_EDITOR') return { success: false, error: 'Forbidden' };

    const { data, error } = await supabase
        .from('edit_projects')
        .select('hard_drive')
        .not('hard_drive', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(5000);

    if (error) {
        console.error('[listExistingHardDrivesAction]', error);
        return { success: false, error: error.message };
    }

    const counts = new Map<string, number>();
    for (const row of (data || []) as { hard_drive: string | null }[]) {
        const k = (row.hard_drive ?? '').trim();
        if (!k) continue;
        counts.set(k, (counts.get(k) || 0) + 1);
    }
    const drives = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return { success: true, drives };
}
