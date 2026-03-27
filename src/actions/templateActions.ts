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
