import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { processWebhookEvents } from '../../../../src/services/webhookProcessorService';
import { qstashReceiver } from '../../../../lib/qstash';

/**
 * Webhook event processor — runs every 10 minutes via QStash.
 * Changed from 2min to 10min to reduce CPU usage (webhooks are already
 * handled in real-time by Pub/Sub push; this is only for retrying failures).
 * Supports both POST (QStash) and GET (Vercel Cron / manual) auth methods.
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
            console.error('[WebhookCron] QStash signature verification FAILED');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        const result = await processWebhookEvents();
        return NextResponse.json({ success: true, ...result });
    } catch (error: unknown) {
        console.error('[WebhookCron] Fatal error:', error);
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
        const result = await processWebhookEvents();
        return NextResponse.json({ success: true, ...result });
    } catch (error: unknown) {
        console.error('[WebhookCron] Fatal error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}
