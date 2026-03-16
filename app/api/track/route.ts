import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../src/lib/supabase';
import { isGoogleProxy } from '../../../src/utils/botDetection';
import {
    extractTrackingContext,
    validateTrackingId,
    checkRateLimit,
    shouldSkipAsOwner,
} from '../../../src/lib/trackingHelpers';

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

async function processTrackingEvent(ctx: ReturnType<typeof extractTrackingContext>) {
    try {
        const { trackingId, ip, userAgent } = ctx;
        if (!validateTrackingId(trackingId)) return;

        // Rate limiting
        if (await checkRateLimit(ip)) {
            console.log(`[Track] RATE LIMITED | IP: ${ip}`);
            return;
        }

        // Google Image Proxy — log but don't count as real open
        if (isGoogleProxy(userAgent)) {
            await supabase.from('email_tracking_events').insert({
                tracking_id: trackingId,
                event_type: 'proxy_open',
                ip_address: ip,
                user_agent: userAgent,
            });
            console.log(`[Track] Proxy open logged (not counted) | ID: ${trackingId}`);
            return;
        }

        // Owner / self-open filtering
        const owner = await shouldSkipAsOwner(ctx);
        if (owner.skip) {
            console.log(`[Track] SKIP (${owner.reason}) | ID: ${trackingId}`);
            return;
        }

        // Deduplication: existing open from same IP within 1 hour
        const { data: existingOpen } = await supabase
            .from('email_tracking_events')
            .select('id')
            .eq('tracking_id', trackingId)
            .eq('ip_address', ip)
            .eq('event_type', 'open')
            .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
            .limit(1)
            .maybeSingle();

        if (existingOpen) {
            console.log(`[Track] SKIP (Duplicate open within 1h) | ID: ${trackingId} | IP: ${ip}`);
            return;
        }

        console.log(`[Track] Recording open | ID: ${trackingId}`);

        await Promise.all([
            supabase.from('email_tracking_events').insert({
                tracking_id: trackingId,
                event_type: 'open',
                ip_address: ip,
                user_agent: userAgent,
            }),
            supabase.rpc('increment_email_opens', { p_tracking_id: trackingId }),
            supabase.from('email_messages').update({ last_opened_at: new Date().toISOString() }).eq('tracking_id', trackingId),
        ]);
    } catch (err: any) {
        console.error('[Track] Fatal Error in processTrackingEvent:', err?.message || err);
    }
}

export async function GET(request: NextRequest) {
    const ctx = extractTrackingContext(request);

    if (validateTrackingId(ctx.trackingId)) {
        await processTrackingEvent(ctx).catch((err: any) => {
            console.error('[Track] Background Error:', err?.message || err);
        });
    }

    return new NextResponse(PIXEL, { status: 200, headers: PIXEL_HEADERS });
}
