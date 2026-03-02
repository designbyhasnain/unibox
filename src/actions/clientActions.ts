'use server';

import { supabase } from '../lib/supabase';

const ADMIN_USER_ID = '1ca1464d-1009-426e-96d5-8c5e8c84faac';

// 9.0 — Ensure a contact exists for a given email address
export async function ensureContactAction(email: string, name?: string) {
    const cleanMail = email.toLowerCase().trim();

    // 1. Try to find existing
    let { data: contact, error: findError } = await supabase
        .from('contacts')
        .select('id, name, email')
        .eq('email', cleanMail)
        .maybeSingle();

    if (contact) return contact;

    // 2. Create if not found
    const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
            email: cleanMail,
            name: name || cleanMail.split('@')[0],
            pipeline_stage: 'COLD_LEAD',
            account_manager_id: ADMIN_USER_ID,
            updated_at: new Date().toISOString()
        })
        .select('id, name, email')
        .single();

    if (error) {
        console.error('ensureContactAction error:', error);
        return null;
    }

    return newContact;
}

// 9.1 — Fetch all clients with email count and project count for list view
export async function getClientsAction() {
    const { data, error } = await supabase
        .from('contacts')
        .select(`
            id,
            name,
            email,
            pipeline_stage,
            updated_at,
            account_manager_id,
            account_manager:users(name),
            email_messages ( 
                id, 
                is_unread, 
                sent_at, 
                gmail_accounts ( email ) 
            ),
            projects ( id )
        `)
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('getClientsAction error:', error);
        return [];
    }

    return (data ?? []).map((c: any) => {
        // Find latest interaction to show the "Gmail Account" handling this client
        const sortedMessages = (c.email_messages ?? []).sort((a: any, b: any) =>
            new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
        );
        const lastAccount = sortedMessages[0]?.gmail_accounts?.email || 'No Recent Mail';

        return {
            id: c.id,
            name: c.name,
            email: c.email,
            pipeline_stage: c.pipeline_stage,
            updated_at: c.updated_at,
            account_manager_id: c.account_manager_id,
            manager_name: c.account_manager?.name || 'Unassigned',
            account_email: lastAccount,
            project_count: c.projects?.length ?? 0,
            unread_count: (c.email_messages ?? []).filter((m: any) => m.is_unread).length,
        };
    });
}

// 9.x — Fetch a single contact by ID
export async function getContactAction(contactId: string) {
    const { data, error } = await supabase
        .from('contacts')
        .select('id, name, email')
        .eq('id', contactId)
        .single();

    if (error) {
        console.error('getContactAction error:', error);
        return null;
    }

    return data;
}

// 9.2 Tab 2 — Fetch projects for a specific contact
export async function getClientProjectsAction(contactId: string) {
    const { data, error } = await supabase
        .from('projects')
        .select(`
            id,
            project_name,
            project_date,
            due_date,
            paid_status,
            priority,
            created_at
        `)
        .eq('client_id', contactId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('getClientProjectsAction error:', error);
        return [];
    }

    return data ?? [];
}

export type ClientUpdatePayload = {
    name?: string;
    email?: string;
    pipeline_stage?: string;
    contact_status?: string;
    account_manager_id?: string;
};

export async function updateClientAction(clientId: string, updates: ClientUpdatePayload) {
    const payload: any = { ...updates, updated_at: new Date().toISOString() };

    // Remove undefined values
    Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) {
            delete payload[key];
        }
    });

    const { data, error } = await supabase
        .from('contacts')
        .update(payload)
        .eq('id', clientId)
        .select(`
            id,
            name,
            email,
            pipeline_stage,
            updated_at,
            account_manager:users(name)
        `)
        .single();

    if (error) {
        console.error('updateClientAction error:', error);
        return { success: false, error: error.message };
    }

    return { success: true, client: data };
}
