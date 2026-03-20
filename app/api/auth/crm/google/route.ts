import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateOAuthState } from '../../../../../src/services/googleAuthService';
import { getCrmAuthUrl } from '../../../../../src/services/crmAuthService';

export async function GET(request: NextRequest) {
    const state = generateOAuthState();
    const inviteToken = request.nextUrl.searchParams.get('invite_token');

    const cookieStore = await cookies();
    cookieStore.set('crm_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
    });

    // Store invite token if present
    if (inviteToken) {
        cookieStore.set('invite_token', inviteToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 600,
            path: '/',
        });
    }

    const url = getCrmAuthUrl(state);
    return NextResponse.redirect(url);
}
