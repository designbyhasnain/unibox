import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { processWebhookEvents } from '../../../../src/services/webhookProcessorService';

/**
 * GET /api/cron/process-webhooks
 * Vercel Cron — runs every 2 minutes to process queued webhook events.
 */
export async function GET(request: NextRequest) {
    if (!process.env.CRON_SECRET) {
        console.error('[WebhookCron] CRON_SECRET not configured');
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
