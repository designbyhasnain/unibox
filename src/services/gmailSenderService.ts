import 'server-only';
import { google } from 'googleapis';
import { supabase } from '../lib/supabase';
import { handleEmailSent } from './emailSyncLogic';
import { refreshAccessToken } from './googleAuthService';
import { prepareTrackedEmail } from './trackingService';
import { formatFromHeader } from '../utils/fromAddress';
import {
    injectIdentitySchema,
    buildUnsubscribeHeaders,
    buildBimiSelectorHeader,
    resolveSenderImage,
    injectSenderSignature,
} from '../utils/identitySchema';

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
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    threadId?: string;
}) {
    const { accountId, to, cc, bcc, subject, threadId } = params;

    const { body: trackedBody, trackingId } = prepareTrackedEmail(params.body, true);
    const body = trackedBody;

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

        // Build MIME message manually to avoid bulky dependencies if possible,
        // but ensure it's robust for UTF-8.
        // Caveat: for OAuth sends to gmail.com / Workspace, Gmail may rewrite
        // the From display name to match the account's Google profile name
        // unless a "Send mail as" alias with a custom name is configured.
        // Custom-domain (MANUAL/SMTP) sends do not have this constraint.
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const fromHeader = formatFromHeader(account.display_name, account.email);
        console.log(`[Gmail Send] from=${fromHeader} to=${to} subject=${subject.slice(0, 60)}`);

        // Identity surfaces (verified May 2026):
        // (1) Inline HTML signature — 60px circular photo + bold name in the
        //     email body. Works in every major client without a paid cert.
        //     Idempotent via a hidden <!--unibox-sig--> marker.
        // (2) Schema.org JSON-LD — hidden script. Used by Gmail for action
        //     chips (NOT avatar), zero visible noise.
        // Persona image falls back to Gravatar URL when account has no
        // uploaded photo.
        const senderImage = resolveSenderImage(account.profile_image, account.email);
        const senderName = account.display_name || account.email;
        const bodyWithSig = injectSenderSignature(body, {
            senderName,
            senderEmail: account.email,
            profileImageUrl: senderImage,
            organization: 'Wedits',
            organizationUrl: 'https://wedits.com',
        });
        const enrichedBody = injectIdentitySchema(bodyWithSig, {
            senderName,
            senderEmail: account.email,
            profileImageUrl: senderImage,
            organization: 'Wedits',
            organizationUrl: 'https://wedits.com',
        });

        // List-Unsubscribe + List-Unsubscribe-Post (RFC 8058) when we have
        // a tracking-id. Improves Gmail deliverability + sender reputation.
        const unsubHeaders = trackingId && process.env.NEXT_PUBLIC_APP_URL ? buildUnsubscribeHeaders({
            mailto: `unsubscribe@${(account.email.split('@')[1] || 'wedits.com')}`,
            httpUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/unsubscribe?t=${trackingId}`,
        }) : {};
        // BIMI-Selector header — IETF BIMI draft. Receivers (Yahoo/AOL today,
        // Apple via Branded Mail, Gmail via VMC/CMC if ever paid for) use this
        // to look up the BIMI DNS record. Harmless when no record exists.
        const bimiHeader = buildBimiSelectorHeader('default');
        const allHeaders = { ...unsubHeaders, ...bimiHeader };
        const headerLines = Object.entries(allHeaders).map(([k, v]) => `${k}: ${v}`);

        const messageParts = [
            `From: ${fromHeader}`,
            `To: ${to}`,
            ...(cc ? [`Cc: ${cc}`] : []),
            ...(bcc ? [`Bcc: ${bcc}`] : []),
            `Content-Type: text/html; charset=utf-8`,
            `MIME-Version: 1.0`,
            `Subject: ${utf8Subject}`,
            ...headerLines,
            ``,
            enrichedBody,
        ];
        const message = messageParts.join('\r\n');

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

        return { ...res.data };
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
        });

        // 5. Save tracking data
        if (trackingId && sentData.id) {
            const cleanMsgId = sentData.id.replace(/[<>]/g, '');
            await supabase
                .from('email_messages')
                .update({
                    is_tracked: true,
                    tracking_id: trackingId,
                    delivered_at: new Date().toISOString(),
                })
                .eq('id', cleanMsgId);
        }

        return { success: true, messageId: sentData.id, threadId: sentData.threadId };
    } catch (error: any) {
        // Requirement: Error Handling (handle expired token)
        const isAuthError = error.code === 401 ||
            error.message?.includes('invalid_grant') ||
            error.response?.data?.error === 'invalid_grant';

        if (isAuthError) {
            console.error(`[Gmail Send] Token expired for ${account.email}, attempting refresh...`);
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
                });

                if (trackingId && sentData.id) {
                    const cleanMsgId = sentData.id.replace(/[<>]/g, '');
                    await supabase
                        .from('email_messages')
                        .update({
                            is_tracked: true,
                            tracking_id: trackingId,
                            delivered_at: new Date().toISOString(),
                        })
                        .eq('id', cleanMsgId);
                }

                return { success: true, messageId: sentData.id, threadId: sentData.threadId };
            } catch (refreshError: any) {
                console.error('[Gmail Send] Token refresh failed:', refreshError.message);
                throw new Error('AUTH_REQUIRED');
            }
        }

        console.error('[Gmail Send] Error:', error.message);
        // Sanitize error to avoid leaking internal details to the client
        throw new Error('Failed to send email. Please try again later.');
    }
}
