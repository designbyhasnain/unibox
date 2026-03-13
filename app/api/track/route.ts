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

export async function GET(request: NextRequest) {
    const trackingId = request.nextUrl.searchParams.get('t');
    
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const referer = request.headers.get('referer') || '';

    if (trackingId) {
        processTrackingEvent(trackingId, ip, userAgent, referer).catch(err => {
            console.error('[Track] Background Error:', err);
        });
    }

    return new NextResponse(PIXEL, { status: 200, headers: PIXEL_HEADERS });
}

async function processTrackingEvent(trackingId: string, ip: string, userAgent: string, referer: string) {
    try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const isLocalhost = ip === '::1' || ip === '127.0.0.1';

        // 1. Referer Check: Skip if opening from within the CRM UI
        if (referer && referer.startsWith(appUrl)) {
            console.log(`[Track] SKIP (Referer: CRM UI) | ID: ${trackingId} | IP: ${ip}`);
            return;
        }

        // 2. Owner Session Check: Skip if this IP is a registered owner
        const { data: ownerSession } = await supabase
            .from('email_tracking_events')
            .select('id')
            .eq('ip_address', ip)
            .eq('event_type', 'owner_session')
            .gte('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
            .limit(1)
            .maybeSingle();

        if (ownerSession) {
            // Testing Exception: Allow the first ever open from localhost even if it's the owner
            if (isLocalhost && !referer) {
                const { count } = await supabase
                    .from('email_tracking_events')
                    .select('id', { count: 'exact', head: true })
                    .eq('tracking_id', trackingId)
                    .eq('event_type', 'open');
                
                if ((count || 0) > 0) {
                    console.log(`[Track] SKIP (Owner Session) | ID: ${trackingId} | IP: ${ip}`);
                    return;
                }
                console.log(`[Track] TEST ALLOW (First Open) | ID: ${trackingId} | IP: ${ip}`);
            } else {
                console.log(`[Track] SKIP (Owner Session) | ID: ${trackingId} | IP: ${ip}`);
                return;
            }
        }

        // 3. Record the Open
        console.log(`[Track] RECORDING OPEN | ID: ${trackingId} | IP: ${ip}`);
        
        await Promise.all([
            // Log the event
            supabase.from('email_tracking_events').insert({
                tracking_id: trackingId,
                event_type: 'open',
                ip_address: ip,
                user_agent: userAgent,
            }),
            // Increment the counter (triggers Realtime)
            supabase.rpc('increment_email_opens', { p_tracking_id: trackingId })
        ]);
    } catch (err) {
        console.error('[Track] Fatal Error:', err);
    }
}
