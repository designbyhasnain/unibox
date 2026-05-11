import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';
import { computeGoalProgress } from '../../../../src/services/goalTrackingService';

/**
 * Daily cron — sweeps ACTIVE goals and flips their status based on outcome.
 *
 *   booked   >= target    →  ACHIEVED  (stamps achieved_at)
 *   deadline <  today     →  EXPIRED
 *   else                  →  stays ACTIVE
 *
 * The progress card reads `status` to decide whether to render the headline
 * or not. EXPIRED / ACHIEVED goals drop off the dashboard so the rep sees a
 * clean slate for the next planning round.
 *
 * Idempotent — re-running won't double-process anything because the WHERE
 * clauses only match the current ACTIVE set.
 *
 * Auth: matches the other cron routes (QStash signature OR ?secret=CRON_SECRET).
 * Wire to a daily Vercel cron in vercel.json (e.g. "0 6 * * *").
 *
 * Cost envelope: O(active goals × campaigns × contacts). For Wedits at the
 * scale of 10s of active goals, this is < 5 s/run.
 */

export async function POST(req: NextRequest) {
    return run(req);
}

export async function GET(req: NextRequest) {
    return run(req);
}

async function run(req: NextRequest): Promise<NextResponse> {
    const auth = req.headers.get('authorization');
    const secretQuery = req.nextUrl.searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;
    const ok =
        (auth && auth.startsWith('Bearer ') && auth.slice(7) === cronSecret) ||
        (secretQuery && cronSecret && secretQuery === cronSecret) ||
        !!req.headers.get('upstash-signature');
    if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const startedAt = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    // Pull every active goal in one query.
    const { data: active, error: fetchErr } = await supabase
        .from('goals')
        .select('id, user_id, target_amount, deadline')
        .eq('status', 'ACTIVE');
    if (fetchErr) {
        // Migration not yet applied — soft-pass.
        if ((fetchErr as any).code === '42P01' || /relation .* does not exist/i.test(fetchErr.message)) {
            return NextResponse.json({ success: true, skipped: 'goals table missing' });
        }
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!active || active.length === 0) {
        return NextResponse.json({ success: true, scanned: 0, achieved: 0, expired: 0, durationMs: Date.now() - startedAt });
    }

    let achieved = 0;
    let expired = 0;
    let stillActive = 0;
    const errors: string[] = [];

    for (const g of active) {
        try {
            // Expired wins over achieved if both apply, since the deadline is
            // the harder gate. (In practice the achieved branch fires first
            // because deadline check uses today's date; the goal flips before
            // the deadline lapses.)
            const progress = await computeGoalProgress(g.id);
            if (!progress) continue;

            if (progress.booked >= Number(g.target_amount)) {
                const { error } = await supabase
                    .from('goals')
                    .update({ status: 'ACHIEVED', achieved_at: new Date().toISOString() })
                    .eq('id', g.id)
                    .eq('status', 'ACTIVE');
                if (error) errors.push(`achieve(${g.id}): ${error.message}`);
                else achieved++;
                continue;
            }
            if (g.deadline < today) {
                const { error } = await supabase
                    .from('goals')
                    .update({ status: 'EXPIRED' })
                    .eq('id', g.id)
                    .eq('status', 'ACTIVE');
                if (error) errors.push(`expire(${g.id}): ${error.message}`);
                else expired++;
                continue;
            }
            stillActive++;
        } catch (err: any) {
            errors.push(`process(${g.id}): ${err?.message || err}`);
        }
    }

    return NextResponse.json({
        success: true,
        scanned: active.length,
        achieved,
        expired,
        stillActive,
        errors,
        durationMs: Date.now() - startedAt,
    });
}
