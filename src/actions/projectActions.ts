'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds } from '../utils/accessControl';

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
    const accessible = await getAccessibleGmailAccountIds(userId, role);

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

    // Filter projects for SALES users: only show projects assigned to them
    if (accessible !== 'ALL') {
        query = query.eq('account_manager_id', userId);
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

// Fetch all account managers for dropdowns
export async function getManagersAction() {
    const { userId, role } = await ensureAuthenticated();
    const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .order('name');

    if (error) {
        console.error('getManagersAction error:', error);
        return [];
    }

    return data ?? [];
}

// Update an existing project
export async function updateProjectAction(projectId: string, payload: ProjectUpdatePayload) {
    const { userId, role } = await ensureAuthenticated();
    if (!projectId) return { success: false, error: 'projectId is required' };
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

    const { data, error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId)
        .select('id, project_name, project_date, due_date, paid_status, priority, quote, project_value, project_link, brief, reference, deduction_on_delay, final_review, source_email_id, client_id, account_manager_id, created_at')
        .single();

    if (error) {
        console.error('updateProjectAction error:', error);
        return { success: false, error: 'An error occurred while processing your request' };
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
    if (!payload.clientId || !payload.projectName || !payload.sourceEmailId) {
        return { success: false, error: 'clientId, projectName, and sourceEmailId are required' };
    }
    const { data, error } = await supabase
        .from('projects')
        .insert({
            client_id: payload.clientId,
            project_name: payload.projectName,
            source_email_id: payload.sourceEmailId,
            account_manager_id: payload.accountManagerId || userId,
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
    if (!payload.clientId || !payload.projectName || !payload.projectDate || !payload.dueDate || !payload.accountManagerId) {
        return { success: false, error: 'clientId, projectName, projectDate, dueDate, and accountManagerId are required' };
    }
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
            account_manager_id: payload.accountManagerId,
            priority: payload.priority || 'MEDIUM',
            paid_status: payload.paidStatus || 'UNPAID',
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

    revalidatePath('/projects');
    return { success: true, project: data };
}

// ── Orphaned Projects (no client linked) ──────────────────────────────────

export async function getOrphanedProjectsAction(page: number = 1, pageSize: number = 10) {
    await ensureAuthenticated();

    const offset = (page - 1) * pageSize;
    const { data, error, count } = await supabase
        .from('projects')
        .select('id, project_name, project_value, paid_status, project_date, status, account_manager, account_manager_id', { count: 'exact' })
        .is('client_id', null)
        .order('project_value', { ascending: false })
        .range(offset, offset + pageSize - 1);

    if (error) return { projects: [], total: 0, page, pageSize, totalPages: 0 };

    return {
        projects: data || [],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
    };
}

export async function searchContactsForLinkingAction(query: string) {
    await ensureAuthenticated();
    if (!query || query.trim().length < 2) return [];

    const q = query.trim().replace(/[%_\\]/g, '\\$&');
    const { data } = await supabase
        .from('contacts')
        .select('id, name, email, company, location, total_revenue, total_projects')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`)
        .order('total_revenue', { ascending: false })
        .limit(10);

    return data || [];
}

export async function linkProjectToContactAction(projectId: string, contactId: string) {
    await ensureAuthenticated();
    if (!projectId || !contactId) return { success: false, error: 'projectId and contactId required' };

    const { error } = await supabase
        .from('projects')
        .update({ client_id: contactId })
        .eq('id', projectId);

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
