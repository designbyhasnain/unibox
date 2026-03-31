import { NextRequest, NextResponse } from 'next/server';
import { runAllAutomations } from '../../../../src/services/salesAutomationService';
import { resetDailySendCounts, incrementWarmupDays } from '../../../../src/services/accountRotationService';
import { updateAllAccountHealth } from '../../../../src/services/accountHealthService';
import { refreshAllTokens } from '../../../../src/services/tokenRefreshService';
import { qstashReceiver } from '../../../../lib/qstash';

/**
 * Automations cron — runs hourly via QStash.
 * Token refresh, sales automations, account health, and daily resets.
 * Supports both POST (QStash) and GET (manual fallback) auth methods.
 */

async function runAutomations() {
    // Run token refresh + automations + health check in parallel
    const [tokenResult, automations, healthResult] = await Promise.all([
        refreshAllTokens(),
        runAllAutomations(),
        updateAllAccountHealth(),
    ]);

    // Reset daily send counts and increment warmup (run at midnight)
    const hour = new Date().getUTCHours();
    if (hour < 2) {
        await Promise.all([
            resetDailySendCounts(),
            incrementWarmupDays(),
        ]);
    }

    return {
        success: true,
        tokens: tokenResult,
        automations,
        health: {
            accountsChecked: healthResult.updated,
            accountsPaused: healthResult.paused.length,
        },
    };
}

// ── POST handler (QStash) ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const signature = request.headers.get('upstash-signature') ?? '';
    const body = await request.text();

    const isValid = await qstashReceiver.verify({ signature, body }).catch(() => false);
    if (!isValid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await runAutomations();
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[Cron:Automations] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ── GET handler (manual fallback) ────────────────────────────────────────────

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await runAutomations();
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[Cron:Automations] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
