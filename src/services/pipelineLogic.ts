import 'server-only';
import { supabase } from '../lib/supabase';

/**
 * Mark a contact as a paid client. Called every time a project is created
 * for that contact, plus by the bulk reconciliation action that backfills
 * historic data.
 *
 * The invariant the user stated:
 *   "if they have given any projects to us its closed."
 *
 * So whenever a row exists in `projects` with `client_id = contact.id`,
 * the contact must satisfy:
 *   pipeline_stage   = 'CLOSED'
 *   is_client        = true
 *   became_client_at = COALESCE(existing, MIN(projects.created_at))
 *
 * Idempotent — running it on an already-closed contact is a no-op write
 * that costs ~1 ms and preserves became_client_at.
 *
 * Returns { previousStage, flipped } so callers can audit.
 */
export async function markContactClosed(
    contactId: string,
    referenceProjectCreatedAt?: string | null,
): Promise<{ previousStage: string | null; flipped: boolean; error?: string }> {
    if (!contactId) return { previousStage: null, flipped: false, error: 'contactId is required' };

    const { data: existing, error: readErr } = await supabase
        .from('contacts')
        .select('id, pipeline_stage, is_client, became_client_at')
        .eq('id', contactId)
        .single();

    if (readErr || !existing) {
        return { previousStage: null, flipped: false, error: readErr?.message || 'contact not found' };
    }

    const alreadyClosed = existing.pipeline_stage === 'CLOSED' && existing.is_client === true && existing.became_client_at;
    if (alreadyClosed) {
        return { previousStage: existing.pipeline_stage, flipped: false };
    }

    const update: Record<string, any> = {
        pipeline_stage: 'CLOSED',
        is_client: true,
    };
    // Preserve an existing `became_client_at`; only set it if missing. The
    // reference timestamp (project's created_at, when known) wins over a
    // fresh now() so the historical date is preserved during backfills.
    if (!existing.became_client_at) {
        update.became_client_at = referenceProjectCreatedAt ?? new Date().toISOString();
    }

    const { error: writeErr } = await supabase
        .from('contacts')
        .update(update)
        .eq('id', contactId);

    if (writeErr) {
        console.error('[pipelineLogic.markContactClosed] update error:', writeErr);
        return { previousStage: existing.pipeline_stage, flipped: false, error: writeErr.message };
    }

    return { previousStage: existing.pipeline_stage, flipped: true };
}
