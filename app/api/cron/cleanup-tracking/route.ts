import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/cron/cleanup-tracking
 * Scheduled cleanup of old email tracking events.
 * Called by Vercel Cron - protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
    // Ensure CRON_SECRET is configured
    if (!process.env.CRON_SECRET) {
        console.error('[Cron] CRON_SECRET not configured');
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    // Verify the request is from Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const now = Date.now();
        const results: Record<string, number> = {};

        const errors: string[] = [];

        // 1. Delete owner_session events older than 7 days
        const ownerCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count: ownerDeleted, error: ownerErr } = await supabase
            .from('email_tracking_events')
            .delete({ count: 'exact' })
            .eq('event_type', 'owner_session')
            .lt('created_at', ownerCutoff);
        if (ownerErr) errors.push(`owner_session: ${ownerErr.message}`);
        results.owner_sessions = ownerDeleted ?? 0;

        // 2. Delete proxy_open events older than 30 days (diagnostic data, not needed long-term)
        const proxyCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count: proxyDeleted, error: proxyErr } = await supabase
            .from('email_tracking_events')
            .delete({ count: 'exact' })
            .eq('event_type', 'proxy_open')
            .lt('created_at', proxyCutoff);
        if (proxyErr) errors.push(`proxy_open: ${proxyErr.message}`);
        results.proxy_opens = proxyDeleted ?? 0;

        // 3. Delete open/click events older than 90 days
        const eventCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
        const { count: opensDeleted, error: opensErr } = await supabase
            .from('email_tracking_events')
            .delete({ count: 'exact' })
            .eq('event_type', 'open')
            .lt('created_at', eventCutoff);
        if (opensErr) errors.push(`open: ${opensErr.message}`);
        results.opens = opensDeleted ?? 0;

        const { count: clicksDeleted, error: clicksErr } = await supabase
            .from('email_tracking_events')
            .delete({ count: 'exact' })
            .eq('event_type', 'click')
            .lt('created_at', eventCutoff);
        if (clicksErr) errors.push(`click: ${clicksErr.message}`);
        results.clicks = clicksDeleted ?? 0;

        if (errors.length > 0) {
            console.error('[Cron] Partial cleanup errors:', errors);
        }

        const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);
        console.log(`[Cron] Tracking cleanup: deleted ${totalDeleted} events`, results);

        return NextResponse.json({
            ok: true,
            deleted: results,
            total: totalDeleted,
        });
    } catch (err: any) {
        console.error('[Cron] Tracking cleanup error:', err?.message || err);
        return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
    }
}
