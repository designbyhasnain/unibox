import { NextRequest, NextResponse } from 'next/server';
import { runAllAutomations } from '../../../../src/services/salesAutomationService';
import { resetDailySendCounts, incrementWarmupDays } from '../../../../src/services/accountRotationService';
import { updateAllAccountHealth } from '../../../../src/services/accountHealthService';

export async function GET(request: NextRequest) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Run all automations in parallel
        const [automations, healthResult] = await Promise.all([
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

        return NextResponse.json({
            success: true,
            automations,
            health: {
                accountsChecked: healthResult.updated,
                accountsPaused: healthResult.paused.length,
            },
        });
    } catch (error: any) {
        console.error('[Cron:Automations] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
