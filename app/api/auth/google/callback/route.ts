import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { handleAuthCallback, validateOAuthState } from '../../../../../src/services/googleAuthService';
import { syncGmailEmails } from '../../../../../src/services/gmailSyncService';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
        return NextResponse.redirect(new URL('/accounts?error=no_code', request.url));
    }

    // CSRF validation: compare the state parameter from the callback URL
    // against the state stored in the cookie before the OAuth redirect.
    const cookieStore = await cookies();
    const expectedState = cookieStore.get('oauth_state')?.value ?? null;

    if (!validateOAuthState(state, expectedState)) {
        console.error('[OAuth Callback] State mismatch — possible CSRF attack.');
        return NextResponse.redirect(new URL('/accounts?error=invalid_state', request.url));
    }

    try {
        // TODO: This needs proper auth — the userId should come from the authenticated
        // session (e.g., NextAuth getServerSession) or be passed via the OAuth `state`
        // parameter with CSRF validation. Using env var as a short-term workaround.
        const userId = process.env.DEFAULT_USER_ID || "1ca1464d-1009-426e-96d5-8c5e8c84faac";
        const account = await handleAuthCallback(code, userId);

        // Trigger initial sync (asynchronously)
        syncGmailEmails(account.id).catch((err: any) => {
            console.error(`Sync failed for ${account.email}:`, err);
        });

        // Clear the OAuth state cookie after successful validation
        const response = NextResponse.redirect(new URL('/accounts?success=oauth_connected', request.url));
        response.cookies.delete('oauth_state');
        return response;
    } catch (error: any) {
        console.error('OAuth Callback Error:', error?.message || error);
        return NextResponse.redirect(new URL('/accounts?error=auth_failed', request.url));
    }
}
