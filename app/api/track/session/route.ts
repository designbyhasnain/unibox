import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/track/session
 * Called by the CRM frontend on page load to register the owner's IP address.
 * This IP is then used by the tracking pixel to filter out self-opens.
 * Ultra-lightweight — no heavy DB operations.
 */
export async function POST(request: NextRequest) {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    try {
        // Register this IP as an owner session (fire-and-forget)
        await supabase.from('email_tracking_events').insert({
            tracking_id: 'owner_session',
            event_type: 'owner_session',
            ip_address: ip,
            user_agent: request.headers.get('user-agent') || 'CRM',
        });
    } catch {
        // Non-critical — silently ignore
    }

    return NextResponse.json({ ok: true }, { status: 200 });
}
