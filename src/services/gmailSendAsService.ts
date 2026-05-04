import 'server-only';
import { google } from 'googleapis';
import { supabase } from '../lib/supabase';
import { refreshAccessToken } from './googleAuthService';

/**
 * Sync persona to Gmail's "Send Mail As" settings (Phase 14).
 *
 * What this CAN do:
 *   - Set the Send-Mail-As displayName for the OAuth account's primary
 *     address. This is what Gmail's own UI uses when the owner composes
 *     mail at mail.google.com — keeps the From-header name consistent
 *     with the Unibox persona regardless of which client they send from.
 *   - Set an HTML signature that embeds the persona image as an inline
 *     <img>. Gmail will render the image AT THE END OF THE BODY when
 *     received — it does NOT use it as the avatar circle (that's
 *     controlled by the recipient's contact card / sender's Google
 *     profile photo).
 *
 * What this CANNOT do (and why we're not pretending):
 *   - Set the user's Google profile photo. There is NO API for this.
 *     `people.updateContactPhoto` updates the caller's CONTACTS' photos,
 *     not the caller's own profile. The Admin SDK
 *     `directory.users.photos.update` requires Google Workspace admin
 *     of the same domain — none of these accounts are in a Workspace
 *     under our control. The only programmatic Gmail-avatar path is
 *     BIMI, which requires a $1,500/yr VMC certificate per domain.
 *   - Affect the avatar shown in recipients' inboxes. Recipient avatars
 *     are controlled by either (a) the recipient's own contact card for
 *     the sender, or (b) the sender's Google profile photo. Neither is
 *     reachable from the sender's OAuth tokens.
 *
 * Required OAuth scopes (already granted at connect time):
 *   - https://www.googleapis.com/auth/gmail.settings.basic — for sendAs.update
 *
 * If a future user reports "the scope isn't granted", they'll need to
 * disconnect + reconnect the Gmail account from /accounts. Existing
 * connections from before this scope was added will get a 403.
 *
 * Audit ref: docs/PHASE7-LAUNCH-OVERHAUL.md "Honesty pass — Avatar Breakthrough".
 */

export interface SyncResult {
    success: boolean;
    accountId: string;
    email: string;
    error?: string;
    /** True if the displayName changed; false if it was already in sync. */
    displayNameUpdated?: boolean;
    /** True if the signature changed. */
    signatureUpdated?: boolean;
}

function buildSignatureHtml(displayName: string, profileImage: string | null): string {
    if (!profileImage) {
        // Plain text signature with just the display name + the <hr> divider.
        return [
            `<hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />`,
            `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#111827;letter-spacing:-0.01em;">${escapeHtml(displayName)}</div>`,
        ].join('');
    }
    // Image signature for Gmail Send-As. Gmail renders this whenever the
    // user composes mail in Gmail's own UI — keeps the brand consistent
    // with Unibox-sent mail. Layout matches the body CID signature in
    // identitySchema.ts so recipients see one unified style across both
    // surfaces. NOT the Gmail avatar slot.
    return [
        `<hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />`,
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" `,
        `style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2937;">`,
        `<tr>`,
        `<td valign="middle" style="padding-right:14px;">`,
        `<img src="${escapeAttr(profileImage)}" alt="Profile Photo" width="60" height="60" `,
        `style="width:60px;height:60px;border-radius:50%;display:block;object-fit:cover;border:0;background:#f3f4f6;" />`,
        `</td>`,
        `<td valign="middle" style="line-height:1.45;">`,
        `<div style="font-size:15px;font-weight:600;color:#111827;letter-spacing:-0.01em;">${escapeHtml(displayName)}</div>`,
        `</td>`,
        `</tr>`,
        `</table>`,
    ].join('');
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export async function syncOAuthPersonaToSendAs(accountId: string): Promise<SyncResult> {
    // 1. Load the account.
    const { data: account, error: accErr } = await supabase
        .from('gmail_accounts')
        .select('id, email, display_name, profile_image, connection_method, access_token')
        .eq('id', accountId)
        .single();

    if (accErr || !account) {
        return { success: false, accountId, email: '<unknown>', error: 'Account not found' };
    }
    if (account.connection_method !== 'OAUTH') {
        return {
            success: false,
            accountId,
            email: account.email,
            error: 'Only OAuth accounts can be synced to Gmail SendAs settings — manual SMTP accounts have no Gmail Settings API surface.',
        };
    }

    const displayName = (account.display_name || '').trim();
    if (!displayName) {
        return {
            success: false,
            accountId,
            email: account.email,
            error: 'No display_name set on the account — set a persona first.',
        };
    }

    // 2. Build the Gmail client + retry on token expiry.
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI,
    );

    const performSync = async (token: string): Promise<{ displayNameUpdated: boolean; signatureUpdated: boolean }> => {
        oauth2Client.setCredentials({ access_token: token });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Read current SendAs settings for this address. The user's primary
        // sendAsEmail equals their account email.
        const current = await gmail.users.settings.sendAs.get({
            userId: 'me',
            sendAsEmail: account.email,
        });

        const currentName = current.data.displayName || '';
        const currentSig = current.data.signature || '';
        const targetSig = buildSignatureHtml(displayName, account.profile_image);

        const displayNameUpdated = currentName !== displayName;
        const signatureUpdated = currentSig !== targetSig;

        if (!displayNameUpdated && !signatureUpdated) {
            return { displayNameUpdated: false, signatureUpdated: false };
        }

        await gmail.users.settings.sendAs.update({
            userId: 'me',
            sendAsEmail: account.email,
            requestBody: {
                displayName,
                signature: targetSig,
            },
        });

        return { displayNameUpdated, signatureUpdated };
    };

    try {
        const r = await performSync(account.access_token);
        return {
            success: true,
            accountId: account.id,
            email: account.email,
            displayNameUpdated: r.displayNameUpdated,
            signatureUpdated: r.signatureUpdated,
        };
    } catch (error: unknown) {
        const err = error as { code?: number; message?: string };
        const isAuthError = err.code === 401 || /invalid_grant/i.test(err.message || '');
        if (isAuthError) {
            try {
                const newToken = await refreshAccessToken(accountId);
                const r = await performSync(newToken);
                return {
                    success: true,
                    accountId: account.id,
                    email: account.email,
                    displayNameUpdated: r.displayNameUpdated,
                    signatureUpdated: r.signatureUpdated,
                };
            } catch (refreshErr: unknown) {
                const msg = refreshErr instanceof Error ? refreshErr.message : 'unknown';
                return { success: false, accountId, email: account.email, error: `Token refresh failed: ${msg}` };
            }
        }
        // Common case: missing scope. Gmail returns 403 with
        // "Request had insufficient authentication scopes". The account
        // owner needs to disconnect and reconnect via /accounts to grant
        // gmail.settings.basic.
        const insufficientScopes = /insufficient.*scope|forbidden/i.test(err.message || '');
        const userFacing = insufficientScopes
            ? 'OAuth scope missing. Reconnect the account from /accounts to grant gmail.settings.basic.'
            : (err.message || 'unknown error');
        return { success: false, accountId, email: account.email, error: userFacing };
    }
}

/**
 * Bulk sync — for an admin-triggered "sync all OAuth personas to Gmail" button.
 * Returns per-account results so the UI can surface which ones need a reconnect.
 */
export async function syncAllOAuthPersonasToSendAs(): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    results: SyncResult[];
}> {
    const { data: oauthAccounts } = await supabase
        .from('gmail_accounts')
        .select('id')
        .eq('connection_method', 'OAUTH')
        .eq('status', 'ACTIVE');

    const results: SyncResult[] = [];
    let succeeded = 0;
    let failed = 0;
    for (const a of oauthAccounts || []) {
        const r = await syncOAuthPersonaToSendAs(a.id);
        results.push(r);
        if (r.success) succeeded++;
        else failed++;
    }
    return {
        total: results.length,
        succeeded,
        failed,
        results,
    };
}
