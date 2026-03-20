import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateOAuthState } from '../../../../../../src/services/googleAuthService';
import { verifyCrmAuth, getWhitelistedUser } from '../../../../../../src/services/crmAuthService';
import { createSession } from '../../../../../../src/lib/auth';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    const expectedState = (await cookies()).get('crm_oauth_state')?.value;

    console.log('[CRM Auth] state:', state, 'expectedState:', expectedState, 'code exists:', !!code);

    // 1. Validate state
    if (!validateOAuthState(state, expectedState || null)) {
        console.error('[CRM Auth] State validation failed. state:', state, 'expected:', expectedState);
        return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
    }

    // Cleanup state cookie
    (await cookies()).delete('crm_oauth_state');

    if (!code) {
        console.error('[CRM Auth] No code in callback');
        return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
    }

    try {
        // 2. Verify Google Token and get user info
        const googleUser = await verifyCrmAuth(code);
        console.log('[CRM Auth] Google user:', googleUser?.email);
        if (!googleUser || !googleUser.email) {
            console.error('[CRM Auth] Could not get Google user info');
            return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
        }

        // 3. Check whitelist
        const user = await getWhitelistedUser(googleUser.email);
        if (!user) {
            console.error('[CRM Auth] User not whitelisted:', googleUser.email);
            return NextResponse.redirect(new URL('/login?error=unauthorized', request.url));
        }

        // 4. Create Session
        await createSession({
            id: user.id,
            email: user.email,
            name: user.name || googleUser.name,
            role: user.role || 'ADMIN'
        });

        console.log('[CRM Auth] Login successful for:', user.email);
        // 5. Redirect to dashboard
        return NextResponse.redirect(new URL('/', request.url));
    } catch (error) {
        console.error('[CRM Auth Callback] Error:', error);
        return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
    }
}
