// TODO: Add `import 'server-only';` after running `npm install` to install the server-only package.
// This prevents accidental client-side imports that could leak secrets.
import { supabase } from '../lib/supabase';
import { classifySentEmail, classifyReceivedEmail } from './emailClassificationService';

const ACCEPTANCE_KEYWORDS = ['yes', "let's proceed", 'agreed', 'sounds good', 'deal', 'approve', 'accepted'];

// Pre-compiled word-boundary regexes for acceptance keywords to avoid false positives
// e.g. "yes" should not match "yesterday", "deal" should not match "ideal"
const ACCEPTANCE_REGEXES = ACCEPTANCE_KEYWORDS.map(k => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));

/**
 * Extracts a clean email address from an RFC 2822 formatted string.
 * e.g. "John Doe <john@example.com>" -> "john@example.com"
 * e.g. "john@example.com" -> "john@example.com"
 */
function extractEmail(raw: string): string {
    const match = raw.match(/<([^>]+)>/);
    return match?.[1] ? match[1].toLowerCase() : raw.toLowerCase().trim();
}

export async function handleEmailSent(data: {
    gmailAccountId: string;
    threadId: string;
    messageId: string;
    toEmail: string;
    fromEmail: string;
    subject: string;
    body: string;
    sentAt: Date;
    isUnread?: boolean;
    isSpam?: boolean;
}) {
    const { toEmail, messageId, threadId } = data;
    const cleanToEmail = extractEmail(toEmail);

    // 1. Find or create contact
    let { data: contact } = await supabase
        .from('contacts')
        .select('id, email, is_lead, is_client, pipeline_stage')
        .eq('email', cleanToEmail)
        .maybeSingle();

    // Removed automatic contact creation for random outbound emails
    // As per user request: only existing leads/clients should remain in the Client list.

    // 3. Identify the current stage of this thread and prior messages for classification
    const { data: threadMessages } = await supabase
        .from('email_messages')
        .select('pipeline_stage, direction, sent_at')
        .eq('thread_id', threadId)
        .order('sent_at', { ascending: true });

    const currentThreadStage = threadMessages?.[threadMessages.length - 1]?.pipeline_stage || 'COLD_LEAD';

    // Classify email type
    const emailType = classifySentEmail((threadMessages || []).map(m => ({
        direction: m.direction as 'SENT' | 'RECEIVED',
        sent_at: m.sent_at,
    })));

    // 4. Upsert thread
    await supabase.from('email_threads').upsert(
        { id: threadId, subject: data.subject },
        { onConflict: 'id' }
    );

    // 5. Insert message
    const upsertData: any = {
        id: messageId,
        gmail_account_id: data.gmailAccountId,
        thread_id: threadId,
        contact_id: contact?.id ?? null,
        from_email: data.fromEmail,
        to_email: data.toEmail,
        subject: data.subject,
        body: data.body,
        snippet: data.body
            .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '') // Remove style/script content
            .replace(/<[^>]*>/g, ' ') // Remove all remaining tags
            .replace(/\s+/g, ' ') // Collapse whitespace
            .trim()
            .substring(0, 300),
        direction: 'SENT',
        email_type: emailType,
        is_unread: data.isUnread ?? false,
        pipeline_stage: currentThreadStage,
        is_spam: data.isSpam ?? false,
        sent_at: data.sentAt.toISOString(),
    };

    // 5. Insert message
    const { data: emailMsg, error } = await supabase
        .from('email_messages')
        .upsert(upsertData, { onConflict: 'id' })
        .select()
        .single();

    if (error) throw error;
    return emailMsg;
}

export async function handleEmailReceived(data: {
    gmailAccountId: string;
    threadId: string;
    messageId: string;
    fromEmail: string;
    toEmail: string;
    subject: string;
    body: string;
    receivedAt: Date;
    isUnread?: boolean;
    isSpam?: boolean;
}, sentThreadIds?: Set<string>) {
    const { fromEmail, messageId, threadId } = data;
    const cleanFromEmail = extractEmail(fromEmail);

    // 1. Find or create contact from sender
    let { data: contact } = await supabase
        .from('contacts')
        .select('id, email, is_lead, is_client, pipeline_stage')
        .eq('email', cleanFromEmail)
        .maybeSingle();

    // Removed auto-creation of contact. Random incoming emails will no longer populate the Clients page.
    // They will only be processed into the Inbox without creating a CRM Client entry unless they already were one.

    // 2. Identify the current stage of this thread and fetch thread metadata
    const [{ data: threadStatus }, { data: threadRecord }] = await Promise.all([
        supabase
            .from('email_messages')
            .select('pipeline_stage, direction, sent_at')
            .eq('thread_id', threadId)
            .order('sent_at', { ascending: true }),
        supabase
            .from('email_threads')
            .select('first_reply_received')
            .eq('id', threadId)
            .maybeSingle(),
    ]);

    // Check if we have ever sent an email in this thread
    const hasOutgoing = (threadStatus || []).some(m => m.direction === 'SENT');
    // Get existing stage from most recent message
    const sortedDesc = [...(threadStatus || [])].reverse();
    const existingStage = sortedDesc[0]?.pipeline_stage || null;

    // Classify email type
    const firstReplyReceived = threadRecord?.first_reply_received ?? false;
    const { emailType, isFirstReply } = classifyReceivedEmail(
        (threadStatus || []).map(m => ({ direction: m.direction as 'SENT' | 'RECEIVED', sent_at: m.sent_at })),
        firstReplyReceived
    );

    // Promotion Logic:
    // 1. If we have sent an email in this thread, it's a conversation -> LEAD
    // 2. If the contact is already an advanced lead/client, keep that stage
    // 3. Otherwise, it stays in COLD_LEAD (to appear in the main inbox tab)
    let newEmailStage = 'COLD_LEAD';

    if (hasOutgoing || (contact && !['COLD_LEAD', 'NOT_INTERESTED', null].includes(contact.pipeline_stage))) {
        newEmailStage = 'LEAD';
    }

    // Preserve existing stage if it's already higher than LEAD (e.g. OFFER_ACCEPTED, NOT_INTERESTED)
    // This prevents stage regression — higher stages should never be downgraded
    if (existingStage && !['COLD_LEAD', 'LEAD'].includes(existingStage)) {
        newEmailStage = existingStage;
    }

    // If the contact is NOT_INTERESTED, never promote them to LEAD automatically
    if (contact?.pipeline_stage === 'NOT_INTERESTED') {
        newEmailStage = existingStage || 'NOT_INTERESTED';
    }

    // 3. Keyword detection for possible offer acceptance (Activity log only)
    const bodyText = data.body.toLowerCase();
    const mightBeAccepted = ACCEPTANCE_REGEXES.some((regex) => regex.test(bodyText));

    if (mightBeAccepted && contact?.pipeline_stage === 'LEAD' && contact.id) {
        await supabase.from('activity_logs').insert({
            action: "System flagged 'Possible Acceptance?' due to keyword detection in reply.",
            performed_by: 'System',
            contact_id: contact.id,
        });
    }

    // 4. Auto-Update Status for Contact & Backfill Thread if it's a genuine lead
    if (newEmailStage === 'LEAD' && contact && contact.pipeline_stage === 'COLD_LEAD') {
        await supabase
            .from('contacts')
            .update({ pipeline_stage: 'LEAD' })
            .eq('id', contact.id);

        // Move all messages in THIS THREAD to LEAD
        await supabase
            .from('email_messages')
            .update({ pipeline_stage: 'LEAD' })
            .eq('thread_id', threadId)
            .eq('pipeline_stage', 'COLD_LEAD');

        if (contact.id) {
            await supabase.from('activity_logs').insert({
                action: 'Lead promoted: Message received (Reply identified).',
                performed_by: 'System',
                contact_id: contact.id,
            });
        }
    }

    // 5. Force Unread Flag for replies (Notification)
    const finalIsUnread = data.isUnread ?? true;

    // 6. Upsert thread (set first_reply_received if this is the first reply)
    const threadUpsertData: any = { id: threadId, subject: data.subject };
    if (isFirstReply) {
        threadUpsertData.first_reply_received = true;
    }
    await supabase.from('email_threads').upsert(
        threadUpsertData,
        { onConflict: 'id' }
    );
    // If first reply, ensure the flag is set (upsert may not update on conflict)
    if (isFirstReply) {
        await supabase.from('email_threads')
            .update({ first_reply_received: true })
            .eq('id', threadId);
    }

    // 7. Insert message
    const { data: emailMsg, error } = await supabase
        .from('email_messages')
        .upsert({
            id: messageId,
            gmail_account_id: data.gmailAccountId,
            thread_id: threadId,
            contact_id: contact?.id ?? null,
            from_email: data.fromEmail,
            to_email: data.toEmail,
            subject: data.subject,
            body: data.body,
            snippet: data.body
                .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 300),
            direction: 'RECEIVED',
            email_type: emailType,
            is_unread: finalIsUnread,
            pipeline_stage: newEmailStage,
            is_spam: data.isSpam ?? false,
            sent_at: data.receivedAt.toISOString(),
        }, { onConflict: 'id' })
        .select()
        .single();

    if (error) throw error;
    return emailMsg;
}
