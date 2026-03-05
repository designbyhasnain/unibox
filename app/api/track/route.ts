import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role to bypass RLS for tracking pixel requests
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 1x1 transparent PNG pixel
const PIXEL = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
);

export async function GET(request: NextRequest) {
    const trackingId = request.nextUrl.searchParams.get('t');

    if (trackingId) {
        const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
        const userAgent = request.headers.get('user-agent') || 'unknown';

        try {
            // 1. Log the tracking event
            await supabase.from('email_tracking_events').insert({
                tracking_id: trackingId,
                event_type: 'open',
                ip_address: ip,
                user_agent: userAgent,
            });

            // 2. Increment opens_count and update last_opened_at on the email
            await supabase.rpc('increment_email_opens', { p_tracking_id: trackingId });
        } catch (err) {
            console.error('[Tracking Pixel] Error:', err);
        }
    }

    // Always return the pixel image, even on error
    return new NextResponse(PIXEL, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
            'Content-Length': String(PIXEL.length),
            'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
        },
    });
}
