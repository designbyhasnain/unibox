import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { qstashReceiver } from '../../../../lib/qstash';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Scheduled cleanup to keep database size under control.
 * Supports both POST (QStash) and GET (manual fallback) auth methods.
 *
 * Cleanup targets (ordered by space savings):
 * 1. Truncate body of old emails (>60 days) to save storage
 * 2. Delete old activity logs
 * 3. Reset daily sent counters
 */

async function runCleanup() {
    const now = Date.now();
    const results: Record<string, number> = {};
    const errors: string[] = [];

    // ── 1. Truncate body of old emails (>60 days) ──────────────────────────
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

    // ── 3. Reset daily sent counters ───────────────────────────────────────
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

    return {
        ok: true,
        deleted: results,
        total: totalDeleted,
        errors: errors.length > 0 ? errors : undefined,
    };
}

// ── POST handler (QStash) ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const signature = request.headers.get('upstash-signature');
    const rawBody = await request.text();

    const isDebug = process.env.NODE_ENV === 'development' ||
        request.headers.get('x-debug-key') === process.env.CRON_SECRET;

    if (!isDebug) {
        const isValid = await qstashReceiver.verify({
            signature: signature ?? '',
            body: rawBody,
        }).catch(() => false);

        if (!isValid) {
            console.error('[Cron] QStash signature verification FAILED');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        const result = await runCleanup();
        return NextResponse.json(result);
    } catch (err: any) {
        console.error('[Cron] Cleanup error:', err?.message || err);
        return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
    }
}

// ── GET handler (manual fallback) ────────────────────────────────────────────

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
        const result = await runCleanup();
        return NextResponse.json(result);
    } catch (err: any) {
        console.error('[Cron] Cleanup error:', err?.message || err);
        return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
    }
}
