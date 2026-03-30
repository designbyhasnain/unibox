import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { handleAuthCallback, validateOAuthState } from '../../../../../src/services/googleAuthService';
import { syncGmailEmails } from '../../../../../src/services/gmailSyncService';
import { getSession } from '../../../../../src/lib/auth';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
        return NextResponse.redirect(new URL('/accounts?error=no_code', request.url));
    }

    // IF this is a CRM Login attempt (prefixed with crm_), redirect to the CRM callback handler
    if (state?.startsWith('crm_')) {
        const crmCallbackUrl = new URL('/api/auth/crm/google/callback', request.url);
        crmCallbackUrl.search = request.nextUrl.search;
        return NextResponse.redirect(crmCallbackUrl);
    }

    // CSRF validation: compare the state parameter from the callback URL
    // against the state stored in the cookie before the OAuth redirect.
    const cookieStore = await cookies();
    const expectedState = cookieStore.get('oauth_state')?.value ?? null;

    if (!validateOAuthState(state, expectedState)) {
        return NextResponse.redirect(new URL('/accounts?error=invalid_state', request.url));
    }

    try {
        // Get userId from the authenticated session
        const session = await getSession();
        if (!session) {
            return NextResponse.redirect(new URL('/login?error=not_authenticated', request.url));
        }
        const userId = session.userId;

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
