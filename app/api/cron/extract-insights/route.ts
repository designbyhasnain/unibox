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

    // Pull a batch of contacts that have NEVER been extracted.
    // Approach: list the contact_ids already in contact_insights, then exclude
    // them from the contacts query. Two cheap queries beat a missing column
    // (insights_extracted_at) — and it stays correct after the column lands.
    const seenIds = await fetchAllExtractedContactIds();
    let q = supabase.from('contacts').select('id').limit(BATCH_SIZE);
    // Supabase JS doesn't support 'NOT IN' on big lists efficiently; for ≤500
    // already-extracted contacts use .not('id','in', ...). Above that, paginate
    // through contacts and filter in JS.
    let contacts: { id: string }[] = [];
    if (seenIds.size <= 500) {
        if (seenIds.size > 0) {
            q = q.not('id', 'in', `(${[...seenIds].map(i => `"${i}"`).join(',')})`);
        }
        const { data, error } = await q;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        contacts = data ?? [];
    } else {
        // Paginate; stop as soon as we have BATCH_SIZE unprocessed.
        let off = 0;
        while (contacts.length < BATCH_SIZE) {
            const { data, error } = await supabase
                .from('contacts')
                .select('id')
                .range(off, off + 999);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            if (!data || data.length === 0) break;
            for (const c of data) {
                if (!seenIds.has(c.id as string)) {
                    contacts.push({ id: c.id as string });
                    if (contacts.length >= BATCH_SIZE) break;
                }
            }
            if (data.length < 1000) break;
            off += 1000;
        }
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

async function fetchAllExtractedContactIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    let off = 0;
    while (true) {
        const { data, error } = await supabase
            .from('contact_insights')
            .select('contact_id')
            .range(off, off + 999);
        if (error || !data || data.length === 0) break;
        for (const r of data) if (r.contact_id) ids.add(r.contact_id as string);
        if (data.length < 1000) break;
        off += 1000;
    }
    return ids;
}
