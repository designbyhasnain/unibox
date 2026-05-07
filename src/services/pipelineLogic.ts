import 'server-only';
import { supabase } from '../lib/supabase';

/**
 * Email-locking — when a contact has been engaged on one of our mailboxes,
 * no other mailbox is allowed to send to them. Prevents the situation where
 * Rameez sends from rafaysarwarfilms@ while Shayan also sends from
 * editsbyraf@ to the same prospect — looks unprofessional, breeds confusion,
 * and burns trust.
 *
 * "Engagement" signals (any one of these locks the mailbox):
 *   1. The contact has any project linked → they're a paid client. The
 *      mailbox on the most recent thread owns them.
 *   2. The contact's pipeline_stage is past COLD_LEAD/CONTACTED (i.e.
 *      WARM_LEAD / LEAD / OFFER_ACCEPTED / CLOSED) — substantive movement.
 *   3. We have any inbound RECEIVED message from this contact's email on
 *      one of our mailboxes — they replied to us.
 *
 * The "owning mailbox" is the gmail_account_id with the most messages on
 * the contact's most-engaged thread. Stable: once a contact replies, the
 * lock follows the original mailbox even if someone tries to start a new
 * thread elsewhere.
 *
 * Returns null when the contact is unlocked (cold / contacted only / no
 * messages yet) — any mailbox can send.
 */
export type MailboxLock = {
    accountId: string;
    accountEmail: string | null;
    reason: 'project' | 'pipeline_stage' | 'inbound_reply';
};

export async function getOwningMailbox(contactEmail: string): Promise<MailboxLock | null> {
    if (!contactEmail) return null;
    const normalized = contactEmail.trim().toLowerCase();

    // Resolve contact id (we may not have it on the call site).
    const { data: contactRow } = await supabase
        .from('contacts')
        .select('id, email, pipeline_stage, is_client')
        .ilike('email', normalized)
        .limit(1)
        .maybeSingle();

    const contactId = contactRow?.id as string | undefined;

    // Fast path: the lock-strength signals.
    const isClient = contactRow?.is_client === true;
    const stagedPast = ['WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED', 'CLOSED'].includes(
        (contactRow?.pipeline_stage as string) || ''
    );

    // Check for any inbound RECEIVED message on any of our mailboxes from this email.
    let inboundOwner: { gmail_account_id: string; sent_at: string } | null = null;
    if (contactId) {
        const { data: inbound } = await supabase
            .from('email_messages')
            .select('gmail_account_id, sent_at')
            .eq('contact_id', contactId)
            .eq('direction', 'RECEIVED')
            .order('sent_at', { ascending: true })
            .limit(1);
        inboundOwner = inbound?.[0]
            ? { gmail_account_id: inbound[0].gmail_account_id as string, sent_at: inbound[0].sent_at as string }
            : null;
    }
    if (!inboundOwner) {
        // Fallback path: search by from_email matching the contact email. Catches
        // RECEIVED rows that haven't been linked to a contact_id yet.
        const { data: inbound } = await supabase
            .from('email_messages')
            .select('gmail_account_id, sent_at')
            .eq('direction', 'RECEIVED')
            .ilike('from_email', `%${normalized}%`)
            .order('sent_at', { ascending: true })
            .limit(1);
        if (inbound?.[0]) {
            inboundOwner = { gmail_account_id: inbound[0].gmail_account_id as string, sent_at: inbound[0].sent_at as string };
        }
    }

    // No lock signals at all → any mailbox can send.
    if (!isClient && !stagedPast && !inboundOwner) return null;

    // Pick the owning mailbox. Priority: inbound-reply mailbox (most concrete
    // signal that a relationship exists). Fall back to the dominant mailbox
    // for this contact's outbound history.
    let owningAccountId: string | null = inboundOwner?.gmail_account_id ?? null;

    if (!owningAccountId && contactId) {
        // No inbound but contact is staged-past or is_client — pick the mailbox
        // we used most often when emailing them.
        const { data: outbound } = await supabase
            .from('email_messages')
            .select('gmail_account_id')
            .eq('contact_id', contactId)
            .eq('direction', 'SENT')
            .limit(200);
        const counts: Record<string, number> = {};
        for (const m of outbound || []) {
            const id = m.gmail_account_id as string | null;
            if (id) counts[id] = (counts[id] || 0) + 1;
        }
        owningAccountId =
            Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
    }

    if (!owningAccountId) return null;

    // Resolve mailbox email for the error message.
    const { data: acc } = await supabase
        .from('gmail_accounts')
        .select('email')
        .eq('id', owningAccountId)
        .maybeSingle();

    // Priority: pick the most CONCRETE signal so the toast text reflects the
    // actual evidence the user can verify in the inbox.
    //   1. Inbound reply — strongest (we have a real RECEIVED row).
    //   2. Project — only when an actual `projects` row links to this contact.
    //      Falls through if `is_client` is true but `projects` is empty (data
    //      drift; was previously over-claimed).
    //   3. Pipeline stage — last resort.
    let reason: MailboxLock['reason'];
    if (inboundOwner) {
        reason = 'inbound_reply';
    } else if (isClient && contactId) {
        const { count } = await supabase
            .from('projects')
            .select('id', { count: 'exact', head: true })
            .eq('client_id', contactId);
        reason = (count ?? 0) > 0 ? 'project' : 'pipeline_stage';
    } else {
        reason = 'pipeline_stage';
    }

    return {
        accountId: owningAccountId,
        accountEmail: (acc?.email as string | null) ?? null,
        reason,
    };
}

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
