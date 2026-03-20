'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';

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
};

// Fetch all projects with client and manager details
// Optimised: select only needed columns instead of *, and simplified sourceEmail join.
export async function getAllProjectsAction(gmailAccountId?: string) {
    await ensureAuthenticated();
    let query = supabase
        .from('projects')
        .select(`
            id,
            project_name,
            project_date,
            due_date,
            paid_status,
            priority,
            quote,
            project_value,
            project_link,
            brief,
            reference,
            deduction_on_delay,
            final_review,
            source_email_id,
            client_id,
            account_manager_id,
            created_at,
            client:contacts(id, name, email),
            manager:users(id, name),
            sourceEmail:email_messages!source_email_id(gmail_account_id, gmail_accounts(email))
        `);

    if (gmailAccountId && gmailAccountId !== 'ALL') {
        query = query.eq('email_messages.gmail_account_id', gmailAccountId);
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(500);

    if (error) {
        console.error('getAllProjectsAction error:', error);
        return [];
    }

    // Flatten nested joins: Supabase returns named joins as arrays, but UI expects objects
    const flattened = (data || []).map((p: any) => ({
        ...p,
        client: Array.isArray(p.client) ? p.client[0] ?? null : p.client,
        manager: Array.isArray(p.manager) ? p.manager[0] ?? null : p.manager,
        sourceEmail: Array.isArray(p.sourceEmail) ? p.sourceEmail[0] ?? null : p.sourceEmail,
    }));

    if (gmailAccountId && gmailAccountId !== 'ALL') {
        return flattened.filter((p: any) => p.sourceEmail !== null);
    }

    return flattened;
}

// Fetch all account managers for dropdowns
export async function getManagersAction() {
    await ensureAuthenticated();
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
    await ensureAuthenticated();
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
    const userId = await ensureAuthenticated();
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
    await ensureAuthenticated();
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
