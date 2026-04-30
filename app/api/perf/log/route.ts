import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../src/lib/auth';
import { recordSample } from '../../../../src/lib/perfMonitor';

/**
 * POST /api/perf/log
 * Body: { route, totalMs, ttfbMs?, lcpMs? }
 *
 * Authenticated-only — staff users post their own page-load timings.
 * No PII is stored beyond the route + user-agent string. Samples are kept
 * in an in-memory ring buffer (src/lib/perfMonitor.ts) and exposed via
 * /api/perf/stats for the /data-health admin view.
 */
export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    let body: { route?: string; totalMs?: number; ttfbMs?: number; lcpMs?: number };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'invalid body' }, { status: 400 });
    }

    const route = typeof body.route === 'string' ? body.route : '';
    const totalMs = typeof body.totalMs === 'number' && Number.isFinite(body.totalMs) ? body.totalMs : 0;
    if (!route || totalMs <= 0 || totalMs > 60_000) {
        // Reject obviously invalid data so a single bad client can't poison
        // the percentile calc.
        return NextResponse.json({ ok: true, dropped: true });
    }

    recordSample({
        route,
        totalMs,
        ttfbMs: typeof body.ttfbMs === 'number' ? body.ttfbMs : undefined,
        lcpMs: typeof body.lcpMs === 'number' ? body.lcpMs : undefined,
        userAgent: request.headers.get('user-agent')?.slice(0, 200) || '',
        at: Date.now(),
    });

    return NextResponse.json({ ok: true });
}
