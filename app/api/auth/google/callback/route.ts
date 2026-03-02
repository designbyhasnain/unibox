import { NextRequest, NextResponse } from 'next/server';
import { handleAuthCallback } from '../../../../../src/services/googleAuthService';
import { syncGmailEmails } from '../../../../../src/services/gmailSyncService';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // Could be used for CSRF or passing data

    if (!code) {
        return NextResponse.redirect(new URL('/accounts?error=no_code', request.url));
    }

    try {
        const userId = "1ca1464d-1009-426e-96d5-8c5e8c84faac"; // Valid UUID for Admin user
        const account = await handleAuthCallback(code, userId);

        // Trigger initial sync (asynchronously)
        syncGmailEmails(account.id).catch((err: any) => {
            console.error(`Sync failed for ${account.email}:`, err);
        });

        return NextResponse.redirect(new URL('/accounts?success=oauth_connected', request.url));
    } catch (error: any) {
        console.error('OAuth Callback Error:', error);
        return NextResponse.redirect(new URL(`/accounts?error=${encodeURIComponent(error.message)}`, request.url));
    }
}
