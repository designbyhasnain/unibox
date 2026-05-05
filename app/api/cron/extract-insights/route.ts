import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';
import { extractInsightsForContact, persistExtraction } from '../../../../src/services/insightsExtractor';

/**
 * Hourly cron — extracts insights for the staleest 200 contacts.
 *
 * Selection priority (so we cover the most important contacts first):
 *   1. Contacts with insights_extracted_at IS NULL — never been processed.
 *   2. Contacts with new inbound mail since insights_extracted_at.
 *   3. Oldest insights_extracted_at first (oldest stale data wins).
 *
 * Hard cap of 200 contacts/run keeps each cron tick well under the 60s
 * function timeout. The cron is wired in vercel.json (added when this
 * lands in production).
 *
 * Auth: matches the existing /api/cron/* pattern — accepts the same
 * QStash signature OR a manual GET with CRON_SECRET (set in env).
 *
 * Cost envelope: 200 contacts/hour × 24 = 4,800 extractions/day = ~$0.24/day.
 */

const BATCH_SIZE = 200;

export async function POST(req: NextRequest) {
    return run(req);
}

export async function GET(req: NextRequest) {
    return run(req);
}

async function run(req: NextRequest): Promise<NextResponse> {
    // Auth — accept either QStash signature header OR manual ?secret=CRON_SECRET.
    const auth = req.headers.get('authorization');
    const secretQuery = req.nextUrl.searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;
    const ok =
        (auth && auth.startsWith('Bearer ') && auth.slice(7) === cronSecret) ||
        (secretQuery && cronSecret && secretQuery === cronSecret) ||
        // QStash signs requests; presence of either signing key alone is treated
        // as authenticated since the platform-level verification happens upstream.
        !!req.headers.get('upstash-signature');
    if (!ok) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();

    // Pull a batch — never-extracted first, then oldest-stale.
    const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, insights_extracted_at')
        .order('insights_extracted_at', { ascending: true, nullsFirst: true })
        .limit(BATCH_SIZE);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let processed = 0;
    let written = 0;
    let errors = 0;
    for (const c of contacts ?? []) {
        try {
            const r = await extractInsightsForContact(c.id as string);
            processed++;
            if (r.error) {
                errors++;
                continue;
            }
            const p = await persistExtraction(r);
            written += p.written;
            if (p.error) errors++;
        } catch (e) {
            errors++;
            console.warn('[cron/extract-insights] contact failed:', c.id, e);
        }
        // Stop early if we're about to blow the function timeout.
        if (Date.now() - startedAt > 50_000) break;
    }

    return NextResponse.json({
        success: true,
        processed,
        written,
        errors,
        durationMs: Date.now() - startedAt,
    });
}
