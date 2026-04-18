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

// Minimum seconds after sending before we count an open as real.
// Gmail/Outlook proxies pre-fetch images within ~60s of delivery.
const MIN_OPEN_DELAY_SECONDS = 120; // 2 minutes

/**
 * GET /api/track?t={trackingId}
 * Open tracking — sets opened_at only for real recipient opens (blue tick).
 *
 * How it works:
 * - Email providers (Gmail, Outlook, Yahoo) pre-fetch images within seconds
 *   of delivery. These are NOT real opens.
 * - We only count an open if it happens at least 2 minutes after the email
 *   was delivered. This filters out all proxy pre-fetches.
 * - The query uses delivered_at to check timing, so it's a single DB call.
 */
export async function GET(request: NextRequest) {
    const trackingId = request.nextUrl.searchParams.get('t');

    if (trackingId && /^[a-f0-9]{32}$/i.test(trackingId)) {
        const cutoff = new Date(Date.now() - MIN_OPEN_DELAY_SECONDS * 1000).toISOString();

        try {
            await supabase
                .from('email_messages')
                .update({ opened_at: new Date().toISOString() })
                .eq('tracking_id', trackingId)
                .is('opened_at', null)
                .lt('delivered_at', cutoff);
        } catch (e) {
            console.error('[Track] Failed to update opened_at:', e);
        }
    }

    return new NextResponse(PIXEL, { status: 200, headers: PIXEL_HEADERS });
}
