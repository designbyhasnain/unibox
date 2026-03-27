import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ── IP Whitelist (hardcoded — no env dependency) ─────────────────────────────
const ALLOWED_IPS = [
    // Public IPs
    '111.88.8.27',
    '182.189.96.103',
    '202.47.33.132',
    // IPv6
    '2001:4860:7:622::fa',
    // LAN
    '192.168.18.27',
    '192.168.100.32',
    '192.168.100.40',
    // Localhost
    '127.0.0.1',
    '::1',
];

function getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0]?.trim() ?? '0.0.0.0';
    const realIP = request.headers.get('x-real-ip');
    if (realIP) return realIP.trim();
    return '0.0.0.0';
}

// ── Auth Public Paths (no session required) ──────────────────────────────────
const PUBLIC_PATHS = [
    '/login',
    '/invite',
];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // ── Step 1: IP Whitelist Check ───────────────────────────────────────────
    const clientIP = getClientIP(request);
    if (!ALLOWED_IPS.includes(clientIP)) {
        return new NextResponse(
            `<!DOCTYPE html><html><head><title>Access Denied</title></head>` +
            `<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a">` +
            `<div style="text-align:center"><h1 style="color:#e53e3e;font-size:2rem">403 — Access Denied</h1>` +
            `<p style="color:#888">Your IP (${clientIP}) is not authorized.</p></div></body></html>`,
            { status: 403, headers: { 'Content-Type': 'text/html' } }
        );
    }

    // ── Step 2: Auth Check ───────────────────────────────────────────────────
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
        '/((?!_next/static|_next/image|_next/data|favicon.ico|api/|.*\\..*).*)' ,
    ],
};
