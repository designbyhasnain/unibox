'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { requireAdmin } from '../utils/accessControl';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TemplateData = {
    id: string;
    name: string;
    subject: string;
    body: string;
    category: string;
    is_shared: boolean;
    created_by_id: string;
    usage_count: number;
    created_at: string;
    updated_at: string;
    created_by?: { name: string } | null;
};

// ─── Get Templates ───────────────────────────────────────────────────────────

export async function getTemplatesAction(category?: string): Promise<TemplateData[]> {
    try {
        const { userId, role } = await ensureAuthenticated();

        let query = supabase
            .from('email_templates')
            .select(`
                id,
                name,
                subject,
                body,
                category,
                is_shared,
                created_by_id,
                usage_count,
                created_at,
                updated_at,
                created_by:users ( name )
            `)
            .or(`created_by_id.eq.${userId},is_shared.eq.true`)
            .order('usage_count', { ascending: false });

        if (category && category !== 'ALL') {
            query = query.eq('category', category);
        }

        const { data, error } = await query.limit(200);

        if (error) {
            console.error('[getTemplatesAction] error:', error);
            return [];
        }

        return (data || []) as unknown as TemplateData[];
    } catch (error: unknown) {
        console.error('[getTemplatesAction] error:', error);
        return [];
    }
}

// ─── Create Template ─────────────────────────────────────────────────────────

export async function createTemplateAction(data: {
    name: string;
    subject: string;
    body: string;
    category?: string;
    isShared?: boolean;
}) {
    try {
        const { userId } = await ensureAuthenticated();

        if (!data.name || !data.subject || !data.body) {
            return { success: false, error: 'Name, subject, and body are required' };
        }

        const { data: template, error } = await supabase
            .from('email_templates')
            .insert({
                name: data.name,
                subject: data.subject,
                body: data.body,
                category: data.category || 'GENERAL',
                is_shared: data.isShared || false,
                created_by_id: userId,
                updated_at: new Date().toISOString(),
            })
            .select('id')
            .single();

        if (error) {
            console.error('[createTemplateAction] error:', error);
            return { success: false, error: 'Failed to create template' };
        }

        revalidatePath('/templates');
        return { success: true, templateId: template?.id };
    } catch (error: unknown) {
        console.error('[createTemplateAction] error:', error);
        return { success: false, error: 'An error occurred' };
    }
}

// ─── Update Template ─────────────────────────────────────────────────────────

export async function updateTemplateAction(id: string, updates: {
    name?: string;
    subject?: string;
    body?: string;
    category?: string;
    isShared?: boolean;
}) {
    try {
        const { userId, role } = await ensureAuthenticated();

        if (!id) return { success: false, error: 'Template ID is required' };

        // Verify ownership (or admin)
        const { data: existing } = await supabase
            .from('email_templates')
            .select('created_by_id')
            .eq('id', id)
            .single();

        if (!existing) return { success: false, error: 'Template not found' };
        if (existing.created_by_id !== userId && role !== 'ADMIN') {
            return { success: false, error: 'You can only edit your own templates' };
        }

        const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.subject !== undefined) payload.subject = updates.subject;
        if (updates.body !== undefined) payload.body = updates.body;
        if (updates.category !== undefined) payload.category = updates.category;
        if (updates.isShared !== undefined) payload.is_shared = updates.isShared;

        const { error } = await supabase
            .from('email_templates')
            .update(payload)
            .eq('id', id);

        if (error) {
            console.error('[updateTemplateAction] error:', error);
            return { success: false, error: 'Failed to update template' };
        }

        revalidatePath('/templates');
        return { success: true };
    } catch (error: unknown) {
        console.error('[updateTemplateAction] error:', error);
        return { success: false, error: 'An error occurred' };
    }
}

// ─── Delete Template ─────────────────────────────────────────────────────────

export async function deleteTemplateAction(id: string) {
    try {
        const { userId, role } = await ensureAuthenticated();

        if (!id) return { success: false, error: 'Template ID is required' };

        // Verify ownership (or admin)
        const { data: existing } = await supabase
            .from('email_templates')
            .select('created_by_id')
            .eq('id', id)
            .single();

        if (!existing) return { success: false, error: 'Template not found' };
        if (existing.created_by_id !== userId && role !== 'ADMIN') {
            return { success: false, error: 'Only the creator or admin can delete templates' };
        }

        const { error } = await supabase
            .from('email_templates')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[deleteTemplateAction] error:', error);
            return { success: false, error: 'Failed to delete template' };
        }

        revalidatePath('/templates');
        return { success: true };
    } catch (error: unknown) {
        console.error('[deleteTemplateAction] error:', error);
        return { success: false, error: 'An error occurred' };
    }
}

// ─── Increment Usage ─────────────────────────────────────────────────────────

export async function incrementTemplateUsageAction(id: string) {
    try {
        await ensureAuthenticated();

        const { data: current } = await supabase
            .from('email_templates')
            .select('usage_count')
            .eq('id', id)
            .single();

        if (!current) return;

        await supabase
            .from('email_templates')
            .update({ usage_count: (current.usage_count || 0) + 1 })
            .eq('id', id);
    } catch {
        // Non-critical — silently ignore
    }
}

// ─── Generate Template from Sent Email (AI) ─────────────────────────────

export async function generateTemplateFromEmailAction(messageId: string) {
    try {
        await ensureAuthenticated();
        const { extractTemplateFromEmail } = await import('../services/templateMiningService');

        const { data: email, error } = await supabase
            .from('email_messages')
            .select('subject, body, email_type, from_email, to_email, contact_id')
            .eq('id', messageId)
            .eq('direction', 'SENT')
            .single();

        if (error || !email) return { success: false, error: 'Sent email not found' };

        let contact = null;
        if (email.contact_id) {
            const { data: c } = await supabase
                .from('contacts')
                .select('name, email, company, location')
                .eq('id', email.contact_id)
                .single();
            contact = c;
        }

        const suggestion = await extractTemplateFromEmail(
            { subject: email.subject, body: email.body, email_type: email.email_type, to_email: email.to_email },
            contact,
        );

        if (!suggestion) return { success: false, error: 'AI could not extract a template from this email' };

        return { success: true, suggestion: { ...suggestion, sourceEmailId: messageId } };
    } catch (e: any) {
        console.error('[generateTemplateFromEmailAction]', e.message);
        return { success: false, error: 'Failed to generate template' };
    }
}

// ─── Bulk Mine Templates from Winning Emails (Admin) ────────────────────

export async function bulkMineTemplatesAction() {
    try {
        const { role } = await ensureAuthenticated();
        requireAdmin(role);
        const { clusterAndExtractTemplates } = await import('../services/templateMiningService');

        const { data: winners, error } = await supabase
            .from('email_messages')
            .select('id, subject, body, email_type, sent_at, from_email, to_email, contact_id, opened_at')
            .eq('direction', 'SENT')
            .not('body', 'is', null)
            .not('subject', 'ilike', '%delivery status%')
            .not('subject', 'ilike', '%undeliverable%')
            .not('from_email', 'ilike', '%noreply%')
            .order('sent_at', { ascending: false })
            .limit(500);

        if (error || !winners?.length) return { success: false, error: 'No sent emails found' };

        const withMetrics = winners
            .map((e: any) => ({
                ...e,
                reply_count: 0,
                was_opened: !!e.opened_at,
            }))
            .filter((e: any) => {
                const bodyLen = (e.body || '').replace(/<[^>]*>/g, '').trim().length;
                return bodyLen > 50;
            });

        const topEmails = withMetrics.slice(0, 30);
        if (topEmails.length === 0) return { success: false, error: 'No qualifying emails found' };

        const suggestions = await clusterAndExtractTemplates(topEmails);
        if (suggestions.length === 0) return { success: false, error: 'AI could not extract templates' };

        const existing = await getTemplatesAction();
        const existingNames = existing.map(t => t.name.toLowerCase());

        let created = 0;
        const results: Array<{ name: string; category: string }> = [];
        for (const s of suggestions) {
            if (existingNames.includes(s.name.toLowerCase())) continue;

            const res = await createTemplateAction({
                name: s.name,
                subject: s.subject,
                body: s.body,
                category: s.category,
                isShared: true,
            });
            if (res.success) {
                created++;
                results.push({ name: s.name, category: s.category });
            }
        }

        revalidatePath('/templates');
        return {
            success: true,
            analyzed: winners.length,
            qualified: withMetrics.length,
            created,
            templates: results,
        };
    } catch (e: any) {
        console.error('[bulkMineTemplatesAction]', e.message);
        return { success: false, error: 'Failed to mine templates: ' + e.message };
    }
}
