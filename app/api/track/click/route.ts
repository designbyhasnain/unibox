import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';

/**
 * GET /api/track/click?tid={trackingId}&url={base64EncodedUrl}
 * 
 * Logs a link click event and redirects the user to their destination.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const trackingId = searchParams.get('tid');
    const encodedUrl = searchParams.get('url');

    let destination = '/';
    if (encodedUrl) {
        try {
            destination = Buffer.from(encodedUrl, 'base64').toString('utf-8');
        } catch (e) {
            console.error('[Tracking] Failed to decode click URL', e);
        }
    }

    if (trackingId) {
        const ip = req.headers.get('x-forwarded-for') || (req as any).ip;
        const ua = req.headers.get('user-agent');

        try {
            const { data: message } = await supabase
                .from('email_messages')
                .select('id')
                .eq('tracking_id', trackingId)
                .maybeSingle();

            if (message) {
                // Update clickedAt
                await supabase
                    .from('email_messages')
                    .update({ clicked_at: new Date().toISOString() })
                    .eq('id', message.id);

                // Record click event
                await supabase.from('tracking_events').insert({
                    message_id: message.id,
                    type: 'CLICK',
                    ip_address: ip,
                    user_agent: ua,
                    timestamp: new Date().toISOString(),
                    metadata: { destination }
                });
            }
        } catch (error) {
            console.error('[Tracking] Click log error:', error);
        }
    }

    return NextResponse.redirect(destination);
}
