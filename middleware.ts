import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ── IP Whitelist (hardcoded — no env dependency) ─────────────────────────────
// Exact IPs
const ALLOWED_IPS = [
    '5.31.225.102',
    '111.88.9.3',
    '111.88.8.27',
    '182.189.96.103',
    '202.47.33.132',
    '192.168.100.215',
    '192.168.100.22',
    '192.168.100.32',
    '192.168.100.40',
    '192.168.18.27',
    '127.0.0.1',
    '::1',
];

// IP prefixes — matches any IP starting with these (covers ISP range + mobile 5G)
const ALLOWED_PREFIXES = [
    '111.88.',       // PTCL / Stormfiber
    '182.189.',      // PTCL range
    '202.47.',       // Pakistan range
    '39.32.',        // Jazz 4G/5G
    '39.33.',        // Jazz 4G/5G
    '39.34.',        // Jazz 4G/5G
    '39.35.',        // Jazz 4G/5G
    '39.36.',        // Jazz 4G/5G
    '39.37.',        // Jazz 4G/5G
    '39.40.',        // Jazz 4G/5G
    '39.41.',        // Jazz 4G/5G
    '39.42.',        // Jazz 4G/5G
    '39.43.',        // Jazz 4G/5G
    '39.44.',        // Jazz 4G/5G
    '39.45.',        // Jazz 4G/5G
    '39.46.',        // Jazz 4G/5G
    '39.47.',        // Jazz 4G/5G
    '39.48.',        // Jazz 4G/5G
    '39.49.',        // Jazz 4G/5G
    '39.50.',        // Jazz 4G/5G
    '39.51.',        // Jazz 4G/5G
    '39.52.',        // Jazz 4G/5G
    '39.53.',        // Jazz 4G/5G
    '39.54.',        // Jazz 4G/5G
    '39.55.',        // Jazz 4G/5G
    '39.56.',        // Jazz 4G/5G
    '39.57.',        // Jazz 4G/5G
    '39.58.',        // Jazz 4G/5G
    '39.59.',        // Jazz 4G/5G
    '39.60.',        // Jazz 4G/5G
    '39.61.',        // Jazz 4G/5G
    '5.31.',         // Current ISP
    '59.103.',       // PTCL mobile
    '119.73.',       // Zong
    '119.160.',      // Telenor PK
    '175.107.',      // Nayatel
    '192.168.',      // All LAN
    '2406:d00:',     // Pakistan IPv6
    '2400:adc1:',    // Pakistan IPv6
    '2001:4860:',    // Google IPv6
];

function isAllowedIP(ip: string): boolean {
    if (ALLOWED_IPS.includes(ip)) return true;
    return ALLOWED_PREFIXES.some(prefix => ip.startsWith(prefix));
}

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
    if (!isAllowedIP(clientIP)) {
        return new NextResponse(
            `<!DOCTYPE html><html><head><title>Access Denied</title></head>` +
            `<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a">` +
            `<div style="text-align:center"><h1 style="color:#e53e3e;font-size:2rem">403 — Access Denied</h1>` +
            `<p style="color:#888">Your IP is not authorized.</p></div></body></html>`,
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

    // Validate session token is actually decryptable and not expired
    // (lightweight check: verify the IV is valid hex and ciphertext is non-empty)
    const parts = sessionToken.split(':');
    const ivHex = parts[0] ?? '';
    const cipherHex = parts[1] ?? '';
    if (
        ivHex.length !== 32 ||           // AES IV = 16 bytes = 32 hex chars
        !/^[0-9a-f]+$/i.test(ivHex) ||   // Must be valid hex
        cipherHex.length < 16 ||          // Ciphertext must be non-trivial
        !/^[0-9a-f]+$/i.test(cipherHex)   // Must be valid hex
    ) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        const response = NextResponse.redirect(loginUrl);
        response.cookies.delete('unibox_session');
        return response;
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|_next/data|favicon.ico|api/|.*\\..*).*)' ,
    ],
};
