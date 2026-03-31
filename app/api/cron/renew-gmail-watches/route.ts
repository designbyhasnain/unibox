import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { renewExpiringWatches } from '../../../../src/services/watchRenewalService';
import { qstashReceiver } from '../../../../lib/qstash';

/**
 * Renew Gmail Pub/Sub watches before their 7-day expiry.
 * Supports both POST (QStash) and GET (manual fallback) auth methods.
 */

// ── POST handler (QStash) ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const signature = request.headers.get('upstash-signature') ?? '';
    const body = await request.text();

    const isValid = await qstashReceiver.verify({ signature, body }).catch(() => false);
    if (!isValid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await renewExpiringWatches();
        console.warn('[WatchCron] Completed:', result);
        return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
    } catch (error: unknown) {
        console.error('[WatchCron] Fatal error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}

// ── GET handler (manual fallback) ────────────────────────────────────────────

export async function GET(request: NextRequest) {
    if (!process.env.CRON_SECRET) {
        console.error('[WatchCron] CRON_SECRET not configured');
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (!authHeader || authHeader.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await renewExpiringWatches();
        console.warn('[WatchCron] Completed:', result);
        return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
    } catch (error: unknown) {
        console.error('[WatchCron] Fatal error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}
