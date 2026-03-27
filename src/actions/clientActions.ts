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

// 9.1 — Fetch all clients with project count for list view
// Optimised: no longer joins email_messages (124K rows). Email stats are
// fetched with a lightweight grouped-count query instead.
export async function getClientsAction(gmailAccountId?: string) {
    const { userId, role } = await ensureAuthenticated();
    const accessible = await getAccessibleGmailAccountIds(userId, role);
    // 1. Fetch contacts with only small-table joins (projects, users, lastGmailAccount)
    const { data: contacts, error } = await supabase
        .from('contacts')
        .select(`
            id,
            name,
            email,
            company,
            phone,
            priority,
            estimated_value,
            expected_close_date,
            pipeline_stage,
            is_client,
            is_lead,
            created_at,
            updated_at,
            last_email_at,
            last_gmail_account_id,
            account_manager_id,
            account_manager:users(name),
            last_gmail_account:gmail_accounts!last_gmail_account_id(id, email, name),
            projects ( id )
        `)
        .order('updated_at', { ascending: false })
        .limit(500);

    if (error) {
        console.error('getClientsAction error:', error);
        return [];
    }

    if (!contacts || contacts.length === 0) return [];

    const contactIds = contacts.map((c: any) => c.id);

    // 2a. Build a gmail account ID → email lookup map
    const { data: gmailAccounts } = await supabase
        .from('gmail_accounts')
        .select('id, email');
    const accountEmailMap = new Map<string, string>();
    for (const acc of gmailAccounts ?? []) {
        accountEmailMap.set(acc.id, acc.email);
    }

    // 2b. Build contact email lookup
    const emailToContactId = new Map<string, string>();
    for (const c of contacts) {
        if (c.email) emailToContactId.set(c.email.toLowerCase(), c.id);
    }
    const contactEmails = [...emailToContactId.keys()];

    // 2c. Fetch emails matching contacts — two strategies combined:
    //     Strategy A: by contact_id (works when FK is set)
    //     Strategy B: by from_email/to_email ilike (works always)
    const statsMap = new Map<string, { total: number; unread: number; lastAccountEmail: string; lastEmailDate: string | null }>();

    // Helper to extract clean email from "Name <email>" format
    const extractEmail = (raw: string): string => {
        const match = raw.match(/<([^>]+)>/);
        return match?.[1] ? match[1].toLowerCase() : raw.toLowerCase().trim();
    };

    // Strategy A: fetch by contact_id (fast, indexed)
    if (contactIds.length > 0) {
        let queryA = supabase
            .from('email_messages')
            .select('contact_id, is_unread, sent_at, gmail_account_id')
            .in('contact_id', contactIds)
            .order('sent_at', { ascending: false })
            .limit(5000);

        if (gmailAccountId && gmailAccountId !== 'ALL') {
            if (accessible !== 'ALL' && !accessible.includes(gmailAccountId)) return [];
            queryA = queryA.eq('gmail_account_id', gmailAccountId);
        } else if (accessible !== 'ALL') {
            queryA = queryA.in('gmail_account_id', accessible);
        }

        const { data: rowsA } = await queryA;
        for (const row of rowsA ?? []) {
            const cid = (row as any).contact_id;
            if (!cid) continue;
            if (!statsMap.has(cid)) {
                const accId = (row as any).gmail_account_id;
                statsMap.set(cid, {
                    total: 0, unread: 0,
                    lastAccountEmail: accId ? (accountEmailMap.get(accId) || 'No Recent Mail') : 'No Recent Mail',
                    lastEmailDate: (row as any).sent_at || null,
                });
            }
            const s = statsMap.get(cid)!;
            s.total += 1;
            if ((row as any).is_unread) s.unread += 1;
        }
    }

    // Strategy B: for contacts not found via contact_id, search by email address
    const missingContactEmails = contactEmails.filter(email => {
        const cid = emailToContactId.get(email);
        return cid && !statsMap.has(cid);
    });

    if (missingContactEmails.length > 0) {
        // Batch in groups of 20 to avoid query size limits
        const BATCH = 20;
        for (let i = 0; i < missingContactEmails.length; i += BATCH) {
            const batch = missingContactEmails.slice(i, i + BATCH);
            // Build OR filter: from_email or to_email contains each email
            const orFilters = batch.map(e => `from_email.ilike.%${e}%,to_email.ilike.%${e}%`).join(',');

            let queryB = supabase
                .from('email_messages')
                .select('from_email, to_email, is_unread, sent_at, gmail_account_id')
                .or(orFilters)
                .order('sent_at', { ascending: false })
                .limit(2000);

            if (gmailAccountId && gmailAccountId !== 'ALL') {
                queryB = queryB.eq('gmail_account_id', gmailAccountId);
            } else if (accessible !== 'ALL') {
                queryB = queryB.in('gmail_account_id', accessible);
            }

            const { data: rowsB } = await queryB;
            for (const row of rowsB ?? []) {
                const from = extractEmail((row as any).from_email || '');
                const to = extractEmail((row as any).to_email || '');

                let cid = emailToContactId.get(from) || emailToContactId.get(to);
                if (!cid) continue;

                if (!statsMap.has(cid)) {
                    const accId = (row as any).gmail_account_id;
                    statsMap.set(cid, {
                        total: 0, unread: 0,
                        lastAccountEmail: accId ? (accountEmailMap.get(accId) || 'No Recent Mail') : 'No Recent Mail',
                        lastEmailDate: (row as any).sent_at || null,
                    });
                }
                const s = statsMap.get(cid)!;
                s.total += 1;
                if ((row as any).is_unread) s.unread += 1;
            }
        }
    }

    // 4. Merge and return
    const filteredData = contacts.map((c: any) => {
        const stats = statsMap.get(c.id);

        // When filtering by account, skip clients with zero messages in that account
        if (gmailAccountId && gmailAccountId !== 'ALL' && !stats) {
            return null;
        }

        const lastGmail = c.last_gmail_account as any;

        return {
            id: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
            phone: c.phone,
            priority: c.priority,
            estimated_value: c.estimated_value,
            expected_close_date: stats?.lastEmailDate || c.last_email_at || c.expected_close_date,
            pipeline_stage: c.pipeline_stage,
            is_client: c.is_client ?? false,
            is_lead: c.is_lead ?? false,
            created_at: c.created_at,
            updated_at: c.updated_at,
            last_email_at: c.last_email_at,
            account_manager_id: c.account_manager_id,
            manager_name: c.account_manager?.name || 'Unassigned',
            account_email: stats?.lastAccountEmail || lastGmail?.email || 'No Recent Mail',
            project_count: c.projects?.length ?? 0,
            unread_count: stats?.unread ?? 0,
            message_count: stats?.total ?? 0,
        };
    }).filter(Boolean);

    return filteredData;
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
    priority?: string;
    estimated_value?: number;
    expected_close_date?: string;
    pipeline_stage?: string;
    contact_status?: string;
    account_manager_id?: string;
};

// Remove clients — moves them back to LEAD (does NOT delete data)
export async function removeClientsAction(contactIds: string[]) {
    const { userId, role } = await ensureAuthenticated();
    if (!contactIds || contactIds.length === 0) return { success: false, error: 'No contacts selected' };

    const { error } = await supabase
        .from('contacts')
        .update({
            is_client: false,
            pipeline_stage: 'COLD_LEAD',
            updated_at: new Date().toISOString(),
        })
        .in('id', contactIds);

    if (error) {
        console.error('removeClientsAction error:', error);
        return { success: false, error: 'Failed to remove clients' };
    }

    revalidatePath('/clients');
    return { success: true, removed: contactIds.length };
}

export async function updateClientAction(clientId: string, updates: ClientUpdatePayload) {
    const { userId, role } = await ensureAuthenticated();
    if (!clientId) return { success: false, error: 'clientId is required' };

    // Whitelist allowed fields to prevent mass assignment
    const allowedFields: (keyof ClientUpdatePayload)[] = ['name', 'email', 'company', 'phone', 'priority', 'estimated_value', 'expected_close_date', 'pipeline_stage', 'contact_status', 'account_manager_id'];
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
