'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';

/**
 * Lists potential Account Managers for the Projects table dropdown.
 *
 * Two groups, returned together:
 *   1. Active users with role = SALES (admins are excluded — admins shouldn't
 *      appear in an AM picker since the AM is an outward-facing role).
 *   2. "Legacy" entries pulled from edit_projects.account_manager (a free-form
 *      string column from the imported CSV era). Some of those names match
 *      a real SALES user; some don't. We surface every distinct name so no
 *      historical data is lost — picking one keeps the same string going.
 *
 * The list refreshes every time the dropdown opens, so newly-invited SALES
 * reps appear automatically.
 */
export type AmCandidate = {
    /** What gets stored in edit_projects.account_manager when this row is picked. Always the display name. */
    value: string;
    name: string;
    /** Subtitle in the dropdown — email for real users, "legacy" tag otherwise. */
    subtitle: string;
    /** True for free-form names that have no matching SALES user account yet. */
    legacy: boolean;
};

export async function listAccountManagersAction(): Promise<{ success: true; users: AmCandidate[] } | { success: false; error: string }> {
    const { role } = await ensureAuthenticated();
    if (role === 'VIDEO_EDITOR') return { success: false, error: 'Forbidden' };

    const [usersRes, legacyRes] = await Promise.all([
        supabase
            .from('users')
            .select('id, name, email, role, crm_status')
            .eq('role', 'SALES')
            .order('name', { ascending: true }),
        supabase
            .from('edit_projects')
            .select('account_manager')
            .not('account_manager', 'is', null)
            .order('updated_at', { ascending: false })
            .limit(5000),
    ]);

    if (usersRes.error) {
        console.error('[listAccountManagersAction] users', usersRes.error);
        return { success: false, error: usersRes.error.message };
    }

    const real: AmCandidate[] = (usersRes.data || [])
        .filter((u: { crm_status: string | null }) => u.crm_status !== 'REVOKED')
        .map((u: { name: string; email: string }) => ({
            value: u.name,
            name: u.name,
            subtitle: u.email,
            legacy: false,
        }));

    // Dedupe legacy names case-insensitively against the real list, sorted by frequency.
    const realByName = new Set(real.map(u => u.name.toLowerCase()));
    const counts = new Map<string, number>();
    for (const row of (legacyRes.data || []) as { account_manager: string | null }[]) {
        const name = (row.account_manager ?? '').trim();
        if (!name) continue;
        if (realByName.has(name.toLowerCase())) continue; // already in the real list
        counts.set(name, (counts.get(name) || 0) + 1);
    }
    const legacy: AmCandidate[] = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, n]) => ({
            value: name,
            name,
            subtitle: `legacy · ${n}×`,
            legacy: true,
        }));

    return { success: true, users: [...real, ...legacy] };
}

/**
 * Lists active SALES users keyed by id — used by surfaces that store a user
 * UUID rather than a free-form name (e.g. contacts.account_manager_id, the
 * /clients table inline AM picker, the contact-detail OwnerPicker fallback).
 *
 * Differs from listAccountManagersAction (above) which returns name as value
 * because edit_projects.account_manager is a TEXT column. This one returns
 * the actual user id so the caller can write to a FK column safely.
 */
export type SalesUser = { id: string; name: string; email: string };

export async function listSalesUsersAction(): Promise<{ success: true; users: SalesUser[] } | { success: false; error: string }> {
    const { role } = await ensureAuthenticated();
    if (role === 'VIDEO_EDITOR') return { success: false, error: 'Forbidden' };

    const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, crm_status')
        .eq('role', 'SALES')
        .order('name', { ascending: true });

    if (error) {
        console.error('[listSalesUsersAction] error', error);
        return { success: false, error: error.message };
    }

    const users: SalesUser[] = (data || [])
        .filter((u: { crm_status: string | null }) => u.crm_status !== 'REVOKED')
        .map((u: { id: string; name: string | null; email: string | null }) => ({
            id: u.id,
            name: u.name || (u.email?.split('@')[0] ?? 'Unknown'),
            email: u.email || '',
        }));

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
