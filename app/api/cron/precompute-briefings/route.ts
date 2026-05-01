import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { precomputeAllBriefings } from '../../../../src/services/precomputeBriefingsService';
import { qstashReceiver } from '../../../../lib/qstash';

/**
 * Hourly pre-compute of Jarvis daily briefings for every active user.
 * Pre-populates the user_briefings table so the dashboard reads ~50ms
 * cached data instead of waiting for Groq (~5s) on every render.
 *
 * Schedule (in scripts/setup-qstash-schedules.ts): '0 * * * *'.
 *
 * Phase 10 lockdown #2 — closes ARCH-17 (dashboard sluggishness).
 */

export const maxDuration = 60;

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
            console.error('[PrecomputeBriefingsCron] QStash signature verification FAILED');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        const result = await precomputeAllBriefings();
        return NextResponse.json({ success: true, ...result });
    } catch (error: unknown) {
        console.error('[PrecomputeBriefingsCron] Fatal error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}

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
        const result = await precomputeAllBriefings();
        return NextResponse.json({ success: true, ...result });
    } catch (error: unknown) {
        console.error('[PrecomputeBriefingsCron] Fatal error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}
