import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { processABAutoPromotes } from '../../../../src/services/abTestPromoteService';
import { qstashReceiver } from '../../../../lib/qstash';

/**
 * A/B Auto-Promote — runs hourly via QStash (or Vercel Cron fallback).
 *
 * For each campaign step with multiple variants:
 *   - Compute open rate per variant from campaign_emails JOIN email_messages.
 *   - If one variant has been beating the other by ≥8pp open rate AND each
 *     variant has ≥100 sends AND the step has been running ≥48h, set the
 *     winner's `weight` to 100 and the loser's to 0.
 *   - Write an A_B_AUTO_PROMOTE row to activity_logs.
 *
 * Cron schedule (from scripts/setup-qstash-schedules.ts when added):
 *   `0 * * * *`  hourly
 *
 * Audit ref: docs/UNIBOX-AUDIT-PHASE6-2026-05-01.md Innovation Lead #1.
 */

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
            console.error('[ABAutoPromoteCron] QStash signature verification FAILED');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        const result = await processABAutoPromotes();
        return NextResponse.json({ success: true, ...result });
    } catch (error: unknown) {
        console.error('[ABAutoPromoteCron] Fatal error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}

// ── GET handler (Vercel Cron / manual fallback) ──────────────────────────────

export async function GET(request: NextRequest) {
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (!authHeader || authHeader.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await processABAutoPromotes();
        return NextResponse.json({ success: true, ...result });
    } catch (error: unknown) {
        console.error('[ABAutoPromoteCron] Fatal error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}
