'use server';

import { ensureAuthenticated } from '../lib/safe-action';
import { supabase } from '../lib/supabase';
import { buildClientProfile } from '../services/clientIntelligenceService';
import type { ClientIntelligenceProfile } from '../types/clientIntelligence';

export async function getClientIntelligenceAction(
    contactId: string,
    contactEmail?: string | null
): Promise<{ success: true; data: ClientIntelligenceProfile } | { success: false; error: string }> {
    try {
        await ensureAuthenticated();

        if (!contactId) {
            return { success: false, error: 'No contact ID provided' };
        }

        // ── 3 parallel queries ────────────────────────────────────────────────

        const [contactResult, emailResult, activityResult] = await Promise.all([
            // Query 1: contacts — single PK lookup, already has all financials + health
            supabase
                .from('contacts')
                .select(`
                    id, name, email, company, phone, location,
                    pipeline_stage, is_client, contact_type,
                    became_client_at, client_since, client_tier,
                    total_revenue, paid_revenue, unpaid_amount,
                    total_projects, avg_project_value,
                    relationship_health, days_since_last_contact,
                    last_message_direction, last_email_at,
                    alerts, lead_score,
                    next_followup_at,
                    total_emails_sent, total_emails_received,
                    account_manager:account_manager_id(name, email)
                `)
                .eq('id', contactId)
                .single(),

            // Query 2: recent emails for inbox signal extraction (last 30 days)
            supabase
                .from('email_messages')
                .select('id, direction, subject, snippet, sent_at')
                .eq('contact_id', contactId)
                .gte('sent_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
                .order('sent_at', { ascending: false })
                .limit(30),

            // Query 3: activity logs for timeline (pipeline story)
            supabase
                .from('activity_logs')
                .select('action, created_at')
                .eq('contact_id', contactId)
                .order('created_at', { ascending: false })
                .limit(20),
        ]);

        if (contactResult.error || !contactResult.data) {
            return { success: false, error: contactResult.error?.message || 'Contact not found' };
        }

        const contact = contactResult.data;
        const recentEmails  = emailResult.data   ?? [];
        const activityLogs  = activityResult.data ?? [];

        // ── Query 4: edit_projects (production layer) ─────────────────────────
        // Uses contactEmail to match (59% coverage), falls back to name
        const emailToMatch = contactEmail || contact.email;
        let productionProjects: Record<string, any>[] = [];
        let matchMethod: 'EMAIL' | 'NAME' | 'NONE' = 'NONE';

        if (emailToMatch) {
            const { data: byEmail } = await supabase
                .from('edit_projects')
                .select(`
                    id, name, client_name, client_email,
                    progress, formula_percent,
                    due_date, start_date, completion_date,
                    editor, account_manager, team,
                    size_in_gbs, tags, am_review, notes,
                    total_amount, paid, received_1,
                    priority, user_id
                `)
                .eq('client_email', emailToMatch)
                .neq('progress', 'DONE')
                .order('due_date', { ascending: true, nullsFirst: false })
                .limit(5);

            if (byEmail && byEmail.length > 0) {
                productionProjects = byEmail;
                matchMethod = 'EMAIL';
            }
        }

        // Fallback: name match (first word)
        if (matchMethod === 'NONE' && contact.name) {
            const firstName = contact.name.split(' ')[0];
            if (firstName && firstName.length >= 3) {
                const { data: byName } = await supabase
                    .from('edit_projects')
                    .select(`
                        id, name, client_name, client_email,
                        progress, formula_percent,
                        due_date, start_date, completion_date,
                        editor, account_manager, team,
                        size_in_gbs, tags, am_review, notes,
                        total_amount, paid, received_1,
                        priority, user_id
                    `)
                    .ilike('client_name', `%${firstName}%`)
                    .neq('progress', 'DONE')
                    .order('due_date', { ascending: true, nullsFirst: false })
                    .limit(5);

                if (byName && byName.length > 0) {
                    productionProjects = byName;
                    matchMethod = 'NAME';
                }
            }
        }

        // ── Query 5: sales projects (for timeline payment events) ─────────────
        const { data: salesProjects } = await supabase
            .from('projects')
            .select('received_date_1, received_1, received_date_2, received_2, created_at, paid_status')
            .eq('client_id', contactId)
            .order('created_at', { ascending: false })
            .limit(10);

        // ── Synthesis ─────────────────────────────────────────────────────────
        const profile = buildClientProfile(
            contact,
            productionProjects,
            recentEmails,
            activityLogs,
            salesProjects ?? [],
            matchMethod
        );

        return { success: true, data: profile };

    } catch (err: any) {
        return { success: false, error: err?.message || 'Unknown error' };
    }
}
