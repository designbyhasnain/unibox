import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PIXEL = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
);

const PIXEL_HEADERS = {
    'Content-Type': 'image/png',
    'Content-Length': String(PIXEL.length),
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
};

// Email providers that pre-fetch/proxy images on delivery (NOT a real open)
const IMAGE_PROXY_PATTERNS = [
    'GoogleImageProxy',
    'YahooMailProxy',
    'Outlook-iOS-Android',
    'Microsoft Office',
    'Windows-RSS-Platform',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Googlebot',
];

/**
 * GET /api/track?t={trackingId}
 * Open tracking — sets opened_at on first real recipient open (blue tick).
 *
 * Skips:
 * - Gmail/Yahoo/Outlook image proxies (pre-fetch on delivery, not a real open)
 * - Self-opens are handled client-side by stripping pixel from rendered HTML
 */
export async function GET(request: NextRequest) {
    const trackingId = request.nextUrl.searchParams.get('t');
    const userAgent = request.headers.get('user-agent') || '';

    // Skip image proxy pre-fetches — these happen on delivery, not when recipient opens
    const isProxy = IMAGE_PROXY_PATTERNS.some(p => userAgent.includes(p));

    if (trackingId && /^[a-f0-9]{32}$/i.test(trackingId) && !isProxy) {
        // Only set opened_at if not already set (first real open wins)
        void supabase
            .from('email_messages')
            .update({ opened_at: new Date().toISOString() })
            .eq('tracking_id', trackingId)
            .is('opened_at', null)
            .then(() => {});
    }

    return new NextResponse(PIXEL, { status: 200, headers: PIXEL_HEADERS });
}
