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

    // Redirect to original URL — but only if it passes the safety checks
    // below. Without these, /api/track/click was an open redirect (phishing
    // vector: an attacker could host
    //   https://txb-unibox.vercel.app/api/track/click?url=https://evil.example/
    // and trick a user who trusts the txb-unibox.vercel.app domain).
    if (url) {
        try {
            const decoded = decodeURIComponent(url);
            const target = new URL(decoded);

            // Only http/https schemes — reject data:, javascript:, file:, etc.
            if (target.protocol !== 'http:' && target.protocol !== 'https:') {
                return NextResponse.redirect(new URL('/', request.url), 302);
            }

            // Reject local-network / loopback / link-local destinations to
            // prevent server-side request smuggling and intra-network
            // recon via the click endpoint.
            const host = target.hostname.toLowerCase();
            const isPrivate =
                host === 'localhost' ||
                host === '127.0.0.1' ||
                host === '::1' ||
                host === '0.0.0.0' ||
                host.startsWith('10.') ||
                host.startsWith('192.168.') ||
                host.startsWith('169.254.') ||      // link-local
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
                host.endsWith('.local') ||
                host.endsWith('.internal');
            if (isPrivate) {
                return NextResponse.redirect(new URL('/', request.url), 302);
            }

            // Optional explicit allowlist via TRACK_CLICK_DOMAIN_ALLOWLIST
            // (comma-separated). When set, only redirects to those exact
            // host suffixes are permitted. Leave unset to allow any
            // public domain (default — needed for cold-outreach links).
            const allowlist = process.env.TRACK_CLICK_DOMAIN_ALLOWLIST?.trim();
            if (allowlist) {
                const allowed = allowlist.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
                const matchesSuffix = allowed.some(d => host === d || host.endsWith('.' + d));
                if (!matchesSuffix) {
                    return NextResponse.redirect(new URL('/', request.url), 302);
                }
            }

            return NextResponse.redirect(target.toString(), 302);
        } catch {
            // URL constructor threw or decoding failed — fall through to home redirect.
        }
    }

    // Fallback: redirect to app home
    return NextResponse.redirect(new URL('/', request.url), 302);
}
