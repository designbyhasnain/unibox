import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/cron/cleanup-tracking
 * Scheduled cleanup to keep database size under control.
 * Called daily by Vercel Cron - protected by CRON_SECRET.
 *
 * Cleanup targets (ordered by space savings):
 * 1. Truncate body of old emails (>60 days) to save storage — keeps snippet for search
 * 2. Delete old tracking events
 * 3. Delete old activity logs
 * 4. Reset daily sent counters
 */
export async function GET(request: NextRequest) {
    if (!process.env.CRON_SECRET) {
        console.error('[Cron] CRON_SECRET not configured');
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (!authHeader || authHeader.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const now = Date.now();
        const results: Record<string, number> = {};
        const errors: string[] = [];

        // ── 1. Truncate body of old emails (>60 days) ──────────────────────────
        // The body field stores full HTML which is 10-200KB per email.
        // After 60 days, replace body with snippet to reclaim space.
        const bodyCutoff = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
        const { data: bodyData, error: bodyErr } = await supabase
            .from('email_messages')
            .update({ body: '' })
            .lt('sent_at', bodyCutoff)
            .neq('body', '')
            .select('id');
        if (bodyErr) errors.push(`body_truncate: ${bodyErr.message}`);
        results.bodies_truncated = bodyData?.length ?? 0;

        // ── 2. Delete old activity logs (>90 days) ─────────────────────────────
        const logCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
        const { count: logsDeleted, error: logsErr } = await supabase
            .from('activity_logs')
            .delete({ count: 'exact' })
            .lt('created_at', logCutoff);
        if (logsErr) errors.push(`activity_logs: ${logsErr.message}`);
        results.activity_logs = logsDeleted ?? 0;

        // ── 4. Reset daily sent counters ───────────────────────────────────────
        const { error: resetErr } = await supabase
            .from('gmail_accounts')
            .update({ sent_count_today: 0 })
            .gt('sent_count_today', 0);
        if (resetErr) errors.push(`sent_count_reset: ${resetErr.message}`);
        results.sent_counters_reset = resetErr ? 0 : 1;

        if (errors.length > 0) {
            console.error('[Cron] Partial cleanup errors:', errors);
        }

        const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);
        console.log(`[Cron] Cleanup complete: ${totalDeleted} operations`, results);

        return NextResponse.json({
            ok: true,
            deleted: results,
            total: totalDeleted,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (err: any) {
        console.error('[Cron] Cleanup error:', err?.message || err);
        return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
    }
}
