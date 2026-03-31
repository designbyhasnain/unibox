import { NextResponse } from 'next/server';
import { validateAllAccounts } from '../../../../src/services/tokenRefreshService';

/**
 * GET /api/sync/health
 * Deep health check — validates every account can actually talk to Gmail.
 * Auto-recovers wrongly-marked ERROR accounts.
 */
export async function GET() {
    const result = await validateAllAccounts();
    return NextResponse.json({
        ...result,
        allHealthy: result.dead === 0,
        timestamp: new Date().toISOString(),
    });
}

export const maxDuration = 60;
