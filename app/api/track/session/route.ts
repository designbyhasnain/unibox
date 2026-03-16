import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';
import { extractTrackingContext } from '../../../../src/lib/trackingHelpers';

/**
 * POST /api/track/session
 * Called by the CRM frontend on page load to register the owner's IP address.
 * This IP is then used by the tracking pixel to filter out self-opens.
 */
export async function POST(request: NextRequest) {
    const { ip, userAgent } = extractTrackingContext(request);

    try {
        // Check if a recent owner session already exists for this IP (within last 24 hours)
        const { data: existing } = await supabase
            .from('email_tracking_events')
            .select('id')
            .eq('ip_address', ip)
            .eq('event_type', 'owner_session')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1)
            .maybeSingle();

        // Only insert if no recent session exists to prevent unbounded table growth
        if (!existing) {
            await supabase.from('email_tracking_events').insert({
                tracking_id: 'owner_session',
                event_type: 'owner_session',
                ip_address: ip,
                user_agent: userAgent,
            });
        }

        // Probabilistic cleanup: ~2% chance per request, delete owner_session events older than 7 days
        if (Math.random() < 0.02) {
            const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            await supabase
                .from('email_tracking_events')
                .delete()
                .eq('event_type', 'owner_session')
                .lt('created_at', cutoff);
        }
    } catch {
        // Non-critical — silently ignore
    }

    const response = NextResponse.json({ ok: true }, { status: 200 });
    response.cookies.set('__unibox_owner', '1', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/track',
        maxAge: 86400,
    });
    return response;
}
