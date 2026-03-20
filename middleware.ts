import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
    '/login',
    '/api/auth/crm/google',
    '/api/auth/crm/google/callback',
    '/api/auth/google/callback',
    '/favicon.ico',
    '/api/track', // Email tracking should be public
    '/_next',
    '/api/webhooks', // Webhooks have their own auth
    '/api/cron', // Cron jobs triggered by external scheduler
];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Check if the path is public
    const isPublic = PUBLIC_PATHS.some(path => pathname.startsWith(path));
    if (isPublic) {
        return NextResponse.next();
    }

    // Check for session cookie — full validation happens in getSession() on server actions
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
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes) -> we handle them by individual checks or exclusions above
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
