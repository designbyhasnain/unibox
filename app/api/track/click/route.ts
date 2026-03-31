import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';

/**
 * GET /api/track/click?t=trackingId&url=originalUrl
 * Records click event and redirects to original URL.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const trackingId = searchParams.get('t');
    const url = searchParams.get('url');

    // Record click if we have a tracking ID
    if (trackingId) {
        try {
            await supabase
                .from('email_messages')
                .update({ clicked_at: new Date().toISOString() })
                .eq('tracking_id', trackingId)
                .is('clicked_at', null); // Only record first click
        } catch (e) {
            // Don't block redirect on tracking failure
        }
    }

    // Redirect to original URL
    if (url) {
        try {
            const decoded = decodeURIComponent(url);
            // Basic URL validation
            if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
                return NextResponse.redirect(decoded, 302);
            }
        } catch (e) {
            // Invalid URL
        }
    }

    // Fallback: redirect to app home
    return NextResponse.redirect(new URL('/', request.url), 302);
}
