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

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const referer = request.headers.get('referer') || '';

    if (trackingId) {
        // Fire-and-forget processing
        processClickEvent(trackingId, ip, userAgent, referer, url).catch(err => {
            console.error('[Link Tracking] Background Error:', err);
        });
    }

    // Redirect user to the actual URL immediately — zero lag
    return NextResponse.redirect(url);
}

async function processClickEvent(trackingId: string, ip: string, userAgent: string, referer: string, linkUrl: string) {
    try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        if (referer && referer.startsWith(appUrl)) {
            return;
        }

        const { data: ownerSessions } = await supabase
            .from('email_tracking_events')
            .select('id')
            .eq('ip_address', ip)
            .eq('event_type', 'owner_session')
            .gte('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
            .limit(1)
            .maybeSingle();

        if (ownerSessions) {
            console.log(`[Click Tracking] Skipped: Owner Click (${ip})`);
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
