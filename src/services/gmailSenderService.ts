import { google } from 'googleapis';
import { supabase } from '../lib/supabase';
import { handleEmailSent } from './emailSyncLogic';
import { refreshAccessToken } from './googleAuthService';
import { injectTracking } from './trackingService';

/**
 * Sends an email via Gmail API and syncs it to the database.
 * Requirement: Gmail API Integration (gmail.users.messages.send)
 * Requirement: Dynamic Token Usage
 * Requirement: Message Construction (MIME + base64url)
 * Requirement: Database Synchronization
 */
export async function sendGmailEmail(params: {
    accountId: string;
    to: string;
    subject: string;
    body: string;
    threadId?: string;
}) {
    const { accountId, to, subject, body, threadId } = params;

    // 1. Get Account Details
    const { data: account, error: accError } = await supabase
        .from('gmail_accounts')
        .select('*')
        .eq('id', accountId)
        .single();

    if (accError || !account) {
        throw new Error('Selected sender account not found.');
    }

    if (account.connection_method !== 'OAUTH') {
        throw new Error('Only OAuth accounts are supported for sending via Gmail API currently.');
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    const performSend = async (token: string) => {
        oauth2Client.setCredentials({ access_token: token });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // --- TRACKING INJECTION ---
        const { trackedBody, trackingId } = injectTracking(body);
        // -------------------------

        // Build MIME message manually to avoid bulky dependencies if possible, 
        // but ensure it's robust for UTF-8.
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const messageParts = [
            `From: ${account.email}`,
            `To: ${to}`,
            `Content-Type: text/html; charset=utf-8`,
            `MIME-Version: 1.0`,
            `Subject: ${utf8Subject}`,
            ``,
            trackedBody,
        ];
        const message = messageParts.join('\n');

        // Requirement: Encode in base64url
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage,
                threadId: threadId ?? null,
            },
        });

        return { ...res.data, trackingId };
    };

    try {
        const sentData = await performSend(account.access_token);

        // 4. Database Synchronization
        await handleEmailSent({
            gmailAccountId: account.id,
            threadId: sentData.threadId || '',
            messageId: sentData.id || '',
            fromEmail: account.email,
            toEmail: to,
            subject: subject,
            body: body,
            sentAt: new Date(),
            trackingId: sentData.trackingId,
        });

        return { success: true, messageId: sentData.id };
    } catch (error: any) {
        // Requirement: Error Handling (handle expired token)
        const isAuthError = error.code === 401 ||
            error.message?.includes('invalid_grant') ||
            error.response?.data?.error === 'invalid_grant';

        if (isAuthError) {
            console.log(`[Gmail Send] Token expired for ${account.email}, attempting refresh...`);
            try {
                const newAccessToken = await refreshAccessToken(accountId);
                const sentData = await performSend(newAccessToken);

                await handleEmailSent({
                    gmailAccountId: account.id,
                    threadId: sentData.threadId || '',
                    messageId: sentData.id || '',
                    fromEmail: account.email,
                    toEmail: to,
                    subject: subject,
                    body: body,
                    sentAt: new Date(),
                    trackingId: sentData.trackingId,
                });

                return { success: true, messageId: sentData.id };
            } catch (refreshError: any) {
                console.error('[Gmail Send] Token refresh failed:', refreshError.message);
                throw new Error('AUTH_REQUIRED');
            }
        }

        console.error('[Gmail Send] Error:', error.message);
        throw error;
    }
}
