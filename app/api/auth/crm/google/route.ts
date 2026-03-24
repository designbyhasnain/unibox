import { NextRequest, NextResponse } from 'next/server';
import { generateOAuthState } from '../../../../../src/services/googleAuthService';
import { getCrmAuthUrl } from '../../../../../src/services/crmAuthService';

export async function GET(request: NextRequest) {
    const baseState = 'crm_' + generateOAuthState();
    const inviteToken = request.nextUrl.searchParams.get('invite_token');

    // Encode invite token in state so it survives the OAuth redirect (no cookie needed)
    const state = inviteToken ? `${baseState}.invite.${inviteToken}` : baseState;

    const url = getCrmAuthUrl(state);
    const response = NextResponse.redirect(url);

    response.cookies.set('crm_oauth_state', baseState, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        maxAge: 600,
        path: '/',
    });

    return response;
}
