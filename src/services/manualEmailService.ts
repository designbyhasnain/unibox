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
    appPassword: string
): Promise<{ success: boolean; error?: string }> {
    // 1. Test IMAP
    const imap = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: { user: email, pass: appPassword },
        logger: false,
    });

    try {
        await imap.connect();
        await imap.logout();
    } catch (error: any) {
        return { success: false, error: `IMAP connection failed: ${error.message}` };
    }

    // 2. Test SMTP
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user: email, pass: appPassword },
    });

    try {
        await transporter.verify();
    } catch (error: any) {
        return { success: false, error: `SMTP connection failed: ${error.message}` };
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

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
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

    const imap = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: { user: account.email, pass: password },
        logger: false,
    });

    await imap.connect();

    try {
        const lock = await imap.getMailboxLock('INBOX');
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
                });
            }
        } finally {
            lock.release();
        }
    } finally {
        await imap.logout();
    }

    await supabase
        .from('gmail_accounts')
        .update({ last_synced_at: new Date().toISOString(), status: 'ACTIVE' })
        .eq('id', accountId);
}
