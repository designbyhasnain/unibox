import { NextResponse } from 'next/server';
import { getSession } from '../../../../src/lib/auth';
import { getStats } from '../../../../src/lib/perfMonitor';

/**
 * GET /api/perf/stats
 * Returns p50/p95/max + recent samples per tracked route. Admin-only.
 */
export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (session.role !== 'ADMIN' && session.role !== 'ACCOUNT_MANAGER') {
        return NextResponse.json({ error: 'admin only' }, { status: 403 });
    }
    return NextResponse.json({ stats: getStats() });
}
