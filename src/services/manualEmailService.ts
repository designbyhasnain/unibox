import 'server-only';
import { ImapFlow } from 'imapflow';
import * as nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { supabase } from '../lib/supabase';
import { handleEmailReceived, handleEmailSent } from './emailSyncLogic';
import { decrypt } from '../utils/encryption';
import { prepareTrackedEmail } from './trackingService';

/**
 * Test IMAP and SMTP connection with provided credentials
 */
export async function testManualConnection(
    email: string,
    appPassword: string,
    config?: {
        imapHost?: string;
        imapPort?: number;
        smtpHost?: string;
        smtpPort?: number;
    }
): Promise<{ success: boolean; error?: string }> {
    const imapHost = config?.imapHost || 'imap.gmail.com';
    const imapPort = config?.imapPort || 993;
    const smtpHost = config?.smtpHost || 'smtp.gmail.com';
    const smtpPort = config?.smtpPort || 465;

    // 1. Test IMAP
    const imap = new ImapFlow({
        host: imapHost,
        port: imapPort,
        secure: Number(imapPort) === 993,
        auth: { user: email, pass: appPassword },
        logger: false,
    });

    try {
        await imap.connect();
        await imap.logout();
    } catch (error: any) {
        return { success: false, error: `IMAP connection failed (${imapHost}): ${error.message}` };
    }

    // 2. Test SMTP
    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: Number(smtpPort) === 465,
        auth: { user: email, pass: appPassword },
    });

    try {
        await transporter.verify();
    } catch (error: any) {
        return { success: false, error: `SMTP connection failed (${smtpHost}): ${error.message}` };
    }

    return { success: true };
}

/**
 * Sends an email via SMTP and syncs it to the database
 */
export async function sendManualEmail(params: {
    accountId: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    threadId?: string;
}) {
    const { accountId, to, cc, bcc, subject, threadId } = params;

    const { body: trackedBody, trackingId } = prepareTrackedEmail(params.body, true);
    const body = trackedBody;

    const { data: account, error: accError } = await supabase
        .from('gmail_accounts')
        .select('*')
        .eq('id', accountId)
        .single();

    if (accError || !account) throw new Error('Selected sender account not found.');
    if (account.connection_method !== 'MANUAL' || !account.app_password) {
        throw new Error('Only manual accounts are supported here.');
    }

    const password = decrypt(account.app_password);
    const smtpHost = account.smtp_host || 'smtp.gmail.com';
    const smtpPort = account.smtp_port || 465;

    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: Number(smtpPort) === 465,
        auth: { user: account.email, pass: password },
    });

    const displayName = (account.display_name ?? '').trim();
    const fromField = displayName ? { name: displayName, address: account.email } : account.email;
    console.log(`[SMTP Send] from=${typeof fromField === 'string' ? fromField : `${fromField.name} <${fromField.address}>`} to=${to} subject=${subject.slice(0, 60)}`);
    const info = await transporter.sendMail({
        from: fromField,
        to,
        ...(cc ? { cc } : {}),
        ...(bcc ? { bcc } : {}),
        subject,
        html: body,
    });

    const finalThreadId = threadId || info.messageId.replace(/[<>]/g, '');

    const cleanMsgId = info.messageId.replace(/[<>]/g, '');

    await handleEmailSent({
        gmailAccountId: account.id,
        threadId: finalThreadId,
        messageId: cleanMsgId,
        fromEmail: account.email,
        toEmail: to,
        subject,
        body,
        sentAt: new Date(),
    });

    if (trackingId) {
        await supabase
            .from('email_messages')
            .update({
                is_tracked: true,
                tracking_id: trackingId,
                delivered_at: new Date().toISOString(),
            })
            .eq('id', cleanMsgId);
    }

    return { success: true, messageId: info.messageId, threadId: finalThreadId };
}


/**
 * Sync emails for a manual account using IMAP (last 6 months)
 */
export async function syncManualEmails(accountId: string) {
    const { data: account, error: accountError } = await supabase
        .from('gmail_accounts')
        .select('*')
        .eq('id', accountId)
        .single();

    if (accountError || !account) throw new Error('Account not found');
    if (!account.app_password || account.connection_method !== 'MANUAL') {
        throw new Error('Invalid account for manual sync');
    }

    // CONCURRENCY GUARD: Atomic check-and-set to prevent TOCTOU race condition.
    const { data: lockResult, error: lockError } = await supabase
        .from('gmail_accounts')
        .update({ status: 'SYNCING', sync_progress: 0 })
        .eq('id', accountId)
        .eq('status', 'ACTIVE')
        .select('id');

    if (lockError || !lockResult || lockResult.length === 0) {
        console.log(`[Manual Sync] Sync already in progress or account not ACTIVE for ${account.email}. Skipping.`);
        return;
    }

    const password = decrypt(account.app_password);
    const imapHost = account.imap_host || 'imap.gmail.com';
    const imapPort = account.imap_port || 993;

    const imap = new ImapFlow({
        host: imapHost,
        port: imapPort,
        secure: Number(imapPort) === 993,
        auth: { user: account.email, pass: password },
        logger: false,
    });

    try {
    await imap.connect();

    try {
        // List all mailboxes to find the correct Spam/Junk folder names
        const mailboxes = await imap.list();
        const mailboxNames = mailboxes.map(m => m.path);

        // Find folders that are either INBOX or are flagged/named as Spam/Junk
        const targetFolders = mailboxNames.filter(name => {
            const lower = name.toLowerCase();
            const mb = mailboxes.find(m => m.path === name);
            const specialUse = (mb as any).specialUse || [];

            return (
                name === 'INBOX' ||
                specialUse.includes('\\Spam') ||
                specialUse.includes('\\Junk') ||
                specialUse.includes('\\Sent') ||
                specialUse.includes('\\Trash') ||
                specialUse.includes('\\Drafts') ||
                lower.includes('spam') ||
                lower.includes('junk') ||
                lower.includes('bulk') ||
                lower.includes('sent') ||
                lower.includes('trash') ||
                lower.includes('draft')
            );
        });

        console.log(`[Sync] Targeting folders for ${account.email}:`, targetFolders);

        // Track processed message IDs across folders to avoid duplicates (ES-020)
        const processedMessageIds = new Set<string>();

        for (let i = 0; i < targetFolders.length; i++) {
            const folder = targetFolders[i];
            if (!folder) continue;

            // Periodic Cancellation Check
            const { data: currentAcc } = await supabase
                .from('gmail_accounts')
                .select('status')
                .eq('id', accountId)
                .single();

            if (currentAcc && currentAcc.status !== 'SYNCING') {
                console.log(`[Manual Sync] Aborting for ${account.email} - status changed to ${currentAcc.status}`);
                return;
            }

            try {
                const lock = await imap.getMailboxLock(folder);
                try {
                    const sixMonthsAgo = new Date();
                    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

                    const messages = imap.fetch({ since: sixMonthsAgo }, {
                        envelope: true,
                        source: true,
                        bodyStructure: true,
                    });

                    // Determine folder type for correct handling
                    const folderLower = folder.toLowerCase();
                    const mb = mailboxes.find(m => m.path === folder);
                    const specialUse = (mb as any)?.specialUse || '';
                    const isSentFolder = specialUse === '\\Sent' || folderLower.includes('sent');
                    const isSpamFolder = specialUse === '\\Junk' || specialUse === '\\Spam' ||
                        folderLower.includes('spam') || folderLower.includes('junk') || folderLower.includes('bulk');

                    for await (const message of messages) {
                        // Batch cancellation check within folder
                        if (Math.random() < 0.05) { // Check occasionally to avoid DB spam
                            const { data: checkAcc } = await supabase.from('gmail_accounts').select('status').eq('id', accountId).single();
                            if (checkAcc && checkAcc.status !== 'SYNCING') return;
                        }

                        if (!message.source || !message.envelope) continue;

                        // Skip messages already processed from another folder
                        const msgId = message.envelope.messageId || String(message.uid);
                        if (processedMessageIds.has(msgId)) continue;
                        processedMessageIds.add(msgId);

                        const parsed = await simpleParser(message.source);

                        if (isSentFolder) {
                            // Messages from Sent folder should be treated as SENT
                            await handleEmailSent({
                                gmailAccountId: account.id,
                                threadId: (message as any).threadId || message.envelope.messageId || String(message.uid),
                                messageId: message.envelope.messageId || String(message.uid),
                                fromEmail: account.email,
                                toEmail: message.envelope.to?.[0]?.address || '',
                                subject: message.envelope.subject || '(No Subject)',
                                body: parsed.text || parsed.html || '',
                                sentAt: message.envelope.date || new Date(),
                            });
                        } else {
                            await handleEmailReceived({
                                gmailAccountId: account.id,
                                threadId: (message as any).threadId || message.envelope.messageId || String(message.uid),
                                messageId: message.envelope.messageId || String(message.uid),
                                fromEmail: message.envelope.from?.[0]?.address || '',
                                toEmail: account.email,
                                subject: message.envelope.subject || '(No Subject)',
                                body: parsed.text || parsed.html || '',
                                receivedAt: message.envelope.date || new Date(),
                                isSpam: isSpamFolder,
                            });
                        }
                    }

                    // Update progress based on folders completed
                    const progress = Math.min(Math.round(((i + 1) / targetFolders.length) * 100), 99);
                    await supabase
                        .from('gmail_accounts')
                        .update({ sync_progress: progress })
                        .eq('id', accountId);

                } finally {
                    lock.release();
                }
            } catch (err: any) {
                console.error(`[Sync] Skipping folder ${folder} for ${account.email}:`, err.message);
                continue;
            }
        }
    } finally {
        await imap.logout();
    }

    await supabase
        .from('gmail_accounts')
        .update({ last_synced_at: new Date().toISOString(), status: 'ACTIVE', sync_progress: 100 })
        .eq('id', accountId);

    } catch (error: any) {
        console.error(`[Manual Sync] Error syncing ${account.email}:`, error?.message || error);
        // Reset status so account doesn't stay stuck in SYNCING
        await supabase
            .from('gmail_accounts')
            .update({ status: 'ACTIVE', sync_progress: 0 })
            .eq('id', accountId);
        throw error;
    }
}

/**
 * Searches for a message across all folders (except INBOX) and moves it to INBOX
 */
export async function unspamManualMessage(account: any, messageId: string) {
    const password = decrypt(account.app_password);
    const imap = new ImapFlow({
        host: account.imap_host || 'imap.gmail.com',
        port: account.imap_port || 993,
        secure: Number(account.imap_port) === 993,
        auth: { user: account.email, pass: password },
        logger: false,
    });

    await imap.connect();

    try {
        const mailboxes = await imap.list();
        const mailboxNames = mailboxes.map(mb => mb.path);

        // Exclude INBOX, prioritize potential Spam/Junk/Trash folders
        const otherFolders = mailboxNames.filter(n => n !== 'INBOX');
        const sortedFolders = otherFolders.sort((a, b) => {
            const lowA = a.toLowerCase();
            const lowB = b.toLowerCase();
            const isSpamA = lowA.includes('spam') || lowA.includes('junk') || lowA.includes('trash');
            const isSpamB = lowB.includes('spam') || lowB.includes('junk') || lowB.includes('trash');
            if (isSpamA && !isSpamB) return -1;
            if (!isSpamA && isSpamB) return 1;
            return 0;
        });

        for (const folder of sortedFolders) {
            try {
                const lock = await imap.getMailboxLock(folder);
                try {
                    // Search by message-id header
                    const searchResult = await imap.search({ header: { 'message-id': messageId } });

                    if (searchResult && Array.isArray(searchResult) && searchResult.length > 0) {
                        console.log(`[Manual Unspam] Found message ${messageId} in ${folder}. Moving to INBOX...`);
                        await imap.messageMove(searchResult, 'INBOX', { uid: true });
                        return { success: true };
                    }
                } finally {
                    lock.release();
                }
            } catch (err) {
                // Skip inaccessible folders
                continue;
            }
        }

        return { success: false, error: 'Message not found in any other folder' };
    } finally {
        await imap.logout();
    }
}


