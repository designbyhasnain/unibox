'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { normalizeEmail } from '../utils/emailNormalizer';
import { getAccessibleGmailAccountIds, getOwnerFilter, blockEditorAccess, isAdmin } from '../utils/accessControl';
import { transferContactAction } from './contactDetailActions';

// 9.0 — Ensure a contact exists for a given email address
export async function ensureContactAction(email: string, name?: string) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
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
    relationship_health?: string;
    account_manager_id?: string;
    source?: string;
    notes?: string;
};

export async function createClientAction(payload: CreateClientPayload) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!payload.email || !payload.name) return { success: false, error: 'Name and email are required' };

    const cleanMail = normalizeEmail(payload.email);

    // Check if contact already exists
    const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('email', cleanMail)
        .maybeSingle();

    if (existing) return { success: false, error: 'A contact with this email already exists' };

    // Mass-assignment guard: SALES cannot assign ownership to another user.
    // Admins may set account_manager_id explicitly; SALES is forced to themselves.
    const requestedAm = payload.account_manager_id;
    const finalAm = isAdmin(role) ? (requestedAm || userId) : userId;

    const insertData: Record<string, any> = {
        email: cleanMail,
        name: payload.name,
        pipeline_stage: payload.pipeline_stage || 'LEAD',
        account_manager_id: finalAm,
        updated_at: new Date().toISOString(),
    };

    if (payload.company) insertData.company = payload.company;
    if (payload.phone) insertData.phone = payload.phone;
    if (payload.priority) insertData.priority = payload.priority;
    if (payload.estimated_value) insertData.estimated_value = payload.estimated_value;
    if (payload.expected_close_date) insertData.expected_close_date = payload.expected_close_date;
    if (payload.relationship_health) insertData.relationship_health = payload.relationship_health;
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
    stageFilter?: string,
): Promise<PaginatedClientsResult> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
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

    // SALES branch — sees contacts where they're the assigned account_manager_id
    // OR where the contact's last_gmail_account_id is one of their assigned
    // inboxes. Phase 1 commit 2ef18b6 closed the leak where SALES with no
    // assignments fell through to the admin branch; the synthetic-workflow
    // run found this was *too* aggressive — a SALES user who creates a new
    // contact (no email yet → no last_gmail_account_id) couldn't see it in
    // their own list. Now we always include account_manager_id matches as a
    // secondary path. ADMINs continue to use the unconstrained branch below.
    if (accessible !== 'ALL') {
        const offset = (page - 1) * clampedPageSize;
        const orParts: string[] = [`account_manager_id.eq.${userId}`];
        if (accountIds && accountIds.length > 0) {
            orParts.push(`last_gmail_account_id.in.(${accountIds.join(',')})`);
        }

        let query = supabase
            .from('contacts')
            .select('id, name, email, phone, company, location, source, pipeline_stage, contact_type, is_lead, is_client, priority, estimated_value, lead_score, open_count, last_email_at, last_gmail_account_id, account_manager_id, created_at, updated_at, total_revenue, paid_revenue, unpaid_amount, total_projects, avg_project_value, client_since, client_tier', { count: 'exact' })
            .or(orParts.join(','));

        if (search?.trim()) {
            const s = search.trim().replace(/[%_\\]/g, '\\$&');
            query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%,company.ilike.%${s}%`);
        }
        if (stageFilter) query = query.eq('pipeline_stage', stageFilter);
        else if (filterType === 'LEADS') query = query.eq('is_lead', true).eq('is_client', false);
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

    // ADMIN/ACCOUNT_MANAGER: direct query with all columns
    const offset = (page - 1) * clampedPageSize;
    let adminQuery = supabase
        .from('contacts')
        .select('id, name, email, phone, company, location, source, pipeline_stage, contact_type, is_lead, is_client, priority, estimated_value, lead_score, open_count, last_email_at, last_gmail_account_id, account_manager_id, created_at, updated_at, total_revenue, paid_revenue, unpaid_amount, total_projects, avg_project_value, client_since, client_tier, total_emails_sent, total_emails_received, days_since_last_contact, relationship_health', { count: 'exact' });

    if (search?.trim()) {
        const s = search.trim().replace(/[%_\\]/g, '\\$&');
        adminQuery = adminQuery.or(`name.ilike.%${s}%,email.ilike.%${s}%,company.ilike.%${s}%`);
    }
    if (stageFilter) adminQuery = adminQuery.eq('pipeline_stage', stageFilter);
    else if (filterType === 'LEADS') adminQuery = adminQuery.in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD']);
    else if (filterType === 'CLIENTS') adminQuery = adminQuery.in('pipeline_stage', ['OFFER_ACCEPTED', 'CLOSED']);

    const { data: adminClients, error: adminErr, count: adminCount } = await adminQuery
        .order('last_email_at', { ascending: false, nullsFirst: false })
        .range(offset, offset + clampedPageSize - 1);

    if (adminErr) {
        console.error('getClientsAction admin query error:', adminErr);
        return { clients: [], totalCount: 0, page, pageSize: clampedPageSize, totalPages: 0 };
    }

    const totalCount = adminCount ?? 0;
    return {
        clients: adminClients || [],
        totalCount,
        page,
        pageSize: clampedPageSize,
        totalPages: Math.ceil(totalCount / clampedPageSize),
    };
}

export async function getStageCounts(): Promise<Record<string, number>> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);
    const stages = ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED', 'CLOSED', 'NOT_INTERESTED'];
    const counts: Record<string, number> = {};
    let total = 0;

    await Promise.all(stages.map(async (stage) => {
        let q = supabase
            .from('contacts')
            .select('id', { count: 'exact', head: true })
            .eq('pipeline_stage', stage);
        if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
        const { count } = await q;
        counts[stage] = count ?? 0;
        total += counts[stage];
    }));

    counts['ALL'] = total;
    return counts;
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
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!email) return { isDuplicate: false, matches: [] };

    const cleanEmail = normalizeEmail(email);
    const ownerFilter = getOwnerFilter(userId, role);

    // SALES users skip the workspace-wide RPC entirely — it returns matches
    // across the whole tenant including other AMs' clients. Use the scoped
    // fallback path that filters by account_manager_id.
    const { data, error } = ownerFilter
        ? { data: null, error: { message: 'sales-scoped-path' } as any }
        : await supabase.rpc('check_contact_duplicates', {
            p_email: cleanEmail,
            p_name: name || null,
            p_company: company || null,
        });

    if (error) {
        // Fallback path scopes by owner so SALES cannot enumerate cross-team contacts.
        let exactQ = supabase
            .from('contacts')
            .select('id, name, email, company, account_manager_id')
            .eq('email', cleanEmail);
        if (ownerFilter) exactQ = exactQ.eq('account_manager_id', ownerFilter);
        const { data: exact } = await exactQ.maybeSingle();

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
    blockEditorAccess(role);
    if (!contactId) return null;
    const ownerFilter = getOwnerFilter(userId, role);

    let q = supabase
        .from('contacts')
        .select('id, name, email, account_manager_id')
        .eq('id', contactId);
    if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
    const { data, error } = await q.maybeSingle();

    if (error) {
        console.error('getContactAction error:', error);
        return null;
    }

    return data;
}

// 9.2 Tab 2 — Fetch projects for a specific contact
export async function getClientProjectsAction(contactId: string) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!contactId) return [];
    const ownerFilter = getOwnerFilter(userId, role);

    // Ensure the contact itself is accessible before returning its projects
    if (ownerFilter) {
        const { data: owned } = await supabase
            .from('contacts')
            .select('id')
            .eq('id', contactId)
            .eq('account_manager_id', ownerFilter)
            .maybeSingle();
        if (!owned) return [];
    }

    let q = supabase
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
        .eq('client_id', contactId);
    if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(100);

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
    blockEditorAccess(role);
    if (!contactIds || contactIds.length === 0) return { success: false, error: 'No contacts selected' };

    // SALES can only delete contacts they own. Restrict IDs to owned rows first.
    let allowedIds = contactIds;
    if (!isAdmin(role)) {
        const { data: owned } = await supabase
            .from('contacts')
            .select('id')
            .in('id', contactIds)
            .eq('account_manager_id', userId);
        allowedIds = (owned || []).map((r: any) => r.id);
        if (allowedIds.length === 0) {
            return { success: false, error: 'No accessible contacts to delete' };
        }
    }

    // Nullify foreign keys on email_messages to preserve email history
    await supabase
        .from('email_messages')
        .update({ contact_id: null })
        .in('contact_id', allowedIds);

    const { error } = await supabase
        .from('contacts')
        .delete()
        .in('id', allowedIds);

    if (error) {
        console.error('removeClientsAction error:', error);
        return { success: false, error: 'Failed to delete clients' };
    }

    revalidatePath('/clients');
    return { success: true, removed: allowedIds.length };
}

export async function updateClientAction(clientId: string, updates: ClientUpdatePayload) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!clientId) return { success: false, error: 'clientId is required' };
    const ownerFilter = getOwnerFilter(userId, role);

    // AM reassignment is a separate audited transfer — defer to the chokepoint.
    // See docs/AM-CREDIT-AND-OWNERSHIP-SCOPE.md §3.2.
    if (updates.account_manager_id !== undefined && isAdmin(role)) {
        const transferResult = await transferContactAction(clientId, updates.account_manager_id || null, { source: 'manual' });
        if (!transferResult.success) return transferResult;
    }

    // Whitelist allowed fields to prevent mass assignment.
    // account_manager_id intentionally excluded — handled above by transferContactAction.
    const allowedFields: (keyof ClientUpdatePayload)[] = ['name', 'email', 'company', 'phone', 'location', 'priority', 'estimated_value', 'expected_close_date', 'pipeline_stage', 'contact_status'];
    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            payload[field] = field === 'email' ? normalizeEmail(updates[field] as string) : updates[field];
        }
    }

    // If only account_manager_id was updated, the chokepoint already wrote and revalidated — short-circuit.
    if (Object.keys(payload).length === 1) {
        const { data } = await supabase
            .from('contacts')
            .select(`id, name, email, pipeline_stage, updated_at, account_manager:users(name)`)
            .eq('id', clientId)
            .maybeSingle();
        return { success: true, client: data };
    }

    let q = supabase.from('contacts').update(payload).eq('id', clientId);
    if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
    const { data, error } = await q
        .select(`
            id,
            name,
            email,
            pipeline_stage,
            updated_at,
            account_manager:users(name)
        `)
        .maybeSingle();

    if (error) {
        console.error('updateClientAction error:', error);
        return { success: false, error: 'An error occurred while processing your request' };
    }

    revalidatePath('/clients');
    return { success: true, client: data };
}
