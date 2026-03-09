import { ImapFlow } from 'imapflow';
import * as nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { supabase } from '../lib/supabase';
import { handleEmailReceived, handleEmailSent } from './emailSyncLogic';
import { decrypt } from '../utils/encryption';

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
        secure: imapPort === 993,
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
        secure: smtpPort === 465,
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
    subject: string;
    body: string;
    threadId?: string;
}) {
    const { accountId, to, subject, body, threadId } = params;

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
        secure: smtpPort === 465,
        auth: { user: account.email, pass: password },
    });

    const info = await transporter.sendMail({
        from: account.email,
        to,
        subject,
        html: body,
    });

    const finalThreadId = threadId || info.messageId.replace(/[<>]/g, '');

    await handleEmailSent({
        gmailAccountId: account.id,
        threadId: finalThreadId,
        messageId: info.messageId.replace(/[<>]/g, ''),
        fromEmail: account.email,
        toEmail: to,
        subject,
        body,
        sentAt: new Date(),
    });

    return { success: true, messageId: info.messageId };
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

    const password = decrypt(account.app_password);
    const imapHost = account.imap_host || 'imap.gmail.com';
    const imapPort = account.imap_port || 993;

    const imap = new ImapFlow({
        host: imapHost,
        port: imapPort,
        secure: imapPort === 993,
        auth: { user: account.email, pass: password },
        logger: false,
    });

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

        for (let i = 0; i < targetFolders.length; i++) {
            const folder = targetFolders[i];
            if (!folder) continue;
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

                    for await (const message of messages) {
                        if (!message.source || !message.envelope) continue;

                        const parsed = await simpleParser(message.source);

                        await handleEmailReceived({
                            gmailAccountId: account.id,
                            threadId: (message as any).threadId || message.envelope.messageId || String(message.uid),
                            messageId: message.envelope.messageId || String(message.uid),
                            fromEmail: message.envelope.from?.[0]?.address || '',
                            toEmail: account.email,
                            subject: message.envelope.subject || '(No Subject)',
                            body: parsed.text || parsed.html || '',
                            receivedAt: message.envelope.date || new Date(),
                            isSpam: folder !== 'INBOX',
                        });
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
}

/**
 * Searches for a message across all folders (except INBOX) and moves it to INBOX
 */
export async function unspamManualMessage(account: any, messageId: string) {
    const password = decrypt(account.app_password);
    const imap = new ImapFlow({
        host: account.imap_host || 'imap.gmail.com',
        port: account.imap_port || 993,
        secure: account.imap_port === 993,
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


