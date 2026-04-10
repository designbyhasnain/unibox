import 'server-only';
import { google } from 'googleapis';
import * as crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { encrypt, decrypt } from '../utils/encryption';

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://mail.google.com/',
];

function getRedirectUri(): string {
    // Use explicit GOOGLE_REDIRECT_URI if set, otherwise derive from NEXTAUTH_URL
    if (process.env.GOOGLE_REDIRECT_URI) {
        return process.env.GOOGLE_REDIRECT_URI;
    }
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    return `${baseUrl}/api/auth/google/callback`;
}

function createOAuth2Client() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        getRedirectUri()
    );
}

/**
 * Generates a cryptographically random state token for CSRF protection.
 */
export function generateOAuthState(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Validates the state parameter returned from the OAuth callback.
 * Returns true if the state matches the expected value.
 */
export function validateOAuthState(returnedState: string | null, expectedState: string | null): boolean {
    if (!returnedState || !expectedState) return false;
    // Use timing-safe comparison to prevent timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(returnedState, 'utf8'),
            Buffer.from(expectedState, 'utf8')
        );
    } catch {
        return false;
    }
}

export function getGoogleAuthUrl(state?: string): string {
    const oauth2Client = createOAuth2Client();
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        ...(state ? { state } : {}),
    });
}

export async function handleAuthCallback(
    code: string,
    userId: string
): Promise<{ id: string; email: string }> {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    const email = userInfo.email;

    if (!email) throw new Error('Could not retrieve email from Google');

    // Fetch existing account to preserve refresh token and history_id
    const { data: existingAccount } = await supabase
        .from('gmail_accounts')
        .select('refresh_token, history_id')
        .eq('email', email)
        .single();

    const encryptedRefreshToken = tokens.refresh_token
        ? encrypt(tokens.refresh_token)
        : existingAccount?.refresh_token;

    // If no refresh token from Google AND no existing one in DB, the account
    // will become unusable after the access token expires (~1 hour).
    if (!encryptedRefreshToken) {
        throw new Error(
            'No refresh token available. Please revoke app access in your Google Account settings ' +
            '(myaccount.google.com/permissions) and try connecting again.'
        );
    }

    // Preserve history_id on reconnect so partial sync can resume
    // instead of forcing a full resync from zero
    const upsertData: Record<string, unknown> = {
        user_id: userId,
        email,
        connection_method: 'OAUTH',
        access_token: tokens.access_token,
        refresh_token: encryptedRefreshToken,
        status: 'ACTIVE',
        last_error_message: null,
        sync_fail_count: 0,
    };
    if (existingAccount?.history_id) {
        upsertData.history_id = existingAccount.history_id;
    }

    const { data, error } = await supabase
        .from('gmail_accounts')
        .upsert(upsertData, { onConflict: 'email' })
        .select('id, email')
        .single();

    if (error) throw error;
    return data;
}

/**
 * Refreshes a Gmail OAuth access token.
 *
 * Error handling distinguishes PERMANENT vs TRANSIENT failures:
 * - PERMANENT (invalid_grant, token revoked, bad client): marks account ERROR
 *   and throws AUTH_REQUIRED. User must reconnect.
 * - TRANSIENT (network, 5xx, rate limit): keeps account ACTIVE, throws
 *   TRANSIENT_ERROR. Next refresh cycle will retry.
 */
export async function refreshAccessToken(accountId: string): Promise<string> {
    const { data: account, error: fetchErr } = await supabase
        .from('gmail_accounts')
        .select('refresh_token, email, status')
        .eq('id', accountId)
        .single();

    if (fetchErr) {
        console.error(`[Token Refresh] DB fetch failed for ${accountId}:`, fetchErr.message);
        throw new Error('DB_ERROR');
    }

    if (!account?.refresh_token) {
        console.error(`[Token Refresh] No refresh_token stored for ${account?.email || accountId}`);
        await supabase
            .from('gmail_accounts')
            .update({
                status: 'ERROR',
                last_error_message: 'No refresh token — reconnect required',
            })
            .eq('id', accountId);
        throw new Error('AUTH_REQUIRED');
    }

    let decryptedRefreshToken: string;
    try {
        decryptedRefreshToken = decrypt(account.refresh_token);
    } catch (decryptErr: unknown) {
        const msg = decryptErr instanceof Error ? decryptErr.message : String(decryptErr);
        console.error(`[Token Refresh] Decrypt failed for ${account.email}:`, msg);
        // Decryption failure usually means ENCRYPTION_KEY rotation — permanent
        await supabase
            .from('gmail_accounts')
            .update({
                status: 'ERROR',
                last_error_message: 'Token decryption failed — reconnect required',
            })
            .eq('id', accountId);
        throw new Error('AUTH_REQUIRED');
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: decryptedRefreshToken });

    try {
        const response = await oauth2Client.refreshAccessToken();
        const newAccessToken = response.credentials.access_token;

        if (!newAccessToken) {
            throw new Error('Google returned no access_token');
        }

        await supabase
            .from('gmail_accounts')
            .update({
                access_token: newAccessToken,
                status: 'ACTIVE',
                last_error_message: null,
            })
            .eq('id', accountId);

        return newAccessToken;
    } catch (err: unknown) {
        const error = err as { message?: string; code?: string | number; response?: { status?: number; data?: unknown } };
        const msg = error?.message || String(err);
        const status = error?.response?.status;
        const errData = error?.response?.data;

        // Permanent auth failures — user must reconnect
        const isPermanent =
            msg.includes('invalid_grant') ||
            msg.includes('Token has been expired or revoked') ||
            msg.includes('invalid_client') ||
            msg.includes('unauthorized_client') ||
            status === 400 ||
            status === 401;

        // Detailed logging for diagnosis
        console.error(
            `[Token Refresh] ${isPermanent ? 'PERMANENT' : 'TRANSIENT'} failure for ${account.email} (${accountId})`,
            {
                message: msg.slice(0, 200),
                status,
                code: error?.code,
                data: errData ? JSON.stringify(errData).slice(0, 300) : undefined,
            }
        );

        if (isPermanent) {
            await supabase
                .from('gmail_accounts')
                .update({
                    status: 'ERROR',
                    last_error_message: msg.includes('invalid_grant')
                        ? 'Token expired — reconnect required'
                        : `Auth failed: ${msg.slice(0, 100)}`,
                })
                .eq('id', accountId);
            throw new Error('AUTH_REQUIRED');
        }

        // Transient error — do NOT mark ERROR, let next cycle retry
        throw new Error('TRANSIENT_ERROR');
    }
}
