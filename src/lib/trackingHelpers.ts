/**
 * Shared helpers for the three tracking API routes:
 *   - /api/track          (pixel open)
 *   - /api/track/click    (link click)
 *   - /api/track/session  (owner session registration)
 *
 * Consolidates duplicated IP extraction, rate limiting, owner filtering,
 * and tracking-ID validation into a single module.
 */
import { NextRequest } from 'next/server';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface TrackingContext {
    ip: string;
    userAgent: string;
    referer: string;
    ownerCookie: string | undefined;
    trackingId: string | null;
}

// ---------------------------------------------------------------------------
// Context extraction
// ---------------------------------------------------------------------------

/**
 * Extracts tracking-relevant fields from a Next.js request in one place.
 * IP is resolved from x-forwarded-for → x-real-ip → 'unknown'.
 */
export function extractTrackingContext(request: NextRequest): TrackingContext {
    const rawIp =
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'unknown';
    const ip = rawIp.split(',')[0]?.trim() || 'unknown';

    return {
        ip,
        userAgent: request.headers.get('user-agent') || 'unknown',
        referer: request.headers.get('referer') || '',
        ownerCookie: request.cookies.get('__unibox_owner')?.value,
        trackingId: request.nextUrl.searchParams.get('t'),
    };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Returns true when the tracking ID is a valid 32-char lowercase/uppercase hex string. */
export function validateTrackingId(id: string | null | undefined): id is string {
    if (!id || id === 'null') return false;
    return /^[a-f0-9]{32}$/i.test(id);
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the given IP has generated more than 20 tracking events
 * in the last 60 seconds — meaning the caller should drop the event.
 */
export async function checkRateLimit(ip: string): Promise<boolean> {
    const { count: recentCount } = await supabase
        .from('email_tracking_events')
        .select('*', { count: 'exact', head: true })
        .eq('ip_address', ip)
        .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString());

    return (recentCount ?? 0) > 20;
}

// ---------------------------------------------------------------------------
// Owner / self-open filtering
// ---------------------------------------------------------------------------

/**
 * Determines whether a tracking event should be skipped because it
 * originates from the CRM owner.
 *
 * Checks (in order):
 *   1. Referer starts with NEXT_PUBLIC_APP_URL  → skip
 *   2. Owner cookie is set                      → skip
 *   3. Owner session exists for IP in last 24h  → skip
 */
export async function shouldSkipAsOwner(
    ctx: TrackingContext,
): Promise<{ skip: boolean; reason: string }> {
    // 1. Referer matches CRM
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    if (ctx.referer && ctx.referer.startsWith(appUrl)) {
        return { skip: true, reason: 'Referer: CRM UI' };
    }

    // 2. Owner cookie
    if (ctx.ownerCookie === '1') {
        return { skip: true, reason: 'Owner Cookie' };
    }

    // 3. Owner session in DB
    const { data: ownerSession } = await supabase
        .from('email_tracking_events')
        .select('id')
        .eq('ip_address', ctx.ip)
        .eq('event_type', 'owner_session')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();

    if (ownerSession) {
        return { skip: true, reason: 'Owner Session' };
    }

    return { skip: false, reason: '' };
}
