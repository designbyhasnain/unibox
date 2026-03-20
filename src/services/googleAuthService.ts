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

    // Fetch existing account to preserve refresh token if a new one isn't provided
    const { data: existingAccount } = await supabase
        .from('gmail_accounts')
        .select('refresh_token')
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

    const { data, error } = await supabase
        .from('gmail_accounts')
        .upsert({
            user_id: userId,
            email,
            connection_method: 'OAUTH',
            access_token: tokens.access_token,
            refresh_token: encryptedRefreshToken,
            status: 'ACTIVE',
        }, { onConflict: 'email' })
        .select('id, email')
        .single();

    if (error) throw error;
    return data;
}

export async function refreshAccessToken(accountId: string): Promise<string> {
    const { data: account, error } = await supabase
        .from('gmail_accounts')
        .select('refresh_token')
        .eq('id', accountId)
        .single();

    if (error || !account?.refresh_token) throw new Error('No refresh token found');

    const decryptedRefreshToken = decrypt(account.refresh_token);
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: decryptedRefreshToken });

    try {
        const response = await oauth2Client.refreshAccessToken();
        const newAccessToken = response.credentials.access_token;

        if (!newAccessToken) throw new Error('Failed to refresh access token');

        await supabase
            .from('gmail_accounts')
            .update({ access_token: newAccessToken, status: 'ACTIVE' })
            .eq('id', accountId);

        return newAccessToken;
    } catch (err: any) {
        // Log full error for debugging, but don't expose details to the client
        console.error(`[Token Refresh] Failed to refresh token for account`, err?.message);
        await supabase
            .from('gmail_accounts')
            .update({ status: 'ERROR' })
            .eq('id', accountId);
        throw new Error('AUTH_REQUIRED');
    }
}
