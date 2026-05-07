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
 * Inlines the extractor logic so we don't transitively import the
 * `server-only` chain via src/lib/supabase.ts (which throws at runtime in
 * pure Node). Keep the system prompt + Zod registry in lockstep with
 * src/services/insightsExtractor.ts when either changes.
 *
 * Idempotent — UPSERTs on (contact_id, fact_type), so it's safe to stop and
 * restart. Skips contacts that already have ANY contact_insights row unless
 * --force is passed.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

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

// ─── Fact registry (mirror of src/services/insightsExtractor.ts) ────────────

const ProjectTypeSchema = z.enum(['HIGHLIGHT','FULL_FILM','TRAILER','SOCIAL_CUT','RESTORATION','OTHER']);
const SourceChannelSchema = z.enum(['UPWORK','INSTAGRAM','REFERRAL','WEBSITE','COLD_OUTREACH','UNKNOWN']);
const OutcomeSchema = z.enum(['WON','LOST','GHOSTED','NOT_INTERESTED','STILL_OPEN']);

const FACT_REGISTRY = {
    wedding_date: z.object({ iso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    couple_names: z.object({ names: z.array(z.string().min(1)).min(1).max(4) }),
    location: z.object({
        city: z.string().min(1).optional(),
        region: z.string().min(1).optional(),
        country: z.string().min(2).optional(),
    }).refine(v => v.city || v.region || v.country, 'at least one of city/region/country'),
    project_type: z.object({ value: ProjectTypeSchema }),
    price_quoted: z.object({ usd: z.number().positive(), per: z.string().optional() }),
    source_channel: z.object({ value: SourceChannelSchema }),
    delivery_date: z.object({ iso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    outcome: z.object({ value: OutcomeSchema }),
} as const;
type FactType = keyof typeof FACT_REGISTRY;

const FactPayloadSchema = z.object({
    value: z.unknown(),
    confidence: z.number().min(0).max(1),
    source_message_index: z.number().int().min(0).max(4).nullable().optional(),
});
const ExtractionResponseSchema = z.object({
    wedding_date: FactPayloadSchema.nullable().optional(),
    couple_names: FactPayloadSchema.nullable().optional(),
    location: FactPayloadSchema.nullable().optional(),
    project_type: FactPayloadSchema.nullable().optional(),
    price_quoted: FactPayloadSchema.nullable().optional(),
    source_channel: FactPayloadSchema.nullable().optional(),
    delivery_date: FactPayloadSchema.nullable().optional(),
    outcome: FactPayloadSchema.nullable().optional(),
});

const MODEL = 'llama-3.1-8b-instant';
const MODEL_VERSION = 'groq-llama-3.1-8b@v1';
const CONFIDENCE_FLOOR = 0.4;
const MAX_BODY_CHARS = 1500;
const MAX_MESSAGES_PER_THREAD = 5;

const SYSTEM_PROMPT = `You are a fact extractor for a wedding-filmmaking CRM. Read the email thread and extract structured facts about the prospect/client conversation. Output STRICT JSON matching the schema below — no prose.

Rules:
- Only extract a fact if you find evidence in the messages. If unsure, OMIT the field (do not guess).
- "wedding_date" must be ISO YYYY-MM-DD. If only month/year given, use the 1st of the month with confidence ≤ 0.5.
- "couple_names" extracts the COUPLE / CLIENTS — not the sender (us). Names like "Alex & Sam", "Hi Mark and Jenny" → ["Mark","Jenny"].
- "location" — city > region > country, in that order. Lowercase or proper case both OK.
- "project_type" maps to one of: HIGHLIGHT (highlight reel), FULL_FILM (full ceremony/feature edit), TRAILER, SOCIAL_CUT (Instagram/TikTok cuts), RESTORATION (old footage), OTHER.
- "price_quoted" — only if a USD amount is mentioned in OUR outbound or theirs. Strip currency, return number.
- "source_channel" — UPWORK / INSTAGRAM / REFERRAL / WEBSITE / COLD_OUTREACH / UNKNOWN. Default UNKNOWN if no signal.
- "delivery_date" — date we shipped or said we'd ship the deliverable.
- "outcome" — WON if they paid / accepted / are a client; LOST if explicitly declined; GHOSTED if no reply >60 days after our last send; NOT_INTERESTED if they said so; STILL_OPEN otherwise.
- Each fact MUST include: { value, confidence (0-1), source_message_index (0-based, optional) }.
- If a fact's confidence < 0.4, OMIT it.

Output schema:
{
  "wedding_date":   { "value": { "iso": "YYYY-MM-DD" }, "confidence": 0.95 } | null,
  "couple_names":   { "value": { "names": ["Alex","Sam"] }, "confidence": 0.9 } | null,
  "location":       { "value": { "city": "Austin", "region": "TX", "country": "US" }, "confidence": 0.8 } | null,
  "project_type":   { "value": { "value": "HIGHLIGHT" }, "confidence": 0.9 } | null,
  "price_quoted":   { "value": { "usd": 850, "per": "package" }, "confidence": 0.85 } | null,
  "source_channel": { "value": { "value": "UPWORK" }, "confidence": 0.9 } | null,
  "delivery_date":  { "value": { "iso": "YYYY-MM-DD" }, "confidence": 0.7 } | null,
  "outcome":        { "value": { "value": "WON" }, "confidence": 0.85 } | null
}`;

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const args = parseArgs();
    if (args.dryRun && args.limit == null) args.limit = 50;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE env vars.');
    if (!process.env.GROQ_API_KEY) throw new Error('Missing GROQ_API_KEY.');
    const s = createClient(url, key, { auth: { persistSession: false } });

    // Load already-extracted contact_ids unless --force.
    const seenIds = new Set<string>();
    if (!args.force) {
        let off = 0;
        while (true) {
            const { data, error } = await s
                .from('contact_insights')
                .select('contact_id')
                .range(off, off + 999);
            if (error) throw error;
            if (!data || data.length === 0) break;
            for (const r of data) if (r.contact_id) seenIds.add(r.contact_id as string);
            if (data.length < 1000) break;
            off += 1000;
        }
        if (seenIds.size > 0) console.log(`Skipping ${seenIds.size} contacts already in contact_insights.`);
    }

    const wantLimit = args.limit ?? 100000;

    let q = s.from('contacts').select('id').order('id', { ascending: true });
    if (args.sinceContactId) q = q.gt('id', args.sinceContactId);
    q = q.limit(Math.min(wantLimit + seenIds.size, 50000));
    const { data: rawContacts, error } = await q;
    if (error) throw error;

    const contacts = (rawContacts ?? [])
        .filter(c => !seenIds.has(c.id as string))
        .slice(0, wantLimit);

    if (contacts.length === 0) {
        console.log('Nothing to do.');
        return;
    }
    console.log(`Will process ${contacts.length} contacts. dryRun=${args.dryRun}`);

    let processed = 0;
    let factsWritten = 0;
    let errors = 0;
    const startedAt = Date.now();

    for (const c of contacts) {
        const contactId = c.id as string;
        const r = await extractForContact(s, contactId);
        processed++;
        if (r.error) {
            errors++;
            if (args.dryRun) console.log(`  [${contactId}] ERROR ${r.error}`);
            continue;
        }
        if (args.dryRun) {
            for (const f of r.facts) {
                console.log(`  [${contactId}] ${f.factType}=${JSON.stringify(f.value)} conf=${f.confidence}`);
            }
            if (r.facts.length === 0) console.log(`  [${contactId}] (no facts)`);
            factsWritten += r.facts.length;
        } else {
            const written = await persist(s, contactId, r.facts);
            factsWritten += written;
        }
        if (processed % 25 === 0) {
            const elapsed = Math.round((Date.now() - startedAt) / 1000);
            console.log(`progress: ${processed}/${contacts.length}  facts=${factsWritten}  errors=${errors}  elapsed=${elapsed}s`);
        }
    }
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(`\ndone. processed=${processed} facts=${factsWritten} errors=${errors} elapsed=${elapsed}s${args.dryRun ? ' (dry-run — no DB writes)' : ''}`);
}

// ─── Per-contact extraction (inlined from insightsExtractor.ts) ─────────────

type Fact = { factType: FactType; value: any; confidence: number; sourceEmailId: string | null };

async function extractForContact(
    s: ReturnType<typeof createClient>,
    contactId: string,
): Promise<{ facts: Fact[]; error?: string }> {
    const { data: thread, error: threadErr } = await s
        .from('email_messages')
        .select('id, subject, body, snippet, direction, sent_at')
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false })
        .limit(MAX_MESSAGES_PER_THREAD);
    if (threadErr) return { facts: [], error: threadErr.message };
    if (!thread || thread.length === 0) return { facts: [], error: 'no messages' };
    const ordered = [...thread].reverse();

    const promptBody = ordered
        .map((m, i) => {
            const role = m.direction === 'SENT' ? '(US → them)' : '(them → US)';
            const date = m.sent_at ? new Date(m.sent_at as string).toISOString().slice(0, 10) : '';
            const subject = m.subject ? `Subject: ${m.subject}\n` : '';
            const body = ((m.body as string | null) || (m.snippet as string | null) || '').slice(0, MAX_BODY_CHARS);
            return `[message ${i}] ${role} ${date}\n${subject}${body}`;
        })
        .join('\n\n---\n\n');

    let json: unknown;
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.GROQ_API_KEY ?? ''}`,
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: promptBody },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.1,
                max_tokens: 600,
            }),
        });
        if (!res.ok) return { facts: [], error: `groq ${res.status}` };
        const wire = await res.json();
        const raw = wire?.choices?.[0]?.message?.content;
        if (!raw) return { facts: [], error: 'empty response' };
        json = JSON.parse(raw);
    } catch (err: any) {
        return { facts: [], error: `fetch/parse: ${err?.message || err}` };
    }

    const env = ExtractionResponseSchema.safeParse(json);
    if (!env.success) return { facts: [], error: 'schema-mismatch' };

    const facts: Fact[] = [];
    for (const factType of Object.keys(FACT_REGISTRY) as FactType[]) {
        const payload = env.data[factType];
        if (!payload) continue;
        if (payload.confidence < CONFIDENCE_FLOOR) continue;
        const valueParsed = FACT_REGISTRY[factType].safeParse(payload.value);
        if (!valueParsed.success) continue;
        const sourceEmailId =
            payload.source_message_index != null ? (ordered[payload.source_message_index]?.id as string | null) ?? null : null;
        facts.push({ factType, value: valueParsed.data, confidence: payload.confidence, sourceEmailId });
    }
    return { facts };
}

async function persist(
    s: ReturnType<typeof createClient>,
    contactId: string,
    facts: Fact[],
): Promise<number> {
    const stamp = new Date().toISOString();
    if (facts.length === 0) {
        await s
            .from('contact_insights')
            .upsert(
                [
                    {
                        contact_id: contactId,
                        fact_type: '_no_facts',
                        value: { reason: 'extractor returned no facts' },
                        confidence: 1,
                        source_email_id: null,
                        model_version: MODEL_VERSION,
                        extracted_at: stamp,
                    },
                ],
                { onConflict: 'contact_id,fact_type' }
            );
        return 0;
    }
    const rows = facts.map(f => ({
        contact_id: contactId,
        fact_type: f.factType,
        value: f.value,
        confidence: f.confidence,
        source_email_id: f.sourceEmailId,
        model_version: MODEL_VERSION,
        extracted_at: stamp,
    }));
    const { error } = await s.from('contact_insights').upsert(rows, { onConflict: 'contact_id,fact_type' });
    if (error) {
        console.warn(`  persist err [${contactId}]: ${error.message}`);
        return 0;
    }
    return rows.length;
}

main().catch(err => {
    console.error('FATAL', err);
    process.exit(1);
});
