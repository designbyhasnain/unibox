import 'server-only';
import { supabase } from '../lib/supabase';
import { classifySentEmail, classifyReceivedEmail } from './emailClassificationService';
import { extractPhoneFromText } from '../utils/phoneExtractor';
import { detectStageSignal } from './stageDetectionService';

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

// Cache own Gmail account emails to avoid repeated lookups
let ownEmailsCache: Set<string> | null = null;
let ownEmailsCacheTime = 0;
const OWN_EMAILS_TTL = 60_000; // 1 minute

async function getOwnEmails(): Promise<Set<string>> {
    if (ownEmailsCache && Date.now() - ownEmailsCacheTime < OWN_EMAILS_TTL) return ownEmailsCache;
    const { data: accounts } = await supabase.from('gmail_accounts').select('email');
    ownEmailsCache = new Set((accounts || []).map(a => a.email.toLowerCase()));
    ownEmailsCacheTime = Date.now();
    return ownEmailsCache;
}

/**
 * Mark a contact as client, update lastEmailAt / lastGmailAccountId,
 * and extract phone from email body if missing.
 */
async function markAsClient(
    contactId: string,
    emailDate: Date,
    gmailAccountId: string,
    emailBody?: string,
    direction?: 'SENT' | 'RECEIVED'
): Promise<void> {
    const { data: contact } = await supabase
        .from('contacts')
        .select('id, is_client, contact_type, phone, last_email_at')
        .eq('id', contactId)
        .single();

    if (!contact) return;

    // Extract phone if contact doesn't have one
    let extractedPhone: string | undefined;
    if (!contact.phone && emailBody) {
        const phone = extractPhoneFromText(emailBody);
        if (phone) extractedPhone = phone;
    }

    const isNewer = !contact.last_email_at || emailDate > new Date(contact.last_email_at);
    const isFirstTime = contact.contact_type !== 'CLIENT';

    const updateData: Record<string, any> = {
        is_client: true,
        is_lead: true,
        contact_type: 'CLIENT',
        updated_at: new Date().toISOString(),
    };

    if (isFirstTime) {
        updateData.became_client_at = emailDate.toISOString();
    }

    if (isNewer) {
        updateData.last_email_at = emailDate.toISOString();
        updateData.last_gmail_account_id = gmailAccountId;
        updateData.last_message_direction = direction;
        updateData.days_since_last_contact = Math.floor((Date.now() - emailDate.getTime()) / 86400000);
    }

    if (extractedPhone) {
        updateData.phone = extractedPhone;
    }

    await supabase.from('contacts').update(updateData).eq('id', contactId);
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

    // Skip own Gmail accounts — never attach our own accounts as contacts
    const ownEmails = await getOwnEmails();
    const isOwnAccount = ownEmails.has(cleanToEmail);

    // 1. Find or create contact — anyone we email = client.
    // But skip the lookup entirely if the recipient is one of our own Gmail
    // accounts (team forwarding, testing, BCC to self) — those are not leads.
    let contact: { id: string; email: string; is_lead: boolean; is_client: boolean; pipeline_stage: string } | null = null;

    if (!isOwnAccount) {
        const { data: existing } = await supabase
            .from('contacts')
            .select('id, email, is_lead, is_client, pipeline_stage')
            .eq('email', cleanToEmail)
            .maybeSingle();
        contact = existing;
    }

    if (!contact && !isOwnAccount) {
        const nameMatch = toEmail.match(/^([^<]+)</);
        const parsedName = nameMatch ? nameMatch[1]?.trim().replace(/"/g, '') : cleanToEmail.split('@')[0];

        const { data: newContact } = await supabase
            .from('contacts')
            .upsert({
                email: cleanToEmail,
                name: parsedName || cleanToEmail.split('@')[0],
                is_lead: true,
                is_client: true,
                contact_type: 'CLIENT',
                became_client_at: data.sentAt.toISOString(),
                pipeline_stage: 'CONTACTED',
                last_email_at: data.sentAt.toISOString(),
                last_gmail_account_id: data.gmailAccountId,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'email' })
            .select('id, email, is_lead, is_client, pipeline_stage')
            .single();

        if (newContact) contact = newContact;
    }

    // Auto-transition: COLD_LEAD → CONTACTED on first send
    if (contact && contact.pipeline_stage === 'COLD_LEAD') {
        await supabase.from('contacts').update({ pipeline_stage: 'CONTACTED', updated_at: new Date().toISOString() }).eq('id', contact.id);
        contact.pipeline_stage = 'CONTACTED';
    }

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

    // 6. Mark recipient as client (OUTBOUND = client)
    if (contact && !ownEmails.has(cleanToEmail)) {
        markAsClient(contact.id, data.sentAt, data.gmailAccountId, data.body, 'SENT').catch(err => {
            console.error('[emailSyncLogic] markAsClient (sent) error:', err.message);
        });
    }

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

    // Skip own Gmail accounts — team forwarding between own accounts should
    // never create a self-referential contact.
    const ownEmails = await getOwnEmails();
    const isOwnAccount = ownEmails.has(cleanFromEmail);

    // 1. Find or create contact from sender
    let contact: { id: string; email: string; is_lead: boolean; is_client: boolean; pipeline_stage: string } | null = null;

    if (!isOwnAccount) {
        const { data: existing } = await supabase
            .from('contacts')
            .select('id, email, is_lead, is_client, pipeline_stage')
            .eq('email', cleanFromEmail)
            .maybeSingle();
        contact = existing;
    }

    // Auto-create contact ONLY if this is a reply to our outreach (thread has outgoing emails).
    // Random incoming emails still don't create contacts.
    if (!contact && !isOwnAccount) {
        const { data: threadMsgs } = await supabase
            .from('email_messages')
            .select('direction')
            .eq('thread_id', threadId)
            .eq('direction', 'SENT')
            .limit(1);

        if (threadMsgs && threadMsgs.length > 0) {
            // This person replied to our email — create them as a client
            const nameMatch = fromEmail.match(/^([^<]+)</);
            const parsedName = nameMatch ? nameMatch[1]?.trim().replace(/"/g, '') : cleanFromEmail.split('@')[0];

            const { data: newContact } = await supabase
                .from('contacts')
                .upsert({
                    email: cleanFromEmail,
                    name: parsedName || cleanFromEmail.split('@')[0],
                    is_lead: true,
                    is_client: true,
                    contact_type: 'CLIENT',
                    became_client_at: data.receivedAt.toISOString(),
                    pipeline_stage: 'LEAD',
                    last_email_at: data.receivedAt.toISOString(),
                    last_gmail_account_id: data.gmailAccountId,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'email' })
                .select('id, email, is_lead, is_client, pipeline_stage')
                .single();

            if (newContact) {
                contact = newContact;

                await supabase.from('activity_logs').insert({
                    action: 'Auto-created as client: replied to outreach email.',
                    performed_by: 'System',
                    contact_id: newContact.id,
                });
            }
        }
    }

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

    if (hasOutgoing || (contact && !['COLD_LEAD', 'CONTACTED', 'NOT_INTERESTED', null].includes(contact.pipeline_stage))) {
        newEmailStage = 'LEAD';
    }

    // Preserve existing stage if it's already higher than LEAD
    if (existingStage && !['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD'].includes(existingStage)) {
        newEmailStage = existingStage;
    }

    // If the contact is NOT_INTERESTED but is replying to our outreach, they're re-engaging
    if (contact?.pipeline_stage === 'NOT_INTERESTED') {
        if (hasOutgoing) {
            // Re-engagement: they replied after being marked dead — revive them
            newEmailStage = 'LEAD';
            if (contact.id) {
                await supabase.from('contacts').update({ pipeline_stage: 'LEAD' }).eq('id', contact.id);
                // Remove from ignored_senders so future emails sync
                await supabase.from('ignored_senders').delete().eq('email', cleanFromEmail);
                await supabase.from('activity_logs').insert({
                    action: 'Re-engagement: Contact replied after being marked Not Interested. Auto-promoted back to Lead.',
                    performed_by: 'System',
                    contact_id: contact.id,
                });
            }
        } else {
            newEmailStage = existingStage || 'NOT_INTERESTED';
        }
    }

    // 3. Smart keyword detection for stage signals
    if (contact?.id) {
        const signal = detectStageSignal(data.body, contact.pipeline_stage, 'RECEIVED');
        if (signal) {
            if (signal.confidence === 'HIGH' && signal.suggestedStage === 'OFFER_ACCEPTED'
                && contact.pipeline_stage === 'LEAD') {
                // HIGH confidence acceptance on a LEAD → auto-promote
                newEmailStage = 'OFFER_ACCEPTED';
                await supabase.from('contacts').update({ pipeline_stage: 'OFFER_ACCEPTED' }).eq('id', contact.id);
                await supabase.from('activity_logs').insert({
                    action: `Auto-promoted to Offer Accepted: "${signal.matchedKeywords[0]}" detected (${signal.confidence} confidence).`,
                    performed_by: 'System',
                    contact_id: contact.id,
                });
            } else if (signal.suggestedStage !== 'NOT_INTERESTED') {
                // MEDIUM/LOW → log for manual review
                await supabase.from('activity_logs').insert({
                    action: `Stage suggestion: ${signal.suggestedStage} (${signal.confidence}) — ${signal.reason}. Keywords: ${signal.matchedKeywords.join(', ')}`,
                    performed_by: 'System',
                    contact_id: contact.id,
                });
            }
            // Rejection signals (LOW confidence) → log only, never auto-apply
            if (signal.suggestedStage === 'NOT_INTERESTED') {
                await supabase.from('activity_logs').insert({
                    action: `Possible rejection detected: "${signal.matchedKeywords.join(', ')}". Review recommended.`,
                    performed_by: 'System',
                    contact_id: contact.id,
                });
            }
        }
    }

    // 4. Auto-mark as client (INBOUND = sender is client)
    if (contact) {
        const ownEmails = await getOwnEmails();
        if (!ownEmails.has(cleanFromEmail)) {
            markAsClient(contact.id, data.receivedAt, data.gmailAccountId, data.body, 'RECEIVED').catch(err => {
                console.error('[emailSyncLogic] markAsClient (received) error:', err.message);
            });
        }
    }

    // 5. Auto-Update Status for Contact & Backfill Thread if it's a genuine lead
    if (newEmailStage === 'LEAD' && contact && ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'NOT_INTERESTED'].includes(contact.pipeline_stage || '')) {
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

    // 8. Campaign reply detection — if this thread matches a campaign email, stop the contact
    checkCampaignReply(threadId, cleanFromEmail).catch(err => {
        console.error('[emailSyncLogic] Campaign reply check error:', err.message);
    });

    return emailMsg;
}

/**
 * Checks if an incoming email is a reply to a campaign email.
 * If so, stops the campaign contact and optionally promotes pipeline stage.
 */
async function checkCampaignReply(threadId: string, _fromEmail: string) {
    // Find any campaign emails sent in this thread
    const { data: threadEmails } = await supabase
        .from('email_messages')
        .select('id')
        .eq('thread_id', threadId)
        .eq('direction', 'SENT');

    if (!threadEmails || threadEmails.length === 0) return;

    const emailIds = threadEmails.map(e => e.id);

    // Check if any of these emails are campaign emails
    const { data: campaignEmails } = await supabase
        .from('campaign_emails')
        .select('campaign_id, contact_id')
        .in('email_id', emailIds)
        .limit(1);

    if (!campaignEmails || campaignEmails.length === 0) return;

    const ce = campaignEmails[0]!;

    // Fetch campaign settings
    const { data: campaign } = await supabase
        .from('campaigns')
        .select('auto_stop_on_reply')
        .eq('id', ce.campaign_id)
        .single();

    if (!campaign?.auto_stop_on_reply) return;

    // Stop the campaign contact
    await supabase
        .from('campaign_contacts')
        .update({
            status: 'STOPPED',
            stopped_reason: 'REPLIED',
        })
        .eq('campaign_id', ce.campaign_id)
        .eq('contact_id', ce.contact_id)
        .in('status', ['PENDING', 'IN_PROGRESS']);

    // Promote contact to LEAD on reply
    await supabase
        .from('contacts')
        .update({ pipeline_stage: 'LEAD' })
        .eq('id', ce.contact_id)
        .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD']);
}
