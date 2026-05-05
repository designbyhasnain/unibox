#!/usr/bin/env tsx
/**
 * One-shot backfill for the email intelligence layer.
 *
 * Usage:
 *   tsx scripts/backfill-insights.ts --dry-run                   # 50 sample contacts, no DB writes
 *   tsx scripts/backfill-insights.ts --limit 500                 # process 500
 *   tsx scripts/backfill-insights.ts --since-contact-id <uuid>   # resume after a specific id
 *   tsx scripts/backfill-insights.ts                             # everything (slow; ~$5 over 100k)
 *
 * Idempotent — re-running upserts on (contact_id, fact_type), so it's safe to
 * stop and restart. Skip contacts whose `insights_extracted_at` is already set
 * unless `--force` is passed.
 *
 * Cost: ~$0.00005 per contact via Groq llama-3.1-8b. Logs progress every 50.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { extractInsightsForContact, persistExtraction } from '../src/services/insightsExtractor';

type Args = {
    dryRun: boolean;
    force: boolean;
    limit: number | null;
    sinceContactId: string | null;
};

function parseArgs(): Args {
    const argv = process.argv.slice(2);
    const args: Args = { dryRun: false, force: false, limit: null, sinceContactId: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run') args.dryRun = true;
        else if (a === '--force') args.force = true;
        else if (a === '--limit') args.limit = parseInt(argv[++i] ?? '0', 10) || null;
        else if (a === '--since-contact-id') args.sinceContactId = argv[++i] ?? null;
    }
    return args;
}

async function main() {
    const args = parseArgs();
    if (args.dryRun && args.limit == null) args.limit = 50;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SERVICE_ROLE_KEY in env.');
    const s = createClient(url, key, { auth: { persistSession: false } });

    let q = s.from('contacts').select('id', { count: 'estimated' }).order('id', { ascending: true });
    if (!args.force) q = q.is('insights_extracted_at', null);
    if (args.sinceContactId) q = q.gt('id', args.sinceContactId);
    if (args.limit) q = q.limit(args.limit);

    const { data: contacts, error } = await q;
    if (error) throw error;
    if (!contacts || contacts.length === 0) {
        console.log('Nothing to do — every contact has insights_extracted_at set. Use --force to re-extract.');
        return;
    }

    console.log(`Will process ${contacts.length} contacts. dryRun=${args.dryRun}`);

    let processed = 0;
    let factsWritten = 0;
    let errors = 0;
    const startedAt = Date.now();

    for (const c of contacts) {
        const r = await extractInsightsForContact(c.id as string);
        processed++;
        if (r.error) {
            errors++;
        } else if (!args.dryRun) {
            const p = await persistExtraction(r);
            factsWritten += p.written;
            if (p.error) errors++;
        } else if (args.dryRun) {
            // Dry-run: print what would have been written.
            for (const f of r.facts) {
                console.log(`  [${c.id}] ${f.factType}=${JSON.stringify(f.value)} conf=${f.confidence}`);
            }
            factsWritten += r.facts.length;
        }
        if (processed % 50 === 0) {
            const elapsed = Math.round((Date.now() - startedAt) / 1000);
            console.log(`progress: ${processed}/${contacts.length}  facts=${factsWritten}  errors=${errors}  elapsed=${elapsed}s`);
        }
    }

    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(
        `\ndone. processed=${processed} facts=${factsWritten} errors=${errors} elapsed=${elapsed}s${
            args.dryRun ? ' (dry-run — no DB writes)' : ''
        }`
    );
}

main().catch(err => {
    console.error('FATAL', err);
    process.exit(1);
});
