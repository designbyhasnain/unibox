'use server';

import { ensureAuthenticated } from '../lib/safe-action';
import { blockEditorAccess, getOwnerFilter } from '../utils/accessControl';
import { supabase } from '../lib/supabase';
import { coachContact, type ClientCoachOutput } from '../services/clientCoachService';

/**
 * Public read-side action — runs the Groq coach for one contact.
 * Admins can coach any contact; SALES users only their own book.
 */
export async function coachClientAction(
    contactId: string
): Promise<{ success: true; coach: ClientCoachOutput } | { success: false; error: string }> {
    try {
        const { userId, role } = await ensureAuthenticated();
        blockEditorAccess(role);
        if (!contactId) return { success: false, error: 'contactId is required' };

        // RBAC scoping — SALES users only see their own contacts.
        const ownerFilter = getOwnerFilter(userId, role);
        let q = supabase.from('contacts').select('id, account_manager_id').eq('id', contactId);
        if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
        const { data: contact, error } = await q.maybeSingle();
        if (error || !contact) return { success: false, error: 'contact not found or not accessible' };

        const result = await coachContact({ contactId });
        if (!result.success) return { success: false, error: result.error };
        return { success: true, coach: result.output };
    } catch (err: any) {
        console.error('[coachClientAction]', err);
        return { success: false, error: err?.message || 'Coach failed.' };
    }
}

/**
 * Apply the coach's suggested pipeline_stage to the contact. Separate action
 * (not auto-fired) so a human is always in the loop on stage changes.
 */
export async function applyCoachStageAction(input: {
    contactId: string;
    stage: 'COLD_LEAD' | 'CONTACTED' | 'WARM_LEAD' | 'LEAD' | 'OFFER_ACCEPTED' | 'CLOSED' | 'NOT_INTERESTED';
    reason?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
    try {
        const { userId, role } = await ensureAuthenticated();
        blockEditorAccess(role);
        if (!input.contactId || !input.stage) return { success: false, error: 'contactId and stage required' };

        const ownerFilter = getOwnerFilter(userId, role);
        let q = supabase.from('contacts').update({ pipeline_stage: input.stage }).eq('id', input.contactId);
        if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
        const { error } = await q;
        if (error) return { success: false, error: error.message };

        // Audit trail (best-effort)
        try {
            await supabase.from('activity_logs').insert({
                action: 'STAGE_UPDATED_BY_COACH',
                note: `Stage → ${input.stage}${input.reason ? ` · ${input.reason}` : ''}`,
                contact_id: input.contactId,
                performed_by: userId,
            });
        } catch {
            // activity_log schema mismatch shouldn't block the stage update.
        }

        return { success: true };
    } catch (err: any) {
        console.error('[applyCoachStageAction]', err);
        return { success: false, error: err?.message || 'Failed to apply stage.' };
    }
}
