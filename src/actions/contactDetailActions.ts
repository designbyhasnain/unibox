'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { computeContactHabit } from '../utils/clientHabits';
import { getOwnerFilter, blockEditorAccess, isAdmin } from '../utils/accessControl';

export async function getContactDetailAction(contactId: string) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);

    const ownerFilter = getOwnerFilter(userId, role);
    let contactQuery = supabase.from('contacts').select('*').eq('id', contactId);
    if (ownerFilter) contactQuery = contactQuery.eq('account_manager_id', ownerFilter);
    const contactRes = await contactQuery.maybeSingle();
    if (contactRes.error || !contactRes.data) return null;

    // Try fetching emails by contact_id (fast path), fall back to email address match
    let emailsRes = await supabase.from('email_messages')
        .select('id, subject, from_email, to_email, direction, sent_at, snippet, body, is_unread, thread_id, gmail_account_id')
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false })
        .limit(100);

    // Trigger fallback if:
    // 1. Zero emails found by contact_id, OR
    // 2. The contact's stored stats indicate many more emails exist than we found
    //    (common case: emails are linked to a different contact_id due to sync race conditions)
    const expectedTotal = (contactRes.data.total_emails_sent || 0) + (contactRes.data.total_emails_received || 0);
    const foundCount = emailsRes.data?.length || 0;
    const needsFallback = contactRes.data.email && (foundCount === 0 || foundCount < expectedTotal * 0.5);

    if (needsFallback) {
        const emailFields = 'id, subject, from_email, to_email, direction, sent_at, snippet, body, is_unread, thread_id, gmail_account_id';
        const emailPattern = `%${contactRes.data.email}%`;

        const [fromRes, toRes] = await Promise.all([
            supabase.from('email_messages')
                .select(emailFields)
                .ilike('from_email', emailPattern)
                .order('sent_at', { ascending: false })
                .limit(100),
            supabase.from('email_messages')
                .select(emailFields)
                .ilike('to_email', emailPattern)
                .order('sent_at', { ascending: false })
                .limit(100),
        ]);

        // Merge and deduplicate
        const merged = [...(fromRes.data || []), ...(toRes.data || [])];
        const seen = new Set<string>();
        const unique = merged.filter((e: any) => {
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
        });
        unique.sort((a: any, b: any) => new Date(b.sent_at || 0).getTime() - new Date(a.sent_at || 0).getTime());
        emailsRes = { data: unique.slice(0, 100), error: null } as typeof emailsRes;

        // Self-heal: backfill contact_id on orphan rows
        if (unique.length > 0) {
            const ids = unique.map((e: any) => e.id);
            void supabase
                .from('email_messages')
                .update({ contact_id: contactId })
                .in('id', ids)
                .is('contact_id', null)
                .then();
        }
    }

    // Fetch projects and activity in parallel
    const [projectsRes, activityRes] = await Promise.all([
        supabase.from('projects')
            .select('id, project_name, status, paid_status, project_value, total_amount, project_date, account_manager, account_manager_id')
            .eq('client_id', contactId)
            .order('project_date', { ascending: false }),
        supabase.from('activity_logs')
            .select('id, action, note, performed_by, created_at')
            .eq('contact_id', contactId)
            .order('created_at', { ascending: false })
            .limit(50),
    ]);

    // Aggregate email stats
    const emails = emailsRes.data || [];
    const sent = emails.filter((e: any) => e.direction === 'SENT').length;
    const received = emails.filter((e: any) => e.direction === 'RECEIVED').length;

    // Group emails by thread
    const threads: Record<string, any[]> = {};
    emails.forEach((e: any) => {
        const tid = e.thread_id || e.id;
        if (!threads[tid]) threads[tid] = [];
        threads[tid].push(e);
    });

    // Compute communication habit from email history
    const habit = computeContactHabit(
        emails.map((e: { direction: string; sent_at: string | null; thread_id: string | null }) => ({
            direction: e.direction,
            sent_at: e.sent_at,
            thread_id: e.thread_id,
        }))
    );

    // Resolve closer + current-owner names for dual-ownership UI on projects tab.
    const projects = projectsRes.data || [];
    const currentOwnerId = contactRes.data.account_manager_id || null;
    const closerIds = Array.from(new Set(projects.map((p: any) => p.account_manager_id).filter(Boolean) as string[]));
    const idsToFetch = Array.from(new Set([...closerIds, currentOwnerId].filter(Boolean) as string[]));
    let userNameById: Record<string, string> = {};
    if (idsToFetch.length) {
        const { data: users } = await supabase.from('users').select('id, name, email').in('id', idsToFetch);
        for (const u of users || []) userNameById[u.id] = u.name?.trim() || (u.email?.split('@')[0] || '');
    }
    const currentOwnerName = currentOwnerId ? (userNameById[currentOwnerId] || null) : null;
    const projectsWithOwnership = projects.map((p: any) => {
        const closerId = p.account_manager_id || null;
        const closerName = closerId ? (userNameById[closerId] || null) : null;
        return {
            ...p,
            closer_id: closerId,
            closer_name: closerName,
            current_owner_id: currentOwnerId,
            current_owner_name: currentOwnerName,
        };
    });

    return {
        contact: contactRes.data,
        emails,
        threads: Object.entries(threads).map(([id, msgs]) => ({
            id,
            subject: msgs[0]?.subject || 'No Subject',
            messages: msgs.sort((a: any, b: any) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()),
            lastDate: msgs[0]?.sent_at,
        })).sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()),
        projects: projectsWithOwnership,
        activity: activityRes.data || [],
        stats: { sent, received, total: emails.length },
        habit,
        currentOwner: currentOwnerId ? { id: currentOwnerId, name: currentOwnerName } : null,
    };
}

export async function updateContactAction(contactId: string, data: {
    name?: string; company?: string; phone?: string; notes?: string; priority?: string;
}) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);

    let q = supabase.from('contacts').update(data).eq('id', contactId);
    if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { success: true };
}

// ── Ownership transfer chokepoint ─────────────────────────────────────────
// All mutations of contacts.account_manager_id MUST flow through here so the
// activity_logs row is always written. See docs/AM-CREDIT-AND-OWNERSHIP-SCOPE.md §3.2.

export type OwnershipTransferSource =
    | 'manual'           // user edit on contact detail page
    | 'bulk'             // admin/cleanup script
    | 'admin_override'   // admin reassigning a paid project's AM
    | 'import'           // CSV import on creation
    | 'campaign'         // campaign enrollment on creation
    | 'scraper'          // lead scraper on creation
    | 'invite'           // invitation acceptance
    | 'system';          // automated reassignment

export type TransferContactOpts = {
    reason?: string;
    source?: OwnershipTransferSource;
};

export type TransferContactResult =
    | { success: true; contact: { id: string; account_manager_id: string | null }; changed: boolean }
    | { success: false; error: string };

export async function transferContactAction(
    contactId: string,
    newAmId: string | null,
    opts?: TransferContactOpts,
): Promise<TransferContactResult> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!contactId) return { success: false, error: 'contactId is required' };

    if (!isAdmin(role)) {
        return { success: false, error: 'Only admins can reassign contact owners.' };
    }

    const { data: existing, error: fetchErr } = await supabase
        .from('contacts')
        .select('id, account_manager_id')
        .eq('id', contactId)
        .maybeSingle();
    if (fetchErr) {
        console.error('transferContactAction prefetch error:', fetchErr);
        return { success: false, error: 'An error occurred while processing your request' };
    }
    if (!existing) return { success: false, error: 'Contact not found' };

    const fromAmId = existing.account_manager_id ?? null;
    const toAmId = newAmId ?? null;
    if (fromAmId === toAmId) {
        return { success: true, contact: { id: contactId, account_manager_id: fromAmId }, changed: false };
    }

    const { data: updated, error: updateErr } = await supabase
        .from('contacts')
        .update({ account_manager_id: toAmId, updated_at: new Date().toISOString() })
        .eq('id', contactId)
        .select('id, account_manager_id')
        .maybeSingle();
    if (updateErr) {
        console.error('transferContactAction update error:', updateErr);
        return { success: false, error: 'An error occurred while processing your request' };
    }
    if (!updated) return { success: false, error: 'Contact not found' };

    await recordOwnershipChange({
        contactId,
        fromUserId: fromAmId,
        toUserId: toAmId,
        actorUserId: userId,
        source: opts?.source ?? 'manual',
        reason: opts?.reason,
    });

    revalidatePath(`/clients/${contactId}`);
    revalidatePath('/clients');
    return { success: true, contact: updated, changed: true };
}

// Fire-and-forget audit-row writer. Failures are logged but do NOT roll back the caller.
// Useful from creation paths where the contact insert and the audit row are written separately.
export async function recordOwnershipChange(args: {
    contactId: string;
    fromUserId: string | null;
    toUserId: string | null;
    actorUserId: string;
    source: OwnershipTransferSource;
    reason?: string;
}): Promise<void> {
    const { error } = await supabase.from('activity_logs').insert({
        action: 'OWNERSHIP_TRANSFER',
        performed_by: args.actorUserId,
        contact_id: args.contactId,
        note: JSON.stringify({
            from_user_id: args.fromUserId,
            to_user_id: args.toUserId,
            source: args.source,
            reason: args.reason ?? null,
        }),
    });
    if (error) {
        console.error('recordOwnershipChange audit log write failed:', error);
    }
}

export type OwnershipTransferEntry = {
    id: string;
    created_at: string;
    actor_user_id: string | null;
    actor_name: string | null;
    from_user_id: string | null;
    from_name: string | null;
    to_user_id: string | null;
    to_name: string | null;
    source: OwnershipTransferSource | string;
    reason: string | null;
};

export async function getOwnershipTransferHistoryAction(
    contactId: string,
): Promise<{ success: true; entries: OwnershipTransferEntry[] } | { success: false; error: string }> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!contactId) return { success: false, error: 'contactId is required' };

    // Owner-scoped read — SALES sees only their own contact's history.
    const ownerFilter = getOwnerFilter(userId, role);
    if (ownerFilter) {
        const { data: ok } = await supabase
            .from('contacts')
            .select('id')
            .eq('id', contactId)
            .eq('account_manager_id', ownerFilter)
            .maybeSingle();
        if (!ok) return { success: false, error: 'Contact not found or access denied' };
    }

    const { data: rows, error } = await supabase
        .from('activity_logs')
        .select('id, performed_by, note, created_at')
        .eq('contact_id', contactId)
        .eq('action', 'OWNERSHIP_TRANSFER')
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) {
        console.error('getOwnershipTransferHistoryAction error:', error);
        return { success: false, error: 'Failed to load transfer history' };
    }

    type ParsedNote = { from_user_id: string | null; to_user_id: string | null; source: string; reason: string | null };
    const parsed = (rows || []).map((r: any) => {
        let note: ParsedNote = { from_user_id: null, to_user_id: null, source: 'unknown', reason: null };
        try { note = { ...note, ...JSON.parse(r.note || '{}') }; } catch { /* legacy/string note */ }
        return { id: r.id as string, created_at: r.created_at as string, actor_user_id: (r.performed_by as string) || null, note };
    });

    // Resolve user names in one batch.
    const userIds = Array.from(new Set([
        ...parsed.map(p => p.actor_user_id).filter(Boolean) as string[],
        ...parsed.map(p => p.note.from_user_id).filter(Boolean) as string[],
        ...parsed.map(p => p.note.to_user_id).filter(Boolean) as string[],
    ]));
    let nameById: Record<string, string> = {};
    if (userIds.length) {
        const { data: users } = await supabase.from('users').select('id, name').in('id', userIds);
        for (const u of users || []) nameById[u.id] = u.name || '';
    }

    const entries: OwnershipTransferEntry[] = parsed.map(p => ({
        id: p.id,
        created_at: p.created_at,
        actor_user_id: p.actor_user_id,
        actor_name: p.actor_user_id ? (nameById[p.actor_user_id] || null) : null,
        from_user_id: p.note.from_user_id,
        from_name: p.note.from_user_id ? (nameById[p.note.from_user_id] || null) : null,
        to_user_id: p.note.to_user_id,
        to_name: p.note.to_user_id ? (nameById[p.note.to_user_id] || null) : null,
        source: (p.note.source || 'unknown') as OwnershipTransferSource | string,
        reason: p.note.reason,
    }));

    return { success: true, entries };
}
