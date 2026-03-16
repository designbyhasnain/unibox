import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';
import {
    extractTrackingContext,
    validateTrackingId,
    checkRateLimit,
    shouldSkipAsOwner,
} from '../../../../src/lib/trackingHelpers';

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    // Validate URL scheme to prevent open redirect via javascript:, data:, or other dangerous URIs
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        return NextResponse.redirect(new URL('/', request.url));
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    const ctx = extractTrackingContext(request);

    if (validateTrackingId(ctx.trackingId)) {
        try {
            await processClickEvent(ctx, url);
        } catch (err) {
            console.error('[Link Tracking] Error:', err);
        }
    }

    // Redirect user to the actual URL
    return NextResponse.redirect(url);
}

async function processClickEvent(ctx: ReturnType<typeof extractTrackingContext>, linkUrl: string) {
    try {
        const { trackingId, ip, userAgent } = ctx;
        if (!validateTrackingId(trackingId)) return;

        // Owner / self-open filtering (uses NEXT_PUBLIC_APP_URL, cookie, and DB session)
        const owner = await shouldSkipAsOwner(ctx);
        if (owner.skip) {
            console.log(`[Click Tracking] Skipped: ${owner.reason} (${ip})`);
            return;
        }

        // Rate limiting
        if (await checkRateLimit(ip)) {
            console.log(`[Click Tracking] Rate limited: ${ip}`);
            return;
        }

        // Deduplication: existing click on same link from same IP within 1 hour
        const { data: existingClick } = await supabase
            .from('email_tracking_events')
            .select('id')
            .eq('tracking_id', trackingId)
            .eq('ip_address', ip)
            .eq('event_type', 'click')
            .eq('link_url', linkUrl)
            .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
            .limit(1)
            .maybeSingle();

        if (existingClick) {
            console.log(`[Click Tracking] Skipped: Duplicate click within 1h (${ip})`);
            return;
        }

        console.log(`[Click Tracking] Recording Click: ID ${trackingId} for ${linkUrl}`);

        await Promise.all([
            supabase.from('email_tracking_events').insert({
                tracking_id: trackingId,
                event_type: 'click',
                ip_address: ip,
                user_agent: userAgent,
                link_url: linkUrl,
            }),
            supabase.rpc('increment_email_clicks', { p_tracking_id: trackingId })
        ]);
    } catch (err) {
        console.error('[Click Tracking] Process Error:', err);
    }
}
