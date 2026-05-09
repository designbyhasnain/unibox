'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds, getOwnerFilter, blockEditorAccess, isAdmin } from '../utils/accessControl';
import { markContactClosed } from '../services/pipelineLogic';

export type ProjectUpdatePayload = {
    projectName?: string;
    projectDate?: string;
    dueDate?: string;
    accountManagerId?: string;
    paidStatus?: string;
    /** Total amount paid so far (across deposits / installments). Used by
     *  the partial-paid drawer to track the actual figure rather than
     *  assuming "half of project_value". */
    paid?: number | null;
    quote?: number;
    projectValue?: number;
    projectLink?: string;
    brief?: string;
    reference?: string;
    deductionOnDelay?: number;
    finalReview?: string;
    priority?: string;
    status?: string;
    clientId?: string;
};

// Options for sensitive overrides — currently only the AM-credit lock on PAID projects.
// See docs/AM-CREDIT-AND-OWNERSHIP-SCOPE.md §3.1.
export type ProjectUpdateOptions = {
    adminOverride?: boolean;
    reason?: string;
};

const AM_CREDIT_OVERRIDE_MIN_REASON = 10;

// Fetch projects with server-side pagination
export type PaginatedProjectsResult = {
    projects: any[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

export async function getAllProjectsAction(
    gmailAccountId?: string,
    page: number = 1,
    pageSize: number = 50,
    search?: string,
): Promise<PaginatedProjectsResult | any[]> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const accessible = await getAccessibleGmailAccountIds(userId, role);
    const ownerFilter = getOwnerFilter(userId, role);

    if (gmailAccountId && gmailAccountId !== 'ALL') {
        if (accessible !== 'ALL' && !accessible.includes(gmailAccountId)) {
            return { projects: [], totalCount: 0, page, pageSize, totalPages: 0 };
        }
    }

    const clampedPageSize = Math.min(Math.max(pageSize, 10), 100);
    const offset = (page - 1) * clampedPageSize;

    let query = supabase
        .from('projects')
        .select(`id, project_name, project_date, due_date, paid_status, paid, total_received, received_1, received_2, received_2_2, received_date_1, received_date_2, priority, final_review, quote, project_value, project_link, brief, reference, deduction_on_delay, status, person, editor, account_manager, team, tags, client_id, account_manager_id, source_email_id, created_at, contacts:client_id(id, name, email)`, { count: 'exact' });

    // Filter projects for non-admin users: only projects where they are the account manager
    if (ownerFilter) {
        query = query.eq('account_manager_id', ownerFilter);
    }

    if (search && search.trim()) {
        const s = search.trim().replace(/[%_\\]/g, '\\$&');
        query = query.or(`project_name.ilike.%${s}%`);
    }

    const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + clampedPageSize - 1);

    if (error) {
        console.error('getAllProjectsAction error:', error);
        return { projects: [], totalCount: 0, page, pageSize: clampedPageSize, totalPages: 0 };
    }

    // ── AM Resolution chain (SALES rep only) ─────────────────────────────
    // The displayed Owner on /my-projects is strictly the SALES rep assigned
    // to the inbox where the contact first emailed us. Admins / account
    // managers are *not* shown — even if they're assigned to the same inbox
    // — because the user wants the project card to surface the rep who
    // actually services this client. If no SALES user is assigned to the
    // inbox, Owner shows "Unassigned" — there is NO fallback to the manual
    // projects.account_manager_id (which is almost always the admin).
    //
    // Chain: project → contact → contact.last_gmail_account_id
    //        → user_gmail_assignments → users WHERE role='SALES'
    //
    // Three batched round trips: (1) contacts-with-inbox, (2) inbox→user
    // assignments, (3) candidate users filtered to SALES.
    const projectRows = (data || []).map((p: any) => ({
        ...p,
        client: p.contacts || null,
        client_name: p.contacts?.name || p.person || null,
    }));

    const clientIds = Array.from(new Set(projectRows.map(p => p.client_id).filter(Boolean)));
    const contactInboxByClientId = new Map<string, string | null>();
    if (clientIds.length > 0) {
        const { data: inboxRows } = await supabase
            .from('contacts')
            .select('id, last_gmail_account_id')
            .in('id', clientIds);
        for (const r of inboxRows ?? []) {
            contactInboxByClientId.set(r.id, r.last_gmail_account_id ?? null);
        }
    }

    const inboxIds = Array.from(new Set(
        Array.from(contactInboxByClientId.values()).filter((v): v is string => !!v),
    ));

    // First fetch every assignment for these inboxes, then narrow to SALES
    // users via a separate users query. Doing it as two passes (instead of
    // a server-side join) keeps the queries explicit and lets us reuse the
    // SALES user lookup for label/email below.
    type AssignRow = { gmail_account_id: string; user_id: string; assigned_at: string };
    let assignRows: AssignRow[] = [];
    if (inboxIds.length > 0) {
        const { data } = await supabase
            .from('user_gmail_assignments')
            .select('gmail_account_id, user_id, assigned_at')
            .in('gmail_account_id', inboxIds)
            .order('assigned_at', { ascending: true });
        assignRows = (data ?? []) as AssignRow[];
    }

    const candidateUserIds = Array.from(new Set(assignRows.map(r => r.user_id)));
    const salesUserById = new Map<string, { id: string; name: string; email: string }>();
    if (candidateUserIds.length > 0) {
        const { data: userRows } = await supabase
            .from('users')
            .select('id, name, email, role')
            .in('id', candidateUserIds)
            .eq('role', 'SALES');
        for (const u of userRows ?? []) {
            salesUserById.set(u.id, {
                id: u.id,
                name: (u.name && u.name.trim()) || (u.email?.split('@')[0] ?? 'Unnamed'),
                email: u.email ?? '',
            });
        }
    }

    // First (oldest) SALES assignment wins for each inbox. Non-SALES rows
    // are skipped entirely — admins / AMs are filtered out before this loop.
    const salesUserIdByInbox = new Map<string, string>();
    for (const r of assignRows) {
        if (!salesUserById.has(r.user_id)) continue;
        if (!salesUserIdByInbox.has(r.gmail_account_id)) {
            salesUserIdByInbox.set(r.gmail_account_id, r.user_id);
        }
    }

    const projects = projectRows.map(p => {
        const inboxId = p.client_id ? contactInboxByClientId.get(p.client_id) ?? null : null;
        const salesUserId = inboxId ? salesUserIdByInbox.get(inboxId) ?? null : null;
        const resolvedAm = salesUserId && salesUserById.has(salesUserId)
            ? { ...salesUserById.get(salesUserId)!, source: 'mailbox' as const }
            : null;
        return {
            ...p,
            // Preserve the contact's source inbox so the drawer's "Source Gmail
            // account" row can display it without an additional round trip.
            client_last_gmail_account_id: inboxId,
            resolvedAm,
        };
    });

    const totalCount = count ?? 0;
    return {
        projects,
        totalCount,
        page,
        pageSize: clampedPageSize,
        totalPages: Math.ceil(totalCount / clampedPageSize),
    };
}

// Fetch users assignable as account managers (excludes VIDEO_EDITOR — they cannot own contacts/projects)
export async function getManagersAction(): Promise<{ id: string; name: string; email: string; role: string }[]> {
    await ensureAuthenticated();
    const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role')
        .neq('role', 'VIDEO_EDITOR')
        .order('name');

    if (error) {
        console.error('getManagersAction error:', error);
        return [];
    }

    // Use email local-part as fallback for empty names. Email + role are
    // surfaced so the Owner picker on /my-projects can render a subtitle
    // and resolve any account_manager_id (admin / AM / sales) to a real
    // human-readable name.
    return (data ?? []).map(u => ({
        id: u.id,
        name: (u.name && u.name.trim()) || (u.email?.split('@')[0] ?? 'Unnamed'),
        email: u.email ?? '',
        role: u.role ?? '',
    }));
}

// Update an existing project
export async function updateProjectAction(
    projectId: string,
    payload: ProjectUpdatePayload,
    options?: ProjectUpdateOptions,
) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!projectId) return { success: false, error: 'projectId is required' };
    const ownerFilter = getOwnerFilter(userId, role);
    // Non-admins cannot reassign a project to a different manager
    if (payload.accountManagerId !== undefined && !isAdmin(role)) {
        delete payload.accountManagerId;
    }

    // ── AM Credit Lock guard ───────────────────────────────────────────────
    // If the caller is changing account_manager_id on a PAID project, require
    // an explicit ADMIN override with a reason. See docs/AM-CREDIT-AND-OWNERSHIP-SCOPE.md.
    let amOverrideContext: { fromAmId: string | null; toAmId: string | null } | null = null;
    if (payload.accountManagerId !== undefined) {
        const { data: existing, error: fetchErr } = await supabase
            .from('projects')
            .select('account_manager_id, paid_status')
            .eq('id', projectId)
            .maybeSingle();
        if (fetchErr) {
            console.error('updateProjectAction prefetch error:', fetchErr);
            return { success: false, error: 'An error occurred while processing your request' };
        }
        if (!existing) {
            return { success: false, error: 'Project not found or access denied' };
        }
        const fromAmId = existing.account_manager_id ?? null;
        const toAmId = payload.accountManagerId || null;
        const isChanging = fromAmId !== toAmId;
        const isPaid = existing.paid_status === 'PAID';
        if (isChanging && isPaid) {
            if (!isAdmin(role)) {
                return { success: false, error: 'AM credit is locked on a paid project. Contact an admin to override.' };
            }
            if (!options?.adminOverride) {
                return { success: false, error: 'AM credit is locked on a paid project. Pass { adminOverride: true, reason } to override.' };
            }
            const reason = (options.reason || '').trim();
            if (reason.length < AM_CREDIT_OVERRIDE_MIN_REASON) {
                return { success: false, error: `Override requires a reason (min ${AM_CREDIT_OVERRIDE_MIN_REASON} chars).` };
            }
            amOverrideContext = { fromAmId, toAmId };
        }
    }
    // Build update object, filtering out undefined values to avoid nullifying existing fields
    const updateData: Record<string, any> = {};
    if (payload.projectName !== undefined) updateData.project_name = payload.projectName;
    if (payload.projectDate !== undefined) updateData.project_date = payload.projectDate;
    if (payload.dueDate !== undefined) updateData.due_date = payload.dueDate;
    if (payload.accountManagerId !== undefined) updateData.account_manager_id = payload.accountManagerId;
    if (payload.paidStatus !== undefined) updateData.paid_status = payload.paidStatus;
    if (payload.paid !== undefined) {
        if (payload.paid != null && (typeof payload.paid !== 'number' || !Number.isFinite(payload.paid) || payload.paid < 0)) {
            return { success: false, error: 'Invalid paid value' };
        }
        updateData.paid = payload.paid;
        // Auto-derive paid_status when the user types a paid amount but
        // hasn't toggled the status yet.
        if (payload.paidStatus === undefined && typeof payload.paid === 'number') {
            const { data: cur } = await supabase
                .from('projects')
                .select('project_value')
                .eq('id', projectId)
                .maybeSingle();
            const total = cur?.project_value ?? 0;
            if (total > 0) {
                if (payload.paid >= total) updateData.paid_status = 'PAID';
                else if (payload.paid > 0) updateData.paid_status = 'PARTIALLY_PAID';
                else updateData.paid_status = 'UNPAID';
            }
        }
    }
    if (payload.quote !== undefined) {
        if (typeof payload.quote === 'number' && (!Number.isFinite(payload.quote) || payload.quote < 0)) {
            return { success: false, error: 'Invalid quote value' };
        }
        updateData.quote = payload.quote;
    }
    if (payload.projectValue !== undefined) {
        if (typeof payload.projectValue === 'number' && (!Number.isFinite(payload.projectValue) || payload.projectValue < 0)) {
            return { success: false, error: 'Invalid project value' };
        }
        updateData.project_value = payload.projectValue;
    }
    if (payload.projectLink !== undefined) updateData.project_link = payload.projectLink;
    if (payload.brief !== undefined) updateData.brief = payload.brief;
    if (payload.reference !== undefined) updateData.reference = payload.reference;
    if (payload.deductionOnDelay !== undefined) {
        if (typeof payload.deductionOnDelay === 'number' && (!Number.isFinite(payload.deductionOnDelay) || payload.deductionOnDelay < 0)) {
            return { success: false, error: 'Invalid deduction on delay value' };
        }
        updateData.deduction_on_delay = payload.deductionOnDelay;
    }
    if (payload.finalReview !== undefined) updateData.final_review = payload.finalReview;
    if (payload.priority !== undefined) updateData.priority = payload.priority;
    if (payload.status !== undefined) updateData.status = payload.status;
    if (payload.clientId !== undefined) updateData.client_id = payload.clientId || null;

    if (Object.keys(updateData).length === 0) {
        return { success: true, project: null };
    }

    let updateQuery = supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId);
    if (ownerFilter) updateQuery = updateQuery.eq('account_manager_id', ownerFilter);
    const { data, error } = await updateQuery
        .select('id, project_name, project_date, due_date, paid_status, priority, quote, project_value, project_link, brief, reference, deduction_on_delay, final_review, source_email_id, client_id, account_manager_id, created_at')
        .maybeSingle();

    if (error) {
        console.error('updateProjectAction error:', error);
        return { success: false, error: 'An error occurred while processing your request' };
    }
    if (!data) {
        return { success: false, error: 'Project not found or access denied' };
    }

    if (amOverrideContext) {
        const { error: logErr } = await supabase.from('activity_logs').insert({
            action: 'AM_CREDIT_OVERRIDE',
            performed_by: userId,
            project_id: projectId,
            contact_id: data.client_id ?? null,
            note: JSON.stringify({
                from_user_id: amOverrideContext.fromAmId,
                to_user_id: amOverrideContext.toAmId,
                reason: (options?.reason || '').trim(),
                source: 'admin_override',
            }),
        });
        if (logErr) {
            // Override happened but the audit row failed — surface this loudly so it can be re-logged.
            console.error('AM_CREDIT_OVERRIDE audit log write failed:', logErr);
        }
    }

    revalidatePath('/projects');
    return { success: true, project: data };
}


// Create project from an email thread (traceability)
export async function createProjectFromEmailAction(payload: {
    clientId: string;
    projectName: string;
    sourceEmailId: string;
    accountManagerId?: string;
}) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!payload.clientId || !payload.projectName || !payload.sourceEmailId) {
        return { success: false, error: 'clientId, projectName, and sourceEmailId are required' };
    }
    // Non-admins can only create projects under their own manager id
    const managerId = isAdmin(role) ? (payload.accountManagerId || userId) : userId;
    const { data, error } = await supabase
        .from('projects')
        .insert({
            client_id: payload.clientId,
            project_name: payload.projectName,
            source_email_id: payload.sourceEmailId,
            account_manager_id: managerId,
            project_date: new Date().toISOString(),
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // +7 days default
            paid_status: 'UNPAID',
            priority: 'MEDIUM',
            final_review: 'PENDING'
        })
        .select('id, project_name, project_date, due_date, paid_status, priority, quote, project_value, project_link, brief, reference, deduction_on_delay, final_review, source_email_id, client_id, account_manager_id, created_at')
        .single();

    if (error) {
        console.error('createProjectFromEmailAction error:', error);
        return { success: false, error: 'An error occurred while processing your request' };
    }

    // Pipeline invariant: a contact with any project is a paid client.
    // Fire-and-forget; a flip failure isn't fatal to project creation.
    markContactClosed(payload.clientId, data?.created_at).catch(err =>
        console.warn('[createProjectFromEmailAction] markContactClosed failed:', err)
    );

    revalidatePath('/projects');
    return { success: true, project: data };
}

// Create a new project manually
export async function createProjectAction(payload: {
    clientId: string;
    projectName: string;
    projectDate: string;
    dueDate: string;
    accountManagerId: string;
    priority?: string;
    paidStatus?: string;
    status?: string;
    quote?: number | null;
    projectValue?: number | null;
    projectLink?: string | null;
    brief?: string | null;
    reference?: string | null;
    deductionOnDelay?: number | null;
    finalReview?: string;
    sourceEmailId?: string | null;
}) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!payload.clientId || !payload.projectName || !payload.projectDate || !payload.dueDate || !payload.accountManagerId) {
        return { success: false, error: 'clientId, projectName, projectDate, dueDate, and accountManagerId are required' };
    }
    // SALES users can only create projects they own
    const managerId = isAdmin(role) ? payload.accountManagerId : userId;
    // Validate numeric fields
    if (payload.quote != null && (typeof payload.quote !== 'number' || !Number.isFinite(payload.quote) || payload.quote < 0)) {
        return { success: false, error: 'Invalid quote value' };
    }
    if (payload.projectValue != null && (typeof payload.projectValue !== 'number' || !Number.isFinite(payload.projectValue) || payload.projectValue < 0)) {
        return { success: false, error: 'Invalid project value' };
    }
    if (payload.deductionOnDelay != null && (typeof payload.deductionOnDelay !== 'number' || !Number.isFinite(payload.deductionOnDelay) || payload.deductionOnDelay < 0)) {
        return { success: false, error: 'Invalid deduction on delay value' };
    }

    const { data, error } = await supabase
        .from('projects')
        .insert({
            client_id: payload.clientId,
            project_name: payload.projectName,
            project_date: payload.projectDate,
            due_date: payload.dueDate,
            account_manager_id: managerId,
            priority: payload.priority || 'MEDIUM',
            paid_status: payload.paidStatus || 'UNPAID',
            // `status` lives in the projects table even though it isn't on the
            // Prisma model — accepted on update, now also on create so the
            // /my-projects modal can persist the picked stage.
            status: payload.status || 'Not Started',
            quote: payload.quote ?? null,
            project_value: payload.projectValue ?? null,
            project_link: payload.projectLink ?? null,
            brief: payload.brief ?? null,
            reference: payload.reference ?? null,
            deduction_on_delay: payload.deductionOnDelay ?? null,
            final_review: payload.finalReview || 'PENDING',
            source_email_id: payload.sourceEmailId ?? null,
        })
        .select('id, project_name, project_date, due_date, paid_status, priority, quote, project_value, project_link, brief, reference, deduction_on_delay, final_review, source_email_id, client_id, account_manager_id, created_at')
        .single();

    if (error) {
        console.error('createProjectAction error:', error);
        return { success: false, error: 'An error occurred while processing your request' };
    }

    // Pipeline invariant: a contact with any project is a paid client.
    // Fire-and-forget — same reasoning as createProjectFromEmailAction.
    markContactClosed(payload.clientId, data?.created_at).catch(err =>
        console.warn('[createProjectAction] markContactClosed failed:', err)
    );

    revalidatePath('/projects');
    return { success: true, project: data };
}

// ── Orphaned Projects (no client linked) ──────────────────────────────────

export async function getOrphanedProjectsAction(page: number = 1, pageSize: number = 10) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);

    const offset = (page - 1) * pageSize;
    let orphanQuery = supabase
        .from('projects')
        .select('id, project_name, project_value, paid_status, project_date, status, account_manager, account_manager_id', { count: 'exact' })
        .is('client_id', null);
    if (ownerFilter) orphanQuery = orphanQuery.eq('account_manager_id', ownerFilter);
    const { data, error, count } = await orphanQuery
        .order('project_value', { ascending: false })
        .range(offset, offset + pageSize - 1);

    if (error) return { projects: [], total: 0, page, pageSize, totalPages: 0, suggestions: {} };

    // For each project, find suggested contacts based on AM's email activity around project date
    const suggestions: Record<string, any[]> = {};

    for (const p of data || []) {
        if (!p.account_manager_id) continue;

        // Get AM's gmail accounts
        const { data: assigns } = await supabase.from('user_gmail_assignments')
            .select('gmail_account_id')
            .eq('user_id', p.account_manager_id);

        if (!assigns || assigns.length === 0) {
            // Fallback: get accounts owned by this AM
            const { data: ownedAccounts } = await supabase.from('gmail_accounts')
                .select('id')
                .eq('user_id', p.account_manager_id);
            if (ownedAccounts) assigns?.push(...ownedAccounts.map(a => ({ gmail_account_id: a.id })));
        }

        const accIds = (assigns || []).map(a => a.gmail_account_id);
        if (accIds.length === 0) continue;

        // Find contacts emailed by this AM around the project date (+/- 30 days)
        if (p.project_date) {
            const projDate = new Date(p.project_date);
            const before = new Date(projDate.getTime() - 30 * 86400000).toISOString();
            const after = new Date(projDate.getTime() + 30 * 86400000).toISOString();

            const { data: nearbyEmails } = await supabase.from('email_messages')
                .select('contact_id, contacts:contact_id(id, name, email, total_revenue, total_projects)')
                .in('gmail_account_id', accIds)
                .gte('sent_at', before)
                .lte('sent_at', after)
                .not('contact_id', 'is', null)
                .order('sent_at', { ascending: false })
                .limit(50);

            // Deduplicate and rank by frequency
            const contactFreq: Record<string, { contact: any; count: number }> = {};
            (nearbyEmails || []).forEach((e: any) => {
                if (!e.contacts) return;
                const cid = e.contact_id;
                if (!contactFreq[cid]) contactFreq[cid] = { contact: e.contacts, count: 0 };
                contactFreq[cid].count++;
            });

            suggestions[p.id] = Object.values(contactFreq)
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)
                .map(cf => ({ ...cf.contact, emailCount: cf.count }));
        }
    }

    return {
        projects: data || [],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
        suggestions,
    };
}

// Get suspiciously linked projects (many projects, few emails)
export async function getSuspiciousLinksAction() {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);

    let q = supabase.from('contacts')
        .select('id, name, email, total_projects, total_emails_sent, total_emails_received, total_revenue')
        .gt('total_projects', 5);
    if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
    const { data } = await q.order('total_projects', { ascending: false }).limit(50);

    return (data || []).filter(c => {
        const totalEmails = (c.total_emails_sent || 0) + (c.total_emails_received || 0);
        return totalEmails < c.total_projects * 0.5; // Less than 0.5 emails per project
    }).map(c => ({
        ...c,
        totalEmails: (c.total_emails_sent || 0) + (c.total_emails_received || 0),
        ratio: ((c.total_emails_sent || 0) + (c.total_emails_received || 0)) / (c.total_projects || 1),
    }));
}

// Unlink all projects from a contact (put back into orphan queue)
export async function unlinkContactProjectsAction(contactId: string) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!contactId) return { success: false, error: 'contactId required' };
    const ownerFilter = getOwnerFilter(userId, role);

    let listQuery = supabase.from('projects').select('id').eq('client_id', contactId);
    if (ownerFilter) listQuery = listQuery.eq('account_manager_id', ownerFilter);
    const { data: projects } = await listQuery;

    const count = projects?.length || 0;
    if (count === 0) return { success: true, unlinked: 0 };

    let unlinkQuery = supabase.from('projects').update({ client_id: null }).eq('client_id', contactId);
    if (ownerFilter) unlinkQuery = unlinkQuery.eq('account_manager_id', ownerFilter);
    const { error } = await unlinkQuery;

    if (error) return { success: false, error: error.message };

    // Reset contact revenue (admin only — SALES can't zero out another manager's counters)
    if (isAdmin(role)) {
        await supabase.from('contacts').update({
            total_revenue: 0,
            unpaid_amount: 0,
            total_projects: 0,
        }).eq('id', contactId);
    }

    return { success: true, unlinked: count };
}

export async function searchContactsForLinkingAction(query: string) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!query || query.trim().length < 2) return [];
    const ownerFilter = getOwnerFilter(userId, role);

    const q = query.trim().replace(/[%_\\]/g, '\\$&');
    let search = supabase
        .from('contacts')
        .select('id, name, email, company, location, total_revenue, total_projects')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`);
    if (ownerFilter) search = search.eq('account_manager_id', ownerFilter);
    const { data } = await search.order('total_revenue', { ascending: false }).limit(10);

    return data || [];
}

export async function linkProjectToContactAction(projectId: string, contactId: string) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!projectId || !contactId) return { success: false, error: 'projectId and contactId required' };
    const ownerFilter = getOwnerFilter(userId, role);

    let linkQuery = supabase.from('projects').update({ client_id: contactId }).eq('id', projectId);
    if (ownerFilter) linkQuery = linkQuery.eq('account_manager_id', ownerFilter);
    const { error } = await linkQuery;

    if (error) return { success: false, error: error.message };

    // Recalculate contact revenue
    const { data: projects } = await supabase
        .from('projects')
        .select('project_value, paid_status')
        .eq('client_id', contactId);

    const totalRevenue = (projects || []).reduce((s: number, p: any) => s + (p.project_value || 0), 0);
    const paidRevenue = (projects || []).filter((p: any) => p.paid_status === 'PAID').reduce((s: number, p: any) => s + (p.project_value || 0), 0);

    await supabase.from('contacts').update({
        total_revenue: totalRevenue,
        unpaid_amount: totalRevenue - paidRevenue,
        total_projects: (projects || []).length,
    }).eq('id', contactId);

    // Pipeline invariant: a contact with any linked project is a paid client.
    // Same call wired into createProjectAction — fire-and-forget so a failure
    // here doesn't roll back the link itself. Mirrors the markContactClosed
    // contract from the earlier pipeline-cleanup work.
    try {
        const { markContactClosed } = await import('../services/pipelineLogic');
        const earliest = (projects || [])
            .map((p: any) => p.created_at as string | undefined)
            .filter(Boolean)
            .sort()[0];
        await markContactClosed(contactId, earliest ?? null);
    } catch (e) {
        console.warn('[linkProjectToContactAction] markContactClosed failed:', e);
    }

    return { success: true };
}

// ── Project-finder for a known contact ───────────────────────────────────
// Inverse of `searchContactsForLinkingAction`: given a contact, surface the
// projects that probably belong to them. Used by the Projects tab on the
// client detail page (the "✨ AI find projects" button).
//
// Pure deterministic scoring — no LLM call. Signals (highest first):
//   1. project.source_email_id resolves to an email_messages row whose
//      contact_id === this contact, OR whose from_email/to_email contains
//      this contact's email.                                        (0.95)
//   2. source-email thread's domain matches the contact's custom domain.
//                                                                   (0.70)
//   3. project_name ILIKE %contact.name% or %email-prefix%.          (0.65)
//   4. brief ILIKE %contact.name/email/company%.                     (0.55)
//   5. reference ILIKE same.                                         (0.40)
//
// Skips projects already linked to THIS contact. Returns top 10.

const COMMON_EMAIL_DOMAINS = new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
    'me.com', 'aol.com', 'live.com', 'ymail.com', 'msn.com', 'protonmail.com',
]);

export type ProjectMatchCandidate = {
    project: {
        id: string;
        project_name: string | null;
        project_value: number | null;
        paid_status: string | null;
        project_date: string | null;
        created_at: string | null;
    };
    score: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    evidence: string;
    /** When non-null, the project is currently attributed to a different
     *  contact — UI should render a Reassign-from-X warning chip. */
    currentClient: { id: string; name: string | null; email: string | null } | null;
};

export async function findProjectsForContactAction(
    contactId: string,
): Promise<{ success: true; candidates: ProjectMatchCandidate[] } | { success: false; error: string }> {
    try {
        const { userId, role } = await ensureAuthenticated();
        blockEditorAccess(role);
        if (!contactId) return { success: false, error: 'contactId is required' };

        const ownerFilter = getOwnerFilter(userId, role);

        // 1. Load the contact (RBAC-scoped).
        let cq = supabase
            .from('contacts')
            .select('id, name, email, company')
            .eq('id', contactId);
        if (ownerFilter) cq = cq.eq('account_manager_id', ownerFilter);
        const { data: contact, error: cErr } = await cq.maybeSingle();
        if (cErr || !contact) return { success: false, error: 'contact not found' };

        const name = (contact.name || '').trim();
        const email = (contact.email || '').trim().toLowerCase();
        const company = (contact.company || '').trim();
        const emailPrefix = email.split('@')[0] || '';
        const domain = email.split('@')[1] || '';
        const customDomain = domain && !COMMON_EMAIL_DOMAINS.has(domain);

        // 2. Pull every project's id + match-relevant fields. Scoped to ~1k
        //    rows total in this DB, so a single fetch is cheap. If volume
        //    grows we can add a trigram index + RPC later.
        const { data: rawProjects, error: pErr } = await supabase
            .from('projects')
            .select('id, project_name, project_value, paid_status, project_date, created_at, brief, reference, source_email_id, client_id');
        if (pErr) return { success: false, error: pErr.message };
        if (!rawProjects) return { success: true, candidates: [] };

        // 3. For projects with a source_email_id, batch-resolve the source
        //    email so we can do the highest-confidence match.
        const sourceEmailIds = Array.from(
            new Set(rawProjects.map((p: any) => p.source_email_id as string | null).filter(Boolean) as string[])
        );
        const sourceEmailById: Record<string, { contact_id: string | null; from_email: string | null; to_email: string | null }> = {};
        for (let i = 0; i < sourceEmailIds.length; i += 200) {
            const batch = sourceEmailIds.slice(i, i + 200);
            const { data: ems } = await supabase
                .from('email_messages')
                .select('id, contact_id, from_email, to_email')
                .in('id', batch);
            for (const m of ems || []) sourceEmailById[m.id as string] = m as any;
        }

        // 4. Score each project. Skip already-linked-to-THIS-contact rows.
        const lcName = name.toLowerCase();
        const lcCompany = company.toLowerCase();
        const candidates: ProjectMatchCandidate[] = [];

        for (const p of rawProjects as any[]) {
            if (p.client_id === contactId) continue;
            let score = 0;
            let evidence = '';

            const src = p.source_email_id ? sourceEmailById[p.source_email_id] : null;
            if (src) {
                const fromAddr = (src.from_email || '').toLowerCase();
                const toAddr = (src.to_email || '').toLowerCase();
                if (
                    src.contact_id === contactId ||
                    (email && (fromAddr.includes(email) || toAddr.includes(email)))
                ) {
                    score = Math.max(score, 0.95);
                    evidence = "Created from a thread on this contact's inbox";
                } else if (customDomain && (fromAddr.includes('@' + domain) || toAddr.includes('@' + domain))) {
                    score = Math.max(score, 0.7);
                    evidence = `Source thread on the same domain (${domain})`;
                }
            }

            const projName = (p.project_name || '').toLowerCase();
            const brief = (p.brief || '').toLowerCase();
            const reference = (p.reference || '').toLowerCase();

            if (lcName && projName.includes(lcName)) {
                if (score < 0.65) {
                    score = 0.65;
                    evidence = 'Project name mentions the contact';
                }
            } else if (emailPrefix && emailPrefix.length >= 4 && projName.includes(emailPrefix)) {
                if (score < 0.6) {
                    score = 0.6;
                    evidence = 'Project name mentions the contact email prefix';
                }
            }

            if (
                lcName && brief.includes(lcName) ||
                (email && brief.includes(email)) ||
                (lcCompany && brief.includes(lcCompany))
            ) {
                if (score < 0.55) {
                    score = 0.55;
                    evidence = 'Brief mentions the contact';
                }
            }
            if (
                (lcName && reference.includes(lcName)) ||
                (email && reference.includes(email))
            ) {
                if (score < 0.4) {
                    score = 0.4;
                    evidence = 'Reference mentions the contact';
                }
            }

            if (score === 0) continue;
            candidates.push({
                project: {
                    id: p.id,
                    project_name: p.project_name,
                    project_value: p.project_value ?? null,
                    paid_status: p.paid_status ?? null,
                    project_date: p.project_date ?? null,
                    created_at: p.created_at ?? null,
                },
                score,
                confidence: score >= 0.85 ? 'HIGH' : score >= 0.6 ? 'MEDIUM' : 'LOW',
                evidence,
                currentClient: null, // filled below
            });
        }

        // 5. Enrich currentClient for projects already attributed elsewhere.
        const otherClientIds = Array.from(
            new Set(
                (rawProjects as any[])
                    .filter(p => p.client_id && p.client_id !== contactId && candidates.some(c => c.project.id === p.id))
                    .map(p => p.client_id as string)
            )
        );
        const clientById: Record<string, { id: string; name: string | null; email: string | null }> = {};
        for (let i = 0; i < otherClientIds.length; i += 200) {
            const batch = otherClientIds.slice(i, i + 200);
            const { data: cs } = await supabase
                .from('contacts')
                .select('id, name, email')
                .in('id', batch);
            for (const c of cs || []) clientById[c.id as string] = c as any;
        }
        // Re-walk to attach currentClient (small loop over candidates).
        const projectClientById: Record<string, string | null> = {};
        for (const p of rawProjects as any[]) projectClientById[p.id as string] = p.client_id ?? null;
        for (const c of candidates) {
            const cid = projectClientById[c.project.id];
            if (cid && cid !== contactId) c.currentClient = clientById[cid] ?? null;
        }

        candidates.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const ad = new Date(a.project.created_at || 0).getTime();
            const bd = new Date(b.project.created_at || 0).getTime();
            return bd - ad;
        });
        return { success: true, candidates: candidates.slice(0, 10) };
    } catch (err: any) {
        console.error('[findProjectsForContactAction]', err);
        return { success: false, error: err?.message || 'Failed to find projects.' };
    }
}

/** Free-text search across all projects for the manual-link modal. */
export type ProjectSearchHit = {
    id: string;
    project_name: string | null;
    project_value: number | null;
    paid_status: string | null;
    project_date: string | null;
    created_at: string | null;
    currentClient: { id: string; name: string | null; email: string | null } | null;
};

export async function searchProjectsAction(
    query: string,
    limit = 20,
): Promise<{ success: true; results: ProjectSearchHit[] } | { success: false; error: string }> {
    try {
        const { role } = await ensureAuthenticated();
        blockEditorAccess(role);
        const q = (query || '').trim();
        if (q.length < 2) return { success: true, results: [] };
        const escaped = q.replace(/[%_\\]/g, '\\$&');

        const { data, error } = await supabase
            .from('projects')
            .select('id, project_name, project_value, paid_status, project_date, created_at, brief, reference, client_id')
            .or(`project_name.ilike.%${escaped}%,brief.ilike.%${escaped}%,reference.ilike.%${escaped}%`)
            .order('created_at', { ascending: false })
            .limit(Math.min(limit, 50));
        if (error) return { success: false, error: error.message };
        if (!data || data.length === 0) return { success: true, results: [] };

        // Enrich currentClient.
        const cids = Array.from(new Set(data.map((p: any) => p.client_id as string | null).filter(Boolean) as string[]));
        const clientById: Record<string, { id: string; name: string | null; email: string | null }> = {};
        if (cids.length > 0) {
            const { data: cs } = await supabase.from('contacts').select('id, name, email').in('id', cids);
            for (const c of cs || []) clientById[c.id as string] = c as any;
        }

        const results: ProjectSearchHit[] = data.map((p: any) => ({
            id: p.id,
            project_name: p.project_name,
            project_value: p.project_value ?? null,
            paid_status: p.paid_status ?? null,
            project_date: p.project_date ?? null,
            created_at: p.created_at ?? null,
            currentClient: p.client_id ? (clientById[p.client_id] ?? null) : null,
        }));
        return { success: true, results };
    } catch (err: any) {
        console.error('[searchProjectsAction]', err);
        return { success: false, error: err?.message || 'Search failed.' };
    }
}

// ── Project tasks (lightweight ActivityLog rows) ─────────────────────────
// The /my-projects drawer's "Add task" button writes a row here. We reuse
// the existing activity_logs table (action='TASK') instead of standing up
// a dedicated tasks table — keeps the surface area small and tasks already
// surface alongside other project activity.
export async function addProjectTaskAction(projectId: string, note: string) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!projectId) return { success: false as const, error: 'projectId is required' };
    const trimmed = note.trim();
    if (!trimmed) return { success: false as const, error: 'Task description is required' };
    if (trimmed.length > 1000) return { success: false as const, error: 'Task is too long (max 1000 chars)' };

    // Identity-scope: SALES can only add tasks to projects they own.
    const ownerFilter = getOwnerFilter(userId, role);
    let projectQuery = supabase.from('projects').select('id, client_id').eq('id', projectId);
    if (ownerFilter) projectQuery = projectQuery.eq('account_manager_id', ownerFilter);
    const { data: project, error: projectErr } = await projectQuery.maybeSingle();
    if (projectErr || !project) {
        return { success: false as const, error: 'Project not found or access denied' };
    }

    const { error } = await supabase.from('activity_logs').insert({
        action: 'TASK',
        performed_by: userId,
        project_id: projectId,
        contact_id: project.client_id ?? null,
        note: trimmed,
    });
    if (error) {
        console.error('addProjectTaskAction error:', error);
        return { success: false as const, error: 'Could not add task' };
    }
    return { success: true as const };
}
