import { supabase } from '../lib/supabase';

const ACCEPTANCE_KEYWORDS = ['yes', "let's proceed", 'agreed', 'sounds good', 'deal', 'approve', 'accepted'];

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
    trackingId?: string | null | undefined;
}) {
    const { toEmail, messageId, threadId } = data;

    // 1. Find or create contact
    let { data: contact } = await supabase
        .from('contacts')
        .select('id, email, is_lead, is_client, pipeline_stage')
        .eq('email', toEmail)
        .maybeSingle();

    // Removed automatic contact creation for random outbound emails
    // As per user request: only existing leads/clients should remain in the Client list.

    // 3. Identify the current stage of this thread (if it exists)
    const { data: threadStatus } = await supabase
        .from('email_messages')
        .select('pipeline_stage')
        .eq('thread_id', threadId)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const currentThreadStage = threadStatus?.pipeline_stage || contact?.pipeline_stage || 'COLD_LEAD';

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
        is_unread: data.isUnread ?? false,
        pipeline_stage: currentThreadStage,
        is_spam: data.isSpam ?? false,
        sent_at: data.sentAt.toISOString(),
    };

    if (data.trackingId) {
        upsertData.tracking_id = data.trackingId;
    }

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

    // 1. Find or create contact from sender
    let { data: contact } = await supabase
        .from('contacts')
        .select('id, email, is_lead, is_client, pipeline_stage')
        .eq('email', fromEmail)
        .maybeSingle();

    // Removed auto-creation of contact. Random incoming emails will no longer populate the Clients page.
    // They will only be processed into the Inbox without creating a CRM Client entry unless they already were one.

    // 2. Keyword detection for possible offer acceptance
    const bodyText = data.body.toLowerCase();
    const mightBeAccepted = ACCEPTANCE_KEYWORDS.some((k) => bodyText.includes(k));

    if (mightBeAccepted && contact?.is_lead && contact?.pipeline_stage === 'COLD_LEAD') {
        await supabase.from('activity_logs').insert({
            action: "System flagged 'Possible Acceptance?' due to keyword detection in reply.",
            performed_by: 'System',
            contact_id: contact.id,
        });
    }

    // Promoted stage for incoming interest
    const newEmailStage = 'LEAD';

    // 2. Auto-Update Status for Contact & Backfill Thread
    if (contact) {
        await supabase
            .from('contacts')
            .update({ pipeline_stage: 'LEAD' })
            .eq('id', contact.id)
            .neq('pipeline_stage', 'LEAD');
    }

    // Move all messages in THIS THREAD to LEAD so they appear in the Leads tab
    await supabase
        .from('email_messages')
        .update({ pipeline_stage: 'LEAD' })
        .eq('thread_id', threadId)
        .neq('pipeline_stage', 'LEAD');

    if (contact) {
        await supabase.from('activity_logs').insert({
            action: 'Lead promoted: Message received (Reply or New Outreach).',
            performed_by: 'System',
            contact_id: contact.id,
        });
    }

    // 5. Implicit Open Tracking: If we receive a reply, the recipient MUST have opened our previous SENT message(s).
    // We update the open_count and opened_at for any SENT message in this thread that shows 0 opens.
    await supabase
        .from('email_messages')
        .update({
            open_count: 1,
            opened_at: new Date().toISOString()
        })
        .eq('thread_id', threadId)
        .eq('direction', 'SENT')
        .eq('open_count', 0);

    // 6. Force Unread Flag for replies (Notification)
    const finalIsUnread = data.isUnread ?? true;

    // 3. Upsert thread
    await supabase.from('email_threads').upsert(
        { id: threadId, subject: data.subject },
        { onConflict: 'id' }
    );

    // 4. Insert message
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
