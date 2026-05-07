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
        .select(`id, project_name, project_date, due_date, paid_status, priority, final_review, quote, project_value, project_link, brief, reference, deduction_on_delay, status, person, editor, account_manager, team, tags, client_id, account_manager_id, source_email_id, created_at, contacts:client_id(id, name, email)`, { count: 'exact' });

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

    // Map joined contacts data to the `client` field the frontend expects
    const projects = (data || []).map((p: any) => ({
        ...p,
        client: p.contacts || null,
        client_name: p.contacts?.name || p.person || null,
    }));

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

    return { success: true };
}
