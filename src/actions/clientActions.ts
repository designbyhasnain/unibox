'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { normalizeEmail } from '../utils/emailNormalizer';
import { getAccessibleGmailAccountIds } from '../utils/accessControl';

// 9.0 — Ensure a contact exists for a given email address
export async function ensureContactAction(email: string, name?: string) {
    const { userId, role } = await ensureAuthenticated();
    if (!email || typeof email !== 'string') return null;
    const cleanMail = normalizeEmail(email);

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
            account_manager_id: userId,
            updated_at: new Date().toISOString()
        })
        .select('id, name, email')
        .single();

    if (error) {
        console.error('ensureContactAction error:', error);
        return null;
    }

    revalidatePath('/clients');
    return newContact;
}

// 9.0b — Create a new client/lead with all fields
export type CreateClientPayload = {
    name: string;
    email: string;
    company?: string;
    phone?: string;
    priority?: string;
    estimated_value?: number;
    expected_close_date?: string;
    pipeline_stage?: string;
    account_manager_id?: string;
    source?: string;
    notes?: string;
};

export async function createClientAction(payload: CreateClientPayload) {
    const { userId, role } = await ensureAuthenticated();
    if (!payload.email || !payload.name) return { success: false, error: 'Name and email are required' };

    const cleanMail = normalizeEmail(payload.email);

    // Check if contact already exists
    const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('email', cleanMail)
        .maybeSingle();

    if (existing) return { success: false, error: 'A contact with this email already exists' };

    const insertData: Record<string, any> = {
        email: cleanMail,
        name: payload.name,
        pipeline_stage: payload.pipeline_stage || 'LEAD',
        account_manager_id: payload.account_manager_id || userId,
        updated_at: new Date().toISOString(),
    };

    if (payload.company) insertData.company = payload.company;
    if (payload.phone) insertData.phone = payload.phone;
    if (payload.priority) insertData.priority = payload.priority;
    if (payload.estimated_value) insertData.estimated_value = payload.estimated_value;
    if (payload.expected_close_date) insertData.expected_close_date = payload.expected_close_date;
    if (payload.source) insertData.source = payload.source;
    if (payload.notes) insertData.notes = payload.notes;

    const { data, error } = await supabase
        .from('contacts')
        .insert(insertData)
        .select('id, name, email')
        .single();

    if (error) {
        console.error('createClientAction error:', error);
        return { success: false, error: 'Failed to create client' };
    }

    revalidatePath('/clients');
    return { success: true, client: data };
}

// 9.1 — Fetch clients with server-side pagination via single RPC
// Everything (contacts, email stats, manager, project count, gmail account)
// is resolved in ONE database round trip for maximum speed.
export type PaginatedClientsResult = {
    clients: any[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

export async function getClientsAction(
    gmailAccountId?: string,
    page: number = 1,
    pageSize: number = 50,
    search?: string,
    filterType?: 'ALL' | 'LEADS' | 'CLIENTS',
): Promise<PaginatedClientsResult> {
    const { userId, role } = await ensureAuthenticated();
    const accessible = await getAccessibleGmailAccountIds(userId, role);

    const clampedPageSize = Math.min(Math.max(pageSize, 10), 100);

    // Resolve account IDs for filtering
    let accountIds: string[] | null = null;
    if (gmailAccountId && gmailAccountId !== 'ALL') {
        if (accessible !== 'ALL' && !accessible.includes(gmailAccountId)) {
            return { clients: [], totalCount: 0, page, pageSize: clampedPageSize, totalPages: 0 };
        }
        accountIds = [gmailAccountId];
    } else if (accessible !== 'ALL') {
        accountIds = accessible;
    }

    // For SALES users (accountIds is set), use direct query — RPC doesn't filter by account
    if (accountIds && accountIds.length > 0) {
        const offset = (page - 1) * clampedPageSize;
        let query = supabase
            .from('contacts')
            .select('id, name, email, phone, company, location, source, pipeline_stage, contact_type, is_lead, is_client, priority, estimated_value, lead_score, open_count, last_email_at, last_gmail_account_id, account_manager_id, created_at, updated_at', { count: 'exact' })
            .in('last_gmail_account_id', accountIds);

        if (search?.trim()) {
            const s = search.trim().replace(/[%_\\]/g, '\\$&');
            query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%,company.ilike.%${s}%`);
        }
        if (filterType === 'LEADS') query = query.eq('is_lead', true).eq('is_client', false);
        else if (filterType === 'CLIENTS') query = query.eq('is_client', true);

        const { data: clients, error: directErr, count } = await query
            .order('last_email_at', { ascending: false, nullsFirst: false })
            .range(offset, offset + clampedPageSize - 1);

        if (directErr) {
            console.error('getClientsAction direct query error:', directErr);
            return { clients: [], totalCount: 0, page, pageSize: clampedPageSize, totalPages: 0 };
        }

        const totalCount = count ?? 0;
        return {
            clients: clients || [],
            totalCount,
            page,
            pageSize: clampedPageSize,
            totalPages: Math.ceil(totalCount / clampedPageSize),
        };
    }

    // ADMIN/ACCOUNT_MANAGER: use RPC for full-featured query with stats
    const { data, error } = await supabase.rpc('get_clients_page', {
        p_page: page,
        p_page_size: clampedPageSize,
        p_search: search || null,
        p_filter_type: filterType || 'ALL',
        p_account_ids: null,
    });

    if (error) {
        console.error('getClientsAction RPC error:', error);
        return { clients: [], totalCount: 0, page, pageSize: clampedPageSize, totalPages: 0 };
    }

    return {
        clients: data?.clients || [],
        totalCount: data?.totalCount || 0,
        page: data?.page || page,
        pageSize: data?.pageSize || clampedPageSize,
        totalPages: data?.totalPages || 0,
    };
}

// ─── Deduplication Engine (v2) ───────────────────────────────────────────────

export type DuplicateMatch = {
    matchType: string;
    contactId: string;
    contactName: string;
    contactEmail: string;
    contactCompany: string | null;
    managerName: string;
    lastContacted: string | null;
    similarityScore: number;
};

export async function checkDuplicateAction(
    email: string,
    name?: string,
    company?: string
): Promise<{ isDuplicate: boolean; matches: DuplicateMatch[] }> {
    await ensureAuthenticated();
    if (!email) return { isDuplicate: false, matches: [] };

    const cleanEmail = normalizeEmail(email);

    const { data, error } = await supabase.rpc('check_contact_duplicates', {
        p_email: cleanEmail,
        p_name: name || null,
        p_company: company || null,
    });

    if (error) {
        const { data: exact } = await supabase
            .from('contacts')
            .select('id, name, email, company, account_manager_id')
            .eq('email', cleanEmail)
            .maybeSingle();

        if (exact) {
            return {
                isDuplicate: true,
                matches: [{
                    matchType: 'exact_email',
                    contactId: exact.id,
                    contactName: exact.name || '',
                    contactEmail: exact.email,
                    contactCompany: exact.company,
                    managerName: 'Unknown',
                    lastContacted: null,
                    similarityScore: 1.0,
                }],
            };
        }
        return { isDuplicate: false, matches: [] };
    }

    const matches: DuplicateMatch[] = (data || []).map((r: any) => ({
        matchType: r.match_type,
        contactId: r.contact_id,
        contactName: r.contact_name || '',
        contactEmail: r.contact_email,
        contactCompany: r.contact_company,
        managerName: r.manager_name || 'Unassigned',
        lastContacted: r.last_contacted,
        similarityScore: r.similarity_score,
    }));

    return {
        isDuplicate: matches.some(m => m.matchType === 'exact_email'),
        matches,
    };
}

// 9.x — Fetch a single contact by ID
export async function getContactAction(contactId: string) {
    const { userId, role } = await ensureAuthenticated();
    if (!contactId) return null;
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
    const { userId, role } = await ensureAuthenticated();
    if (!contactId) return [];
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
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('getClientProjectsAction error:', error);
        return [];
    }

    return data ?? [];
}

export type ClientUpdatePayload = {
    name?: string;
    email?: string;
    company?: string;
    phone?: string;
    location?: string;
    priority?: string;
    estimated_value?: number;
    expected_close_date?: string;
    pipeline_stage?: string;
    contact_status?: string;
    account_manager_id?: string;
};

// Delete clients — hard delete from database
export async function removeClientsAction(contactIds: string[]) {
    const { userId, role } = await ensureAuthenticated();
    if (!contactIds || contactIds.length === 0) return { success: false, error: 'No contacts selected' };

    // Nullify foreign keys on email_messages to preserve email history
    await supabase
        .from('email_messages')
        .update({ contact_id: null })
        .in('contact_id', contactIds);

    const { error } = await supabase
        .from('contacts')
        .delete()
        .in('id', contactIds);

    if (error) {
        console.error('removeClientsAction error:', error);
        return { success: false, error: 'Failed to delete clients' };
    }

    revalidatePath('/clients');
    return { success: true, removed: contactIds.length };
}

export async function updateClientAction(clientId: string, updates: ClientUpdatePayload) {
    const { userId, role } = await ensureAuthenticated();
    if (!clientId) return { success: false, error: 'clientId is required' };

    // Whitelist allowed fields to prevent mass assignment
    const allowedFields: (keyof ClientUpdatePayload)[] = ['name', 'email', 'company', 'phone', 'location', 'priority', 'estimated_value', 'expected_close_date', 'pipeline_stage', 'contact_status', 'account_manager_id'];
    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            payload[field] = field === 'email' ? normalizeEmail(updates[field] as string) : updates[field];
        }
    }

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
        return { success: false, error: 'An error occurred while processing your request' };
    }

    revalidatePath('/clients');
    return { success: true, client: data };
}
