import { NextRequest, NextResponse } from 'next/server';
import { generateOAuthState } from '../../../../../src/services/googleAuthService';
import { getCrmAuthUrl } from '../../../../../src/services/crmAuthService';

export async function GET(request: NextRequest) {
    const state = 'crm_' + generateOAuthState();
    const inviteToken = request.nextUrl.searchParams.get('invite_token');

    const url = getCrmAuthUrl(state);
    const response = NextResponse.redirect(url);

    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        maxAge: 600,
        path: '/',
    };

    response.cookies.set('crm_oauth_state', state, cookieOptions);

    if (inviteToken) {
        response.cookies.set('invite_token', inviteToken, cookieOptions);
    }

    return response;
}
