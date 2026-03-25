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

/**
 * Detect if the request is coming from within our own app (self-open).
 * Email clients and image proxies (Gmail, Outlook) do NOT send referer/origin headers.
 * Our app's iframe DOES send these headers since it's same-origin.
 */
function isSelfOpen(request: NextRequest): boolean {
    const referer = request.headers.get('referer') || '';
    const origin = request.headers.get('origin') || '';
    const secFetchSite = request.headers.get('sec-fetch-site') || '';

    // If sec-fetch-site is 'same-origin' or 'same-site', it's from our app
    if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
        return true;
    }

    // If referer or origin matches our app URL, it's from our app
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    if (appUrl && (referer.startsWith(appUrl) || origin.startsWith(appUrl))) {
        return true;
    }

    // Also check for localhost in development
    if (referer.includes('localhost') || origin.includes('localhost')) {
        return true;
    }

    return false;
}

/**
 * GET /api/track?t={trackingId}
 * Simple open tracking — sets opened_at on first load (blue tick).
 * Skips update if request is a self-open (from within the app).
 */
export async function GET(request: NextRequest) {
    const trackingId = request.nextUrl.searchParams.get('t');

    if (trackingId && /^[a-f0-9]{32}$/i.test(trackingId) && !isSelfOpen(request)) {
        // Only set opened_at if not already set (first open wins)
        void supabase
            .from('email_messages')
            .update({ opened_at: new Date().toISOString() })
            .eq('tracking_id', trackingId)
            .is('opened_at', null)
            .then(() => {});
    }

    return new NextResponse(PIXEL, { status: 200, headers: PIXEL_HEADERS });
}
