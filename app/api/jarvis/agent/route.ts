import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../src/lib/auth';
import { runAgentSync } from '../../../../src/services/jarvisAgentService';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { goal } = await req.json();
    if (!goal?.trim()) return NextResponse.json({ error: 'Goal is required' }, { status: 400 });

    try {
        console.log('[Jarvis Agent] Starting goal:', goal);
        const result = await runAgentSync(goal);
        console.log('[Jarvis Agent] Completed:', result.plan.filter(s => s.status === 'DONE').length, '/', result.plan.length, 'steps');
        return NextResponse.json(result);
    } catch (err) {
        console.error('[Jarvis Agent] Error:', err);
        return NextResponse.json({ error: 'Agent execution failed', detail: String(err) }, { status: 500 });
    }
}
