import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
    '/login',
    '/invite',
    '/api/auth/crm/google',
    '/api/auth/crm/google/callback',
    '/api/auth/google/callback',
    '/api/invite',
    '/favicon.ico',
    '/api/track',
    '/_next',
    '/api/webhooks',
    '/api/cron',
];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const isPublic = PUBLIC_PATHS.some(path => pathname.startsWith(path));
    if (isPublic) {
        return NextResponse.next();
    }

    const sessionToken = request.cookies.get('unibox_session')?.value;

    if (!sessionToken || !sessionToken.includes(':')) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        const response = NextResponse.redirect(loginUrl);
        if (sessionToken) response.cookies.delete('unibox_session');
        return response;
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
