'use server';

import { supabase } from '../lib/supabase';

const ADMIN_USER_ID = '1ca1464d-1009-426e-96d5-8c5e8c84faac';

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
export async function getAllProjectsAction(gmailAccountId?: string) {
    let query = supabase
        .from('projects')
        .select(`
            *,
            client:contacts(id, name, email),
            manager:users(id, name),
            sourceEmail:email_messages(gmail_account_id, gmail_accounts(email))
        `);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.error('getAllProjectsAction error:', error);
        return [];
    }

    if (gmailAccountId && gmailAccountId !== 'ALL') {
        return (data || []).filter((p: any) => p.sourceEmail?.gmail_account_id === gmailAccountId);
    }

    return data ?? [];
}

// Fetch all account managers for dropdowns
export async function getManagersAction() {
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
    const { data, error } = await supabase
        .from('projects')
        .update({
            project_name: payload.projectName,
            project_date: payload.projectDate,
            due_date: payload.dueDate,
            account_manager_id: payload.accountManagerId,
            paid_status: payload.paidStatus,
            quote: payload.quote,
            project_value: payload.projectValue,
            project_link: payload.projectLink,
            brief: payload.brief,
            reference: payload.reference,
            deduction_on_delay: payload.deductionOnDelay,
            final_review: payload.finalReview,
            priority: payload.priority
        })
        .eq('id', projectId)
        .select('*')
        .single();

    if (error) {
        console.error('updateProjectAction error:', error);
        return { success: false, error: error.message };
    }

    return { success: true, project: data };
}

// Create project from an email thread (traceability)
export async function createProjectFromEmailAction(payload: {
    clientId: string;
    projectName: string;
    sourceEmailId: string;
    accountManagerId?: string;
}) {
    const { data, error } = await supabase
        .from('projects')
        .insert({
            client_id: payload.clientId,
            project_name: payload.projectName,
            source_email_id: payload.sourceEmailId,
            account_manager_id: payload.accountManagerId || ADMIN_USER_ID,
            project_date: new Date().toISOString(),
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // +7 days default
            paid_status: 'UNPAID',
            priority: 'MEDIUM',
            final_review: 'PENDING'
        })
        .select('*')
        .single();

    if (error) {
        console.error('createProjectFromEmailAction error:', error);
        return { success: false, error: error.message };
    }

    return { success: true, project: data };
}

// Create a new project manually
export async function createProjectAction(payload: {
    clientId: string;
    projectName: string;
    projectDate: string;
    dueDate: string;
    accountManagerId: string;
    priority?: string | undefined;
    paidStatus?: string | undefined;
    quote?: number | null | undefined;
    brief?: string | null | undefined;
    sourceEmailId?: string | null | undefined;
}) {
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
            brief: payload.brief ?? null,
            source_email_id: payload.sourceEmailId ?? null,
            final_review: 'PENDING',
        })
        .select('*')
        .single();

    if (error) {
        console.error('createProjectAction error:', error);
        return { success: false, error: error.message };
    }

    return { success: true, project: data };
}
