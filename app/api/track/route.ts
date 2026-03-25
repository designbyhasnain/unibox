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
 * GET /api/track?t={trackingId}
 * Open tracking — sets opened_at on first load (blue tick).
 * Self-opens are prevented by stripping the pixel from the email body
 * before rendering in the app (see InboxComponents.tsx EmailBodyFrame).
 */
export async function GET(request: NextRequest) {
    const trackingId = request.nextUrl.searchParams.get('t');

    if (trackingId && /^[a-f0-9]{32}$/i.test(trackingId)) {
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
