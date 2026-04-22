'use server';

import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { supabase } from '../lib/supabase';
import { getGoogleAuthUrl, generateOAuthState, handleAuthCallback, fetchGoogleProfile, refreshAccessToken } from '../services/googleAuthService';
import { testManualConnection } from '../services/manualEmailService';
import { encrypt, decrypt } from '../utils/encryption';
import { syncGmailEmails, deepGapFillSync } from '../services/gmailSyncService';
import { syncManualEmails } from '../services/manualEmailService';
import { normalizeEmail } from '../utils/emailNormalizer';
import { ensureAuthenticated } from '../lib/safe-action';
import { requireAdmin, getAccessibleGmailAccountIds } from '../utils/accessControl';

export async function getGoogleAuthUrlAction(): Promise<string> {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') throw new Error('Admin access required');
    const state = generateOAuthState();

    const cookieStore = await cookies();
    cookieStore.set('oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
        path: '/api/auth',
    });

    return getGoogleAuthUrl(state);
}

export async function connectManualAccountAction(
    email: string,
    appPassword: string,
    config?: {
        imapHost?: string;
        imapPort?: number;
        smtpHost?: string;
        smtpPort?: number;
    }
): Promise<{ success: boolean; error?: string; account?: any }> {
    const { userId, role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };
    try {
        if (!email || !appPassword) {
            return { success: false, error: 'Email and app password are required' };
        }

        const normalizedEmail = normalizeEmail(email);

        // Test the credentials first
        const testResult = await testManualConnection(normalizedEmail, appPassword, config);
        if (!testResult.success) {
            return { success: false, error: testResult.error || 'Connection test failed' };
        }

        // Check if an OAuth account already exists for this email to avoid overwriting it
        const { data: existingAccount } = await supabase
            .from('gmail_accounts')
            .select('id, connection_method')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (existingAccount && existingAccount.connection_method === 'OAUTH') {
            return { success: false, error: 'This email is already connected via OAuth. Remove the OAuth connection first before adding a manual connection.' };
        }

        const encryptedPassword = encrypt(appPassword);

        const { data: account, error } = await supabase
            .from('gmail_accounts')
            .upsert({
                user_id: userId,
                email: normalizedEmail,
                connection_method: 'MANUAL',
                app_password: encryptedPassword,
                status: 'ACTIVE',
                smtp_host: config?.smtpHost,
                smtp_port: config?.smtpPort,
                imap_host: config?.imapHost,
                imap_port: config?.imapPort,
            }, { onConflict: 'email' })
            .select('*')
            .single();

        if (error) throw error;
        return { success: true, account };
    } catch (err: any) {
        console.error('[accountActions] connectManualAccountAction error:', err);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}




export async function getAccountsAction() {
    const { userId, role } = await ensureAuthenticated();
    try {
        const accessible = await getAccessibleGmailAccountIds(userId, role);

        if (Array.isArray(accessible) && accessible.length === 0) {
            return { success: true, accounts: [] };
        }

        // 1. Fetch basic account data first
        let query = supabase
            .from('gmail_accounts')
            .select(`
                *,
                users ( name )
            `);

        if (accessible !== 'ALL') {
            query = query.in('id', accessible);
        }

        const { data: rawData, error } = await query
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[accountActions] getAccountsAction database error:', error);
            return { success: false, accounts: [], error: 'An error occurred while processing your request' };
        }

        // 2. Fetch thread counts per account in a single fast query using denormalized email_threads table
        const accountIds = (rawData ?? []).map(a => a.id);
        const countsByAccount: Record<string, number> = {};
        if (accountIds.length > 0) {
            const { data: countData } = await supabase.rpc('get_account_thread_counts', {
                p_account_ids: accountIds
            });
            if (countData && typeof countData === 'object') {
                Object.assign(countsByAccount, countData);
            }
        }

        const accountsWithCounts = (rawData ?? []).map((acc) => ({
            ...acc,
            sent_count_today: acc.sent_count_today || 0,
            manager_name: acc.users?.name,
            emails_count: countsByAccount[acc.id] ?? 0
        }));

        // 3. Auto-fix stuck syncs (more than 15 mins or 100% progress)
        const now = new Date();
        const stuckAccounts = accountsWithCounts.filter(acc => {
            if (acc.status !== 'SYNCING') return false;
            if (acc.sync_progress === 100) return true;
            const lastUpdate = new Date(acc.updated_at);
            const minsSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
            return minsSinceUpdate > 15; // Stuck for 15+ mins
        });

        if (stuckAccounts.length > 0) {
            console.log('[getAccountsAction] Fixing stuck syncs:', stuckAccounts.length);
            // Fire and forget update
            (async () => {
                try {
                    await supabase
                        .from('gmail_accounts')
                        .update({ status: 'ACTIVE', sync_progress: 100 })
                        .in('id', stuckAccounts.map(a => a.id));
                } catch (err) {
                    console.error('[getAccountsAction] Failed to fix stuck syncs:', err);
                }
            })();

            // Reflect in the returned objects
            stuckAccounts.forEach(sa => {
                const local = accountsWithCounts.find(a => a.id === sa.id);
                if (local) {
                    local.status = 'ACTIVE';
                    local.sync_progress = 100;
                }
            });
        }

        console.log('[getAccountsAction] Found accounts:', accountsWithCounts.length);
        return { success: true, accounts: accountsWithCounts };
    } catch (err: any) {
        console.error('[accountActions] getAccountsAction unexpected error:', err);
        return { success: false, accounts: [], error: 'An error occurred while processing your request' };
    }
}


export async function reSyncAccountAction(accountId: string, connectionMethod: 'OAUTH' | 'MANUAL'): Promise<{ success: boolean; error?: string }> {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };
    if (!accountId) return { success: false, error: 'accountId is required' };
    try {
        if (connectionMethod === 'OAUTH') {
            // Deep gap-fill (last 30 days, batched 5-at-a-time) — this backfills
            // any mail the account missed while in ERROR or between webhook hits.
            // Runs in the background so the UI returns immediately.
            deepGapFillSync(accountId, 30).catch(err => {
                console.error('[reSyncAccountAction] deep sync error:', err?.message || err);
            });
            return { success: true };
        }

        // MANUAL (IMAP/SMTP): await so the user sees a real pass/fail.
        try {
            await syncManualEmails(accountId);
            return { success: true };
        } catch (syncErr: any) {
            const msg = syncErr?.message || 'IMAP sync failed';
            console.error('[reSyncAccountAction] manual sync error:', msg);
            // Surface the reason in the accounts panel (yellow badge + Re-test CTA).
            await supabase
                .from('gmail_accounts')
                .update({
                    last_error_message: `Manual re-sync: ${msg}`.slice(0, 500),
                    last_error_at: new Date().toISOString(),
                })
                .eq('id', accountId);
            return { success: false, error: msg };
        }
    } catch (error: any) {
        console.error('[accountActions] reSyncAccountAction error:', error);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}

export async function syncAllUserAccountsAction(): Promise<{ success: boolean; accountsSynced: number }> {
    const { userId, role } = await ensureAuthenticated();
    const accessible = await getAccessibleGmailAccountIds(userId, role);

    if (Array.isArray(accessible) && accessible.length === 0) {
        return { success: true, accountsSynced: 0 };
    }

    let query = supabase.from('gmail_accounts').select('id, connection_method');
    if (accessible !== 'ALL') {
        query = query.in('id', accessible);
    }
    const { data: accounts } = await query;
    if (!accounts || accounts.length === 0) return { success: true, accountsSynced: 0 };

    for (const acc of accounts) {
        if (acc.connection_method === 'OAUTH') {
            syncGmailEmails(acc.id).catch(console.error);
        } else {
            syncManualEmails(acc.id).catch(console.error);
        }
    }
    return { success: true, accountsSynced: accounts.length };
}

export async function toggleSyncStatusAction(accountId: string, currentStatus: string) {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };
    if (!accountId) return { success: false, error: 'accountId is required' };
    // Only allow toggling between ACTIVE and PAUSED states
    if (currentStatus !== 'ACTIVE' && currentStatus !== 'PAUSED') {
        return { success: false, error: `Cannot toggle from status '${currentStatus}'. Only ACTIVE and PAUSED accounts can be toggled.` };
    }
    const newStatus = currentStatus === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
    try {
        const { error } = await supabase
            .from('gmail_accounts')
            .update({ status: newStatus })
            .eq('id', accountId);

        if (error) throw error;
        return { success: true, status: newStatus };
    } catch (err: any) {
        console.error('[accountActions] toggleSyncStatusAction error:', err);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}

export async function stopSyncingAction(accountId: string) {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };
    if (!accountId) return { success: false, error: 'accountId is required' };
    try {
        const { error } = await supabase
            .from('gmail_accounts')
            .update({
                status: 'ACTIVE',
                sync_progress: 100
            })
            .eq('id', accountId);

        if (error) throw error;
        return { success: true };
    } catch (err: any) {
        console.error('[accountActions] stopSyncingAction error:', err);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}

export async function removeAccountAction(accountId: string): Promise<{ success: boolean; error?: string }> {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };
    if (!accountId) return { success: false, error: 'accountId is required' };

    const { data: account } = await supabase.from('gmail_accounts').select('*').eq('id', accountId).single();
    if (!account) return { success: false, error: 'Account not found.' };

    if (account.connection_method === 'OAUTH' && account.refresh_token) {
        try {
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );
            const decryptedToken = decrypt(account.refresh_token);
            await oauth2Client.revokeToken(decryptedToken);
        } catch (e: any) {
            console.error('Failed to revoke token', e.message);
        }
    }

    // ── Protect CRM Data ──────────────────────────────────────────────────────
    // We want to keep Projects and Contacts even if the account is removed.
    // We also want to keep the "mail history" for these clients.

    // 1. Identify and "protect" emails linked to contacts or projects 
    // by nullifying their gmail_account_id so they aren't deleted by cascade.
    await supabase
        .from('email_messages')
        .update({ gmail_account_id: null })
        .eq('gmail_account_id', accountId)
        .or('contact_id.not.is.null');
    // Note: Projects reference messages by ID, so as long as the message exists, 
    // the project link remains valid.

    // ── Final Account Deletion ────────────────────────────────────────────────
    // This will delete the account and CASCADE delete all general sync emails 
    // (the ones we didn't nullify above).

    const { error } = await supabase
        .from('gmail_accounts')
        .delete()
        .eq('id', accountId);

    if (error) {
        console.error('[accountActions] removeAccountAction error:', error);
        return { success: false, error: 'An error occurred while processing your request' };
    }
    return { success: true };
}

// ─── Force Renew All Gmail Watches (Admin only) ─────────────────────────────

export async function renewAllWatchesAction(): Promise<{
    success: boolean;
    renewed?: number;
    failed?: number;
    errors?: string[];
    error?: string;
}> {
    try {
        const { role } = await ensureAuthenticated();
        requireAdmin(role);

        // Mark all OAuth accounts' watches as expired to force renewal
        await supabase
            .from('gmail_accounts')
            .update({ watch_status: 'EXPIRED' })
            .eq('connection_method', 'OAUTH')
            .eq('status', 'ACTIVE');

        const { renewExpiringWatches } = await import('../services/watchRenewalService');
        const result = await renewExpiringWatches();

        return { success: true, ...result };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[renewAllWatchesAction] error:', msg);
        return {
            success: false,
            error: msg === 'ADMIN_REQUIRED' ? 'Only admins can renew watches' : 'An error occurred',
        };
    }
}

/**
 * Re-test a MANUAL (IMAP/SMTP) account's stored credentials without asking the
 * user to retype the app password. Decrypts the stored password, runs the
 * existing IMAP+SMTP probe, and writes the outcome back to the row.
 * ADMIN only.
 */
export async function retestManualAccountAction(accountId: string): Promise<{
    success: boolean;
    imap?: boolean;
    smtp?: boolean;
    error?: string;
}> {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };
    if (!accountId) return { success: false, error: 'accountId is required' };

    const { data: account, error: fetchErr } = await supabase
        .from('gmail_accounts')
        .select('id, email, connection_method, app_password, imap_host, imap_port, smtp_host, smtp_port')
        .eq('id', accountId)
        .maybeSingle();
    if (fetchErr || !account) return { success: false, error: 'Account not found' };
    if (account.connection_method !== 'MANUAL') return { success: false, error: 'Only manual accounts can be re-tested this way' };
    if (!account.app_password) return { success: false, error: 'No stored app password on this account' };

    let password: string;
    try {
        password = decrypt(account.app_password);
    } catch {
        return { success: false, error: 'Stored app password could not be decrypted (ENCRYPTION_KEY may have changed)' };
    }

    const result = await testManualConnection(account.email, password, {
        imapHost: account.imap_host || undefined,
        imapPort: account.imap_port || undefined,
        smtpHost: account.smtp_host || undefined,
        smtpPort: account.smtp_port || undefined,
    });

    if (result.success) {
        await supabase.from('gmail_accounts').update({
            status: 'ACTIVE',
            last_error_message: null,
            last_error_at: null,
            sync_fail_count: 0,
        }).eq('id', accountId);
        return { success: true, imap: true, smtp: true };
    }

    // Connection failed — record the error but never mark ERROR automatically.
    // The user decides whether to rotate the app password.
    await supabase.from('gmail_accounts').update({
        last_error_message: (result.error || 'Connection test failed').slice(0, 200),
        last_error_at: new Date().toISOString(),
    }).eq('id', accountId);
    return { success: false, error: result.error || 'Connection test failed' };
}

/**
 * Bulk recovery tool. Attempts a token refresh (OAuth) or connection probe
 * (MANUAL) for every account, in batches of 5 to avoid timeouts or burst
 * rate limits. Never marks an account ERROR by itself — that still only
 * happens on a confirmed invalid_grant from Google. Returns a summary the
 * UI can render.
 * ADMIN only.
 */
export async function syncAllAccountsHealthAction(): Promise<{
    success: boolean;
    checked: number;
    recovered: number;
    stillFailing: number;
    permanent: number;
    failures: { email: string; reason: string }[];
    error?: string;
}> {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return {
        success: false, checked: 0, recovered: 0, stillFailing: 0, permanent: 0, failures: [],
        error: 'Admin access required',
    };

    const { data: accounts, error: fetchErr } = await supabase
        .from('gmail_accounts')
        .select('id, email, connection_method, status, app_password, imap_host, imap_port, smtp_host, smtp_port')
        .order('email');
    if (fetchErr || !accounts) return {
        success: false, checked: 0, recovered: 0, stillFailing: 0, permanent: 0, failures: [],
        error: fetchErr?.message || 'Failed to load accounts',
    };

    const { refreshAccessToken } = await import('../services/googleAuthService');
    const BATCH = 5;

    let recovered = 0;
    let stillFailing = 0;
    let permanent = 0;
    const failures: { email: string; reason: string }[] = [];

    type HealthAccount = NonNullable<typeof accounts>[number];
    async function handleOne(acc: HealthAccount) {
        try {
            if (acc.connection_method === 'OAUTH') {
                await refreshAccessToken(acc.id);
                recovered++;
                return;
            }
            // MANUAL — decrypt + probe
            if (!acc.app_password) {
                stillFailing++;
                failures.push({ email: acc.email, reason: 'No stored app password' });
                return;
            }
            let password: string;
            try { password = decrypt(acc.app_password); }
            catch {
                stillFailing++;
                failures.push({ email: acc.email, reason: 'Password decryption failed' });
                return;
            }
            const res = await testManualConnection(acc.email, password, {
                imapHost: acc.imap_host || undefined,
                imapPort: acc.imap_port || undefined,
                smtpHost: acc.smtp_host || undefined,
                smtpPort: acc.smtp_port || undefined,
            });
            if (res.success) {
                await supabase.from('gmail_accounts').update({
                    status: 'ACTIVE',
                    last_error_message: null,
                    last_error_at: null,
                    sync_fail_count: 0,
                }).eq('id', acc.id);
                recovered++;
            } else {
                stillFailing++;
                failures.push({ email: acc.email, reason: (res.error || 'Connection failed').slice(0, 160) });
                await supabase.from('gmail_accounts').update({
                    last_error_message: (res.error || 'Connection failed').slice(0, 200),
                    last_error_at: new Date().toISOString(),
                }).eq('id', acc.id);
            }
        } catch (e: any) {
            const m = e?.message || String(e);
            if (m === 'AUTH_REQUIRED') {
                permanent++;
                failures.push({ email: acc.email, reason: 'Reconnect required (token revoked)' });
            } else {
                stillFailing++;
                failures.push({ email: acc.email, reason: m.slice(0, 160) });
            }
        }
    }

    for (let i = 0; i < accounts.length; i += BATCH) {
        const batch = accounts.slice(i, i + BATCH);
        await Promise.all(batch.map(handleOne));
    }

    return {
        success: true,
        checked: accounts.length,
        recovered,
        stillFailing,
        permanent,
        failures: failures.slice(0, 50),
    };
}

// ─── Persona: display name + profile photo shown in the From header ──────────

const AVATARS_BUCKET = 'avatars';
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

async function ensureAvatarsBucket(): Promise<void> {
    // Idempotent — creates the bucket the first time we ever upload, makes it
    // public so email clients can fetch the image.
    const { data: existing } = await supabase.storage.getBucket(AVATARS_BUCKET);
    if (existing) return;
    const { error } = await supabase.storage.createBucket(AVATARS_BUCKET, {
        public: true,
        fileSizeLimit: MAX_IMAGE_BYTES,
        allowedMimeTypes: ALLOWED_MIME,
    });
    if (error && !/already exists/i.test(error.message)) {
        throw new Error(`Failed to create avatars bucket: ${error.message}`);
    }
}

export async function uploadPersonaImageAction(
    formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') {
        return { success: false, error: 'Admin access required' };
    }

    const file = formData.get('file');
    if (!(file instanceof File)) return { success: false, error: 'No file uploaded' };
    if (file.size > MAX_IMAGE_BYTES) return { success: false, error: 'Image too large (max 5 MB)' };
    if (!ALLOWED_MIME.includes(file.type)) {
        return { success: false, error: 'Only JPG, PNG, WebP, GIF accepted' };
    }

    try {
        await ensureAvatarsBucket();

        const ext = (file.name.split('.').pop() || 'img').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `personas/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'img'}`;
        const bytes = Buffer.from(await file.arrayBuffer());

        const { error: uploadError } = await supabase.storage
            .from(AVATARS_BUCKET)
            .upload(path, bytes, {
                contentType: file.type,
                cacheControl: '31536000',
                upsert: false,
            });
        if (uploadError) return { success: false, error: uploadError.message };

        const { data: pub } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
        return { success: true, url: pub.publicUrl };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Upload failed' };
    }
}

export async function updateAccountPersonaAction(
    accountId: string,
    patch: { displayName?: string | null; profileImage?: string | null }
): Promise<{ success: boolean; error?: string }> {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') {
        return { success: false, error: 'Admin access required' };
    }
    const update: Record<string, any> = {};
    if (patch.displayName !== undefined) update.display_name = patch.displayName?.trim() || null;
    if (patch.profileImage !== undefined) update.profile_image = patch.profileImage || null;
    if (Object.keys(update).length === 0) return { success: true };

    const { error } = await supabase.from('gmail_accounts').update(update).eq('id', accountId);
    if (error) return { success: false, error: error.message };
    return { success: true };
}

export async function bulkApplyPersonaAction(
    accountIds: string[],
    persona: { displayName?: string | null; profileImage?: string | null }
): Promise<{ success: boolean; updated?: number; error?: string }> {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') {
        return { success: false, error: 'Admin access required' };
    }
    if (!accountIds.length) return { success: false, error: 'No accounts selected' };

    const update: Record<string, any> = {};
    if (persona.displayName !== undefined) update.display_name = persona.displayName?.trim() || null;
    if (persona.profileImage !== undefined) update.profile_image = persona.profileImage || null;
    if (Object.keys(update).length === 0) return { success: false, error: 'Nothing to apply' };

    const { data, error } = await supabase
        .from('gmail_accounts')
        .update(update)
        .in('id', accountIds)
        .select('id');
    if (error) return { success: false, error: error.message };
    return { success: true, updated: data?.length || 0 };
}

export async function clearPersonaAction(accountId: string): Promise<{ success: boolean; error?: string }> {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') {
        return { success: false, error: 'Admin access required' };
    }
    const { error } = await supabase
        .from('gmail_accounts')
        .update({ display_name: null, profile_image: null })
        .eq('id', accountId);
    if (error) return { success: false, error: error.message };
    return { success: true };
}

/**
 * Go through all OAuth accounts that are missing a name OR picture and
 * populate them from Google's userinfo endpoint.
 *
 * Priority: manual persona always wins — only NULL fields are filled.
 * Skips accounts where both display_name and profile_image are already set.
 * Tries the stored access_token first; falls back to a token refresh if it
 * gets a 401.
 */
export async function syncGoogleProfilesAction(): Promise<{
    success: boolean;
    processed?: number;
    updated?: number;
    failed?: number;
    error?: string;
}> {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') {
        return { success: false, error: 'Admin access required' };
    }

    // Fetch all OAuth accounts that still have at least one null persona field.
    const { data: accounts, error: fetchErr } = await supabase
        .from('gmail_accounts')
        .select('id, email, access_token, refresh_token, display_name, profile_image')
        .eq('connection_method', 'OAUTH')
        .or('display_name.is.null,profile_image.is.null');

    if (fetchErr) return { success: false, error: fetchErr.message };
    if (!accounts || accounts.length === 0) {
        return { success: true, processed: 0, updated: 0, failed: 0 };
    }

    let updated = 0;
    let failed = 0;

    for (const account of accounts) {
        try {
            let token: string = account.access_token;

            let profile = token ? await fetchGoogleProfile(token) : null;

            // Access token expired — try a refresh.
            if (!profile && account.refresh_token) {
                try {
                    token = await refreshAccessToken(account.id);
                    profile = await fetchGoogleProfile(token);
                } catch {
                    // refresh failed — skip, don't break the loop
                }
            }

            if (!profile) { failed++; continue; }

            const patch: Record<string, string> = {};
            if (!account.display_name && profile.name) patch.display_name = profile.name;
            if (!account.profile_image && profile.picture) patch.profile_image = profile.picture;

            if (Object.keys(patch).length === 0) continue; // nothing new to write

            await supabase.from('gmail_accounts').update(patch).eq('id', account.id);
            updated++;
        } catch {
            failed++;
        }
    }

    return { success: true, processed: accounts.length, updated, failed };
}
