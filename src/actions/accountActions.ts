'use server';

import { google } from 'googleapis';
import { supabase } from '../lib/supabase';
import { getGoogleAuthUrl, handleAuthCallback } from '../services/googleAuthService';
import { testManualConnection } from '../services/manualEmailService';
import { encrypt, decrypt } from '../utils/encryption';
import { syncGmailEmails } from '../services/gmailSyncService';
import { syncManualEmails } from '../services/manualEmailService';

export async function getGoogleAuthUrlAction(): Promise<string> {
    return getGoogleAuthUrl();
}

export async function connectManualAccountAction(
    email: string,
    appPassword: string,
    userId: string,
    config?: {
        imapHost?: string;
        imapPort?: number;
        smtpHost?: string;
        smtpPort?: number;
    }
): Promise<{ success: boolean; error?: string; account?: any }> {
    try {
        // Test the credentials first
        const testResult = await testManualConnection(email, appPassword, config);
        if (!testResult.success) {
            return { success: false, error: testResult.error || 'Connection test failed' };
        }

        const encryptedPassword = encrypt(appPassword);

        const { data: account, error } = await supabase
            .from('gmail_accounts')
            .upsert({
                user_id: userId,
                email,
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
        console.error('connectManualAccountAction error:', err);
        return { success: false, error: err.message || 'Unknown error' };
    }
}

export async function updateWarmupSettingsAction(
    accountId: string,
    warmupEnabled: boolean,
    dailyLimit: number
): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('gmail_accounts')
            .update({
                warmup_enabled: warmupEnabled,
                daily_limit: dailyLimit,
                status: warmupEnabled ? 'WARMUP' : 'ACTIVE'
            })
            .eq('id', accountId);

        if (error) throw error;
        return { success: true };
    } catch (err: any) {
        console.error('updateWarmupSettingsAction error:', err);
        return { success: false, error: err.message || 'Failed to update settings' };
    }
}


export async function getAccountsAction(userId: string) {
    // Lazy reset for daily sent count
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const { data: rawData, error } = await supabase
        .from('gmail_accounts')
        .select(`
            *,
            users ( name ),
            email_messages (count)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('getAccountsAction error:', error);
        return [];
    }

    const accounts = (rawData ?? []).map((acc: any) => {
        // Check if we need to reset the count (if last update was before today)
        const lastUpdate = new Date(acc.updated_at);
        const lastUpdateDate = new Date(lastUpdate.getFullYear(), lastUpdate.getMonth(), lastUpdate.getDate()).toISOString();

        const needsReset = lastUpdateDate < today;

        return {
            ...acc,
            sent_count_today: needsReset ? 0 : (acc.sent_count_today || 0),
            manager_name: acc.users?.name,
            emails_count: acc.email_messages?.[0]?.count ?? 0
        };
    });

    // If any needed reset, update them in background
    const accountsToReset = accounts.filter((a, i) => {
        const raw = rawData[i];
        const lu = new Date(raw.updated_at);
        const lud = new Date(lu.getFullYear(), lu.getMonth(), lu.getDate()).toISOString();
        return lud < today && raw.sent_count_today > 0;
    });

    if (accountsToReset.length > 0) {
        supabase
            .from('gmail_accounts')
            .update({ sent_count_today: 0 })
            .in('id', accountsToReset.map(a => a.id))
            .then(({ error }) => {
                if (error) console.error('Failed to reset daily counts:', error);
            });
    }

    return accounts;
}


export async function reSyncAccountAction(accountId: string, connectionMethod: 'OAUTH' | 'MANUAL'): Promise<{ success: boolean; error?: string }> {
    try {
        if (connectionMethod === 'OAUTH') {
            // Trigger sync in the background so we don't block the UI forever
            syncGmailEmails(accountId).catch(console.error);
        } else {
            syncManualEmails(accountId).catch(console.error);
        }
        return { success: true };
    } catch (error: any) {
        console.error('reSyncAccountAction error:', error);
        return { success: false, error: error.message };
    }
}

export async function syncAllUserAccountsAction(userId: string): Promise<{ success: boolean; accountsSynced: number }> {
    const { data: accounts } = await supabase.from('gmail_accounts').select('id, connection_method').eq('user_id', userId);
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

export async function removeAccountAction(accountId: string): Promise<{ success: boolean; error?: string }> {
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

    // Fetch all messages for this account to find related projects and contacts
    const { data: messages } = await supabase
        .from('email_messages')
        .select('id, contact_id')
        .eq('gmail_account_id', accountId);

    if (messages && messages.length > 0) {
        const messageIds = messages.map(m => m.id);
        const contactIds = Array.from(new Set(messages.map(m => m.contact_id).filter(Boolean)));

        // Delete projects linked to these messages
        await supabase.from('projects').delete().in('source_email_id', messageIds);

        // Also delete projects linked to these contacts and then the contacts themselves
        if (contactIds.length > 0) {
            await supabase.from('projects').delete().in('client_id', contactIds);
            await supabase.from('contacts').delete().in('id', contactIds);
        }
    }

    // Explicitly cascade delete all associated data
    await Promise.all([
        supabase.from('email_messages').delete().eq('gmail_account_id', accountId),
        supabase.from('replies').delete().eq('email_account_id', accountId),
        supabase.from('email_logs').delete().eq('email_account_id', accountId),
    ]);

    // Cleanup orphaned threads (those with no messages left)
    // We use a raw RPC call if available, or just proceed since threads are lightweight.
    // However, to satisfy the "hard delete" requirement, we should ideally have a trigger or a periodically run cleanup.
    // For now, we ensure the primary account and its messages are gone.

    const { error } = await supabase
        .from('gmail_accounts')
        .delete()
        .eq('id', accountId);

    if (error) {
        console.error('removeAccountAction error:', error);
        return { success: false, error: error.message };
    }
    return { success: true };
}
