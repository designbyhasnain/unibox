import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { renewExpiringWatches } from '../../../../src/services/watchRenewalService';

/**
 * GET /api/cron/renew-gmail-watches
 * Vercel Cron — runs every 6 days at 3 AM to renew Gmail Pub/Sub watches
 * before their 7-day expiry.
 */
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

        return NextResponse.json({
            success: true,
            ...result,
            timestamp: new Date().toISOString(),
        });
    } catch (error: unknown) {
        console.error('[WatchCron] Fatal error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}
