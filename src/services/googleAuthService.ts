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
    // Required for gmail.users.settings.sendAs.update (display name + signature).
    // Adding it explicitly even though `https://mail.google.com/` covers it as a
    // superset — gmail.settings.basic is the granular scope Google recommends.
    'https://www.googleapis.com/auth/gmail.settings.basic',
    // Required to fetch the connected user's profile name + photo so we can
    // sync them into the Unibox persona. Pre-existing.
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

    // Fetch existing account to preserve refresh token, history_id, and persona
    const { data: existingAccount } = await supabase
        .from('gmail_accounts')
        .select('refresh_token, history_id, display_name, profile_image')
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
    // instead of forcing a full resync from zero.
    // Persona: auto-populate from Google if not manually set — manual persona wins.
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

    // Backfill Google profile name + picture if the account has no manual persona.
    if (!existingAccount?.display_name && userInfo.name) {
        upsertData.display_name = userInfo.name;
    }
    if (!existingAccount?.profile_image && userInfo.picture) {
        upsertData.profile_image = userInfo.picture;
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
 * Fetch the Google profile (name + picture) for an already-connected OAuth
 * account using its current access token. Returns null if the token is
 * invalid or the request fails.
 */
export async function fetchGoogleProfile(
    accessToken: string
): Promise<{ name: string | null; picture: string | null } | null> {
    try {
        const res = await fetch(
            'https://www.googleapis.com/oauth2/v2/userinfo?fields=name,picture',
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) return null;
        const data: { name?: string; picture?: string } = await res.json();
        return {
            name: data.name ?? null,
            picture: data.picture ?? null,
        };
    } catch {
        return null;
    }
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
                sync_fail_count: 0,
                last_error_at: null,
            })
            .eq('id', accountId);

        return newAccessToken;
    } catch (err: unknown) {
        const error = err as { message?: string; code?: string | number; response?: { status?: number; data?: unknown } };
        const msg = error?.message || String(err);
        const status = error?.response?.status;
        const errData = error?.response?.data as { error?: string; error_description?: string } | undefined;
        const errCode = (errData?.error || '').toLowerCase();

        // Permanent auth failures = Google has explicitly revoked / invalidated the
        // refresh token. ONLY trust the OAuth error code in the response body, or an
        // unambiguous error message. Do NOT treat bare 400/401 as permanent — Google
        // returns those for transient issues too (clock skew, short-lived outages,
        // rate-limit overflow on the token endpoint).
        const isPermanent =
            errCode === 'invalid_grant' ||
            errCode === 'invalid_client' ||
            errCode === 'unauthorized_client' ||
            msg.includes('Token has been expired or revoked') ||
            /invalid_grant/i.test(msg);

        // Rate limit / transient server error — never marks ERROR.
        const isRateLimit = status === 429 || errCode === 'slow_down' || errCode === 'temporarily_unavailable';
        const isServerError = typeof status === 'number' && status >= 500;

        console.error(
            `[Token Refresh] ${isPermanent ? 'PERMANENT' : isRateLimit ? 'RATE_LIMIT' : isServerError ? 'SERVER_ERROR' : 'TRANSIENT'} failure for ${account.email} (${accountId})`,
            {
                message: msg.slice(0, 200),
                status,
                oauthError: errCode || undefined,
                code: error?.code,
                data: errData ? JSON.stringify(errData).slice(0, 300) : undefined,
            }
        );

        if (isPermanent) {
            await supabase
                .from('gmail_accounts')
                .update({
                    status: 'ERROR',
                    last_error_message: errCode === 'invalid_grant'
                        ? 'Token revoked — reconnect required'
                        : `Auth failed (${errCode || 'unknown'}): ${msg.slice(0, 100)}`,
                    last_error_at: new Date().toISOString(),
                })
                .eq('id', accountId);
            throw new Error('AUTH_REQUIRED');
        }

        // Transient: bump the counter + timestamp, but keep status ACTIVE.
        // Next sync cycle retries automatically. Never disconnects over a blip.
        try {
            const { data: cur } = await supabase
                .from('gmail_accounts')
                .select('sync_fail_count')
                .eq('id', accountId)
                .maybeSingle();
            await supabase
                .from('gmail_accounts')
                .update({
                    last_error_message: `Transient: ${msg.slice(0, 100)} (will retry)`,
                    last_error_at: new Date().toISOString(),
                    sync_fail_count: (cur?.sync_fail_count ?? 0) + 1,
                })
                .eq('id', accountId);
        } catch {
            // counter increment is best-effort; never let it swallow the original error
        }
        throw new Error('TRANSIENT_ERROR');
    }
}

/**
 * Fast token-validity probe. Calls a cheap Gmail endpoint to confirm the
 * current access token works. On 401/invalid_grant triggers refresh.
 * Returns the valid access token, or throws AUTH_REQUIRED / TRANSIENT_ERROR.
 *
 * Call this BEFORE a full sync to avoid burning an expensive history call on
 * a dead token.
 */
export async function verifyAccessToken(accountId: string): Promise<string> {
    const { data: account } = await supabase
        .from('gmail_accounts')
        .select('access_token, email')
        .eq('id', accountId)
        .maybeSingle();

    if (!account?.access_token) {
        // No access token cached — do a full refresh.
        return await refreshAccessToken(accountId);
    }

    try {
        const res = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress`,
            { headers: { Authorization: `Bearer ${account.access_token}` } }
        );
        if (res.ok) return account.access_token;
        if (res.status === 401) {
            // Access token expired — refresh.
            return await refreshAccessToken(accountId);
        }
        // 5xx / 429 / other — consider transient; return the current token so the
        // caller can attempt the operation and hit its own retry path.
        return account.access_token;
    } catch {
        // Network hiccup — return current token; caller's error path will sort it out.
        return account.access_token;
    }
}
