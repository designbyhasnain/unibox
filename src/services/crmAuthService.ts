import 'server-only';
import { google } from 'googleapis';
import { supabase } from '../lib/supabase';

// For CRM login, we only need userinfo scopes
const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
];

function getRedirectUri(): string {
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

export function getCrmAuthUrl(state: string): string {
    const oauth2Client = createOAuth2Client();
    return oauth2Client.generateAuthUrl({
        access_type: 'online', // No need for offline access for just logging in
        scope: SCOPES,
        state,
    });
}

export async function verifyCrmAuth(code: string): Promise<{ email: string; name: string; avatar?: string } | null> {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    if (!userInfo.email) return null;

    return {
        email: userInfo.email,
        name: userInfo.name || (userInfo.email ? userInfo.email.split('@')[0] : 'User') || 'User',
        avatar: userInfo.picture || undefined,
    };
}

/**
 * Checks if a user exists in our whitelist (users table).
 * In a real app, this might check for an "active" status or specific role.
 */
export async function getWhitelistedUser(email: string) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

    if (error || !data) return null;
    return data;
}
