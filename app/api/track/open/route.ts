import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';

/**
 * GET /api/track/open?tid={trackingId}
 * 
 * Logs an email open event and returns a transparent 1x1 GIF.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const trackingId = searchParams.get('tid');

    if (trackingId) {
        // Log the event asynchronously
        const ip = req.headers.get('x-forwarded-for') || (req as any).ip;
        const ua = req.headers.get('user-agent');

        try {
            // 1. Find the message by trackingId
            const { data: message } = await supabase
                .from('email_messages')
                .select('id, open_count')
                .eq('tracking_id', trackingId)
                .maybeSingle();

            if (message) {
                // 2. Update stats
                await supabase
                    .from('email_messages')
                    .update({
                        opened_at: new Date().toISOString(),
                        open_count: (message.open_count || 0) + 1
                    })
                    .eq('id', message.id);

                // 3. Record event history
                await supabase.from('tracking_events').insert({
                    message_id: message.id,
                    type: 'OPEN',
                    ip_address: ip,
                    user_agent: ua,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('[Tracking] Open log error:', error);
        }
    }

    // Return 1x1 transparent GIF
    const pixel = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64'
    );

    return new NextResponse(pixel, {
        headers: {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        },
    });
}
