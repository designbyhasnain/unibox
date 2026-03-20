import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
// Freshly recreated file to force Turbopack cache refresh
import { getCrmAuthUrl } from '../../../../../src/services/crmAuthService';
import { generateOAuthState } from '../../../../../src/services/googleAuthService';

export async function GET() {
    const state = `crm_${generateOAuthState()}`;
    
    (await cookies()).set('crm_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 10, // 10 minutes
        path: '/'
    });

    const url = getCrmAuthUrl(state);
    return NextResponse.redirect(url);
}
