import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';
import {
    deriveLookalikeQueries,
    sourceLeads,
} from '../../../../src/services/leadSupplyService';

/**
 * Phase-C ambient lead supply — nightly cron.
 *
 * For every ACTIVE goal:
 *   1. derive 3 lookalike queries against the GOAL OWNER's top-paid
 *      clients (small batch — we run silently in the background;
 *      pre-fire flow uses bigger batches when the rep is watching).
 *   2. call sourceLeads() with a per-day cap; caller respects the
 *      external_api_usage ledger and quits the run cleanly the moment
 *      a cap is hit.
 *
 * Idempotent — running twice in a day just hits the cap on the second
 * pass and writes nothing. Safe to re-run.
 *
 * Auth: shared with the other crons (Bearer CRON_SECRET or
 * ?secret=CRON_SECRET, or any upstash-signature header).
 *
 * Wire via vercel.json: { path: "/api/cron/top-up-pool",
 *                         schedule: "30 6 * * *" }  (06:30 UTC daily).
 */

const QUERIES_PER_GOAL = 3;          // small batch — daily cap shared across all goals
const MAX_RUN_BUDGET_MS = 240_000;   // 4 min — well under Vercel's 5 min default

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest) { return run(req); }

async function run(req: NextRequest): Promise<NextResponse> {
    // ── Auth ───────────────────────────────────────────────────────────────
    const auth = req.headers.get('authorization');
    const secretQuery = req.nextUrl.searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;
    const ok =
        (auth && auth.startsWith('Bearer ') && auth.slice(7) === cronSecret) ||
        (secretQuery && cronSecret && secretQuery === cronSecret) ||
        !!req.headers.get('upstash-signature');
    if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const dryRun = req.nextUrl.searchParams.get('dry') === '1';
    const startedAt = Date.now();

    // Active goals: walk in batches so a never-completing run doesn't time
    // out. Limit query order by created_at so the oldest get serviced first.
    const { data: goals, error: goalsErr } = await supabase
        .from('goals')
        .select('id, user_id')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: true })
        .limit(50);
    if (goalsErr) {
        return NextResponse.json({ error: goalsErr.message }, { status: 500 });
    }
    if (!goals || goals.length === 0) {
        return NextResponse.json({ ok: true, processed: 0, message: 'no active goals' });
    }

    let totalAdded = 0;
    let totalSkipped = 0;
    let totalErrors: string[] = [];
    let capReached = false;
    let goalsProcessed = 0;

    for (const goal of goals) {
        if (capReached) break;
        if (Date.now() - startedAt > MAX_RUN_BUDGET_MS) {
            totalErrors.push(`budget exhausted after ${goalsProcessed} goals`);
            break;
        }
        try {
            const queries = await deriveLookalikeQueries(QUERIES_PER_GOAL);
            if (queries.length === 0) continue;

            const result = await sourceLeads(queries, {
                ownerUserId: goal.user_id as string,
                sourceTag: 'lookalike_google_auto',
                maxPerQuery: 10,        // smaller per-query cap for background run
                dryRun,
            });
            totalAdded += result.contactsAdded;
            totalSkipped += result.contactsSkipped;
            totalErrors.push(...result.errors);
            if (result.status === 'cap_reached') {
                capReached = true;
                break;
            }
        } catch (err: any) {
            totalErrors.push(`goal ${goal.id}: ${err?.message || err}`);
        }
        goalsProcessed++;
    }

    const summary = {
        ok: true,
        dryRun,
        goalsProcessed,
        contactsAdded: totalAdded,
        contactsSkipped: totalSkipped,
        capReached,
        errors: totalErrors.slice(0, 20),
        durationMs: Date.now() - startedAt,
    };
    console.log('[cron/top-up-pool]', JSON.stringify(summary));
    return NextResponse.json(summary);
}
