import 'server-only';
import { google } from 'googleapis';
import { supabase } from '../lib/supabase';
import { decrypt } from '../utils/encryption';

/**
 * Create an authenticated Gmail API client from an account record.
 * Sets up automatic token refresh that persists new access tokens to DB.
 */
export function getGmailClientFromAccount(account: {
    id: string;
    email?: string;
    access_token: string | null;
    refresh_token: string | null;
}): ReturnType<typeof google.gmail> {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    let refreshToken = account.refresh_token;
    if (refreshToken && refreshToken.includes(':')) {
        try {
            refreshToken = decrypt(refreshToken);
        } catch (e) {
            console.error('Failed to decrypt refresh token:', e);
        }
    }

    oauth2Client.setCredentials({
        access_token: account.access_token,
        refresh_token: refreshToken,
    });

    // Automatically save new access tokens when googleapis refreshes them
    oauth2Client.on('tokens', async (tokens) => {
        if (tokens.access_token) {
            console.log(`[OAuth] Auto-refreshing access token for account ${account.email}`);
            await supabase
                .from('gmail_accounts')
                .update({ access_token: tokens.access_token })
                .eq('id', account.id);
        }
    });

    return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Create an authenticated Gmail API client by account ID.
 * Fetches the account from DB first.
 */
export async function getGmailClient(accountId: string): Promise<ReturnType<typeof google.gmail>> {
    const { data: account, error } = await supabase
        .from('gmail_accounts')
        .select('id, email, access_token, refresh_token, status')
        .eq('id', accountId)
        .single();

    if (error || !account) throw new Error('Account not found');
    if (account.status !== 'ACTIVE') throw new Error('Account not active');

    return getGmailClientFromAccount(account);
}
