import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
    const trackingId = request.nextUrl.searchParams.get('t');
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    if (trackingId) {
        const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
        const userAgent = request.headers.get('user-agent') || 'unknown';

        try {
            // 1. Log the click event
            await supabase.from('email_tracking_events').insert({
                tracking_id: trackingId,
                event_type: 'click',
                ip_address: ip,
                user_agent: userAgent,
                link_url: url,
            });

            // 2. Increment clicks_count
            await supabase.rpc('increment_email_clicks', { p_tracking_id: trackingId });
        } catch (err) {
            console.error('[Link Tracking] Error:', err);
        }
    }

    // Redirect user to the actual URL
    return NextResponse.redirect(url);
}
