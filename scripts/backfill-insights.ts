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
    /** Process heavily-emailed contacts (≥30 emails or is_client) first. */
    priority: boolean;
    /** Process exactly one contact (used to verify the Josh-Loseke fix). */
    contactId: string | null;
};

function parseArgs(): Args {
    const argv = process.argv.slice(2);
    const args: Args = { dryRun: false, force: false, limit: null, sinceContactId: null, priority: false, contactId: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run') args.dryRun = true;
        else if (a === '--force') args.force = true;
        else if (a === '--limit') args.limit = parseInt(argv[++i] ?? '0', 10) || null;
        else if (a === '--since-contact-id') args.sinceContactId = argv[++i] ?? null;
        else if (a === '--priority') args.priority = true;
        else if (a === '--contact-id') args.contactId = argv[++i] ?? null;
    }
    return args;
}

// ─── Fact registry (mirror of src/services/insightsExtractor.ts) ────────────

const ProjectTypeSchema = z.enum(['HIGHLIGHT','FULL_FILM','TRAILER','SOCIAL_CUT','RESTORATION','OTHER']);
const SourceChannelSchema = z.enum(['UPWORK','INSTAGRAM','REFERRAL','WEBSITE','COLD_OUTREACH','UNKNOWN']);
const OutcomeSchema = z.enum(['WON','LOST','GHOSTED','NOT_INTERESTED','STILL_OPEN']);
const PipelineStageSchema = z.enum(['COLD_LEAD','CONTACTED','WARM_LEAD','LEAD','OFFER_ACCEPTED','CLOSED','NOT_INTERESTED']);
const IntentSchema = z.enum(['WEDDING_PROSPECT','PAID_CLIENT_ACTIVE','EDITOR_RECRUITER_INBOUND','PEER_NETWORKING','VENDOR_OR_TOOL_PITCH','AUTOMATED_NOTIFICATION','SPAM_OR_NOT_INTERESTED','UNCLEAR']);
const NextActionTypeSchema = z.enum(['SEND_REPLY','SEND_FOLLOWUP','SCHEDULE_CALL','SEND_QUOTE','SEND_DELIVERABLE','WAIT_AND_REMIND_LATER','STOP_OUTREACH','NO_ACTION_NEEDED']);

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
    inferred_stage: z.object({
        stage: PipelineStageSchema,
        reason: z.string().min(2).max(200),
    }),
    coach_next_action: z.object({
        intent: IntentSchema,
        situation: z.string().min(8).max(300),
        blockers: z.array(z.string().min(2).max(160)).max(5),
        next_action: z.object({
            type: NextActionTypeSchema,
            timing: z.string().min(2).max(60),
            message_to_send: z.string().max(800).nullable(),
            anchor_price_usd: z.number().nullable(),
            notes: z.string().max(200).nullable(),
        }),
        red_flags: z.array(z.string().min(2).max(200)).max(6),
    }),
} as const;
type FactType = keyof typeof FACT_REGISTRY;

const FactPayloadSchema = z.object({
    value: z.unknown(),
    confidence: z.number().min(0).max(1),
    // Allow indices up to MAX_MESSAGES_PER_THREAD - 1 (the LLM picks one of
    // the messages we sent it as the source of the fact).
    source_message_index: z.number().int().min(0).max(11).nullable().optional(),
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
    inferred_stage: FactPayloadSchema.nullable().optional(),
    coach_next_action: FactPayloadSchema.nullable().optional(),
});

const MODEL = 'llama-3.1-8b-instant';
// MUST match src/services/insightsExtractor.ts. Bump together when the
// envelope changes — the cron uses MODEL_VERSION to decide whether a
// contact's existing rows are stale.
const MODEL_VERSION = 'groq-llama-3.1-8b@v2';
const CONFIDENCE_FLOOR = 0.4;
const MAX_BODY_CHARS = 4000;
const MAX_MESSAGES_PER_THREAD = 12;

function stripBoilerplate(s: string): string {
    if (!s) return '';
    let out = s;
    out = out.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
    out = out.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
    out = out.replace(/<\/?(?:br|p|div|tr|li|h[1-6])\b[^>]*>/gi, '\n');
    out = out.replace(/<[^>]+>/g, ' ');
    out = out
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&[a-z]+;/gi, ' ');
    out = out.replace(/mailtrack-[a-z0-9-]+[^\s]*/gi, ' ');
    out = out.replace(/\n+On\s+\w+,?\s+\w+\s+\d+,?\s+\d{4}[^\n]{0,80}wrote:[\s\S]*$/i, '');
    out = out.replace(/\n+-+\s*Original Message\s*-+[\s\S]*$/i, '');
    out = out.replace(/\n+From:\s+[^\n]+\n+Sent:\s+[^\n]+\n+To:\s+[\s\S]*$/i, '');
    out = out.replace(/^\s*>\s*.*$/gm, '');
    out = out.replace(/[ \t]+/g, ' ');
    out = out.replace(/\n{3,}/g, '\n\n');
    return out.trim();
}

function smartTruncate(s: string, max: number): string {
    if (s.length <= max) return s;
    const half = Math.floor(max / 2) - 6;
    return s.slice(0, half) + '\n[...]\n' + s.slice(-half);
}

const SYSTEM_PROMPT = `You are the head of sales for a wedding-filmmaking CRM. Read the email thread and extract structured facts AND a coach output. Output STRICT JSON — no prose.

Rules — extracted facts (only if evidence is in the messages):
- "wedding_date" ISO YYYY-MM-DD. If only month/year, use 1st of month with confidence ≤ 0.5.
- "couple_names" the COUPLE / CLIENTS, not the sender (us).
- "location" city > region > country.
- "project_type" HIGHLIGHT | FULL_FILM | TRAILER | SOCIAL_CUT | RESTORATION | OTHER.
- "price_quoted" USD number when a price is mentioned.
- "source_channel" UPWORK | INSTAGRAM | REFERRAL | WEBSITE | COLD_OUTREACH | UNKNOWN.
- "delivery_date" date we shipped the deliverable.
- "outcome" WON/LOST/GHOSTED/NOT_INTERESTED/STILL_OPEN.

Rules — coach output (ALWAYS produce both when there's a thread):
- "inferred_stage" — what pipeline_stage the conversation actually warrants today, ignoring the DB:
    COLD_LEAD: never replied / no inbound from them
    CONTACTED: we sent something, they have not engaged
    WARM_LEAD: replied with interest, no quote yet
    LEAD: a quote / scope / proposal is on the table
    OFFER_ACCEPTED: accepted price/scope verbally; deposit not yet paid
    CLOSED: money on file OR a deliverable shipped
    NOT_INTERESTED: explicit decline / >60d ghosting / they're a peer / vendor / recruiter
- "coach_next_action" — the rep-facing playbook:
    intent: WEDDING_PROSPECT | PAID_CLIENT_ACTIVE | EDITOR_RECRUITER_INBOUND | PEER_NETWORKING | VENDOR_OR_TOOL_PITCH | AUTOMATED_NOTIFICATION | SPAM_OR_NOT_INTERESTED | UNCLEAR
    situation: ONE tight sentence (≤30 words).
    blockers: array of strings.
    next_action: { type, timing, message_to_send, anchor_price_usd, notes }
      type: SEND_REPLY | SEND_FOLLOWUP | SCHEDULE_CALL | SEND_QUOTE | SEND_DELIVERABLE | WAIT_AND_REMIND_LATER | STOP_OUTREACH | NO_ACTION_NEEDED
      message_to_send: ready-to-send 2-4 sentence reply for SEND_* types, otherwise null. Match tone, never fabricate.
      anchor_price_usd: number when SEND_QUOTE, otherwise null.
    red_flags: array of data-quality issues spotted.

- Each fact MUST include { value, confidence (0-1), source_message_index (optional) }.
- Omit Tier-1 facts with confidence < 0.4. Always emit inferred_stage and coach_next_action when a thread exists.

Output schema:
{
  "wedding_date":   { "value": { "iso": "YYYY-MM-DD" }, "confidence": 0.95 } | null,
  "couple_names":   { "value": { "names": ["Alex","Sam"] }, "confidence": 0.9 } | null,
  "location":       { "value": { "city": "Austin", "region": "TX", "country": "US" }, "confidence": 0.8 } | null,
  "project_type":   { "value": { "value": "HIGHLIGHT" }, "confidence": 0.9 } | null,
  "price_quoted":   { "value": { "usd": 850, "per": "package" }, "confidence": 0.85 } | null,
  "source_channel": { "value": { "value": "UPWORK" }, "confidence": 0.9 } | null,
  "delivery_date":  { "value": { "iso": "YYYY-MM-DD" }, "confidence": 0.7 } | null,
  "outcome":        { "value": { "value": "WON" }, "confidence": 0.85 } | null,
  "inferred_stage": { "value": { "stage": "STAGE_VALUE", "reason": "short literal evidence from the thread" }, "confidence": <YOUR_CONFIDENCE_0_TO_1> } | null,
  "coach_next_action": { "value": { "intent": "INTENT_VALUE", "situation": "one tight sentence about THIS contact", "blockers": ["..."], "next_action": { "type": "ACTION_TYPE", "timing": "...", "message_to_send": null, "anchor_price_usd": null, "notes": null }, "red_flags": ["..."] }, "confidence": <YOUR_CONFIDENCE_0_TO_1> } | null
}

Important:
- The example values above are TYPE PLACEHOLDERS, not real data. Always emit reasoning that quotes the actual thread you were given. Never copy the placeholder strings verbatim.
- For inferred_stage and coach_next_action, ALWAYS emit a real confidence between 0.5 and 1.0 — never zero. Pick 0.5-0.7 when the thread has only one or two messages, 0.8-0.95 when the conversation is clear.`;

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

    // --contact-id <uuid>: process exactly one contact, ignore everything else.
    let rawContacts: { id: string }[];
    if (args.contactId) {
        rawContacts = [{ id: args.contactId }];
    } else if (args.priority) {
        // --priority: order by total_emails_sent + total_emails_received DESC,
        // surfacing heavy contacts (Josh Loseke had 84 — they should never be
        // queued behind a 2-email cold-lead).
        let q = s
            .from('contacts')
            .select('id, total_emails_sent, total_emails_received, is_client')
            .or('total_emails_received.gte.10,is_client.eq.true')
            .order('total_emails_received', { ascending: false })
            .limit(Math.min(wantLimit + seenIds.size, 5000));
        if (args.sinceContactId) q = q.gt('id', args.sinceContactId);
        const { data, error } = await q;
        if (error) throw error;
        rawContacts = (data ?? []) as { id: string }[];
    } else {
        let q = s.from('contacts').select('id').order('id', { ascending: true });
        if (args.sinceContactId) q = q.gt('id', args.sinceContactId);
        q = q.limit(Math.min(wantLimit + seenIds.size, 50000));
        const { data, error } = await q;
        if (error) throw error;
        rawContacts = (data ?? []) as { id: string }[];
    }

    const contacts = rawContacts
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

    // Groq has per-minute rate limits; hammering serially still tripped 429s
    // on the dry-run. 350 ms between calls = ~170 contacts/minute, well
    // under any free-tier ceiling. On 429 we back off + retry once.
    async function processOne(contactId: string): Promise<void> {
        let r = await extractForContact(s, contactId);
        if (r.error?.includes('429')) {
            await new Promise(rs => setTimeout(rs, 6000));
            r = await extractForContact(s, contactId);
        }
        processed++;
        if (r.error) {
            errors++;
            // Always surface errors (was dry-run-only) so a 64% error rate
            // doesn't go unexplained in real runs. Truncated to 120 chars
            // since some Zod errors balloon to 2k+ chars.
            console.log(`  [${contactId}] ERROR ${(r.error || '').slice(0, 120)}`);
            return;
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

    for (const c of contacts) {
        await processOne(c.id as string);
        await new Promise(rs => setTimeout(rs, 2000));
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
    // Mirror of fetchThreadForContact + prompt-body assembly in
    // src/services/insightsExtractor.ts. Keep in lockstep.
    const { data: rawThread, error: threadErr } = await s
        .from('email_messages')
        .select('id, subject, body, snippet, direction, sent_at')
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false })
        .limit(60);
    if (threadErr) return { facts: [], error: threadErr.message };
    if (!rawThread || rawThread.length === 0) return { facts: [], error: 'no messages' };

    type ThreadRow = { id: string; subject: string | null; body: string | null; snippet: string | null; direction: string; sent_at: string | null };
    const desc = rawThread as unknown as ThreadRow[];
    let ordered: ThreadRow[];
    if (desc.length <= MAX_MESSAGES_PER_THREAD) {
        ordered = [...desc].reverse();
    } else {
        const oldest = desc.slice(-3);
        const recentInbound = desc.filter(m => m.direction === 'RECEIVED').slice(0, 3);
        const recentAny = desc.slice(0, 6);
        const seen = new Set<string>();
        const chosen: ThreadRow[] = [];
        for (const m of [...oldest, ...recentInbound, ...recentAny]) {
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            chosen.push(m);
            if (chosen.length >= MAX_MESSAGES_PER_THREAD) break;
        }
        chosen.sort((a, b) => {
            const aT = a.sent_at ? new Date(a.sent_at).getTime() : 0;
            const bT = b.sent_at ? new Date(b.sent_at).getTime() : 0;
            return aT - bT;
        });
        ordered = chosen;
    }

    const promptBody = ordered
        .map((m, i) => {
            const role = m.direction === 'SENT' ? '(US → them)' : '(them → US)';
            const date = m.sent_at ? new Date(m.sent_at).toISOString().slice(0, 10) : '';
            const subject = m.subject ? `Subject: ${m.subject}\n` : '';
            const cleaned = stripBoilerplate((m.body as string | null) || (m.snippet as string | null) || '');
            const body = smartTruncate(cleaned, MAX_BODY_CHARS);
            return `[message ${i}] ${role} ${date}\n${subject}${body}`;
        })
        .join('\n\n---\n\n');

    let json: unknown;
    try {
        // Match the canonical extractor: retry on 429 with retry-after
        // header when present, exponential backoff otherwise. Up to 4 tries.
        let res: Response | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
                    max_tokens: 1200,
                }),
            });
            if (res.status !== 429) break;
            if (attempt === 3) break;
            const retryAfterHdr = res.headers.get('retry-after');
            const retryAfterSec = retryAfterHdr ? parseFloat(retryAfterHdr) : NaN;
            const waitMs = Number.isFinite(retryAfterSec)
                ? Math.min(retryAfterSec * 1000, 8000)
                : 1000 * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, waitMs));
        }
        if (!res || !res.ok) return { facts: [], error: `groq ${res?.status ?? 'noresp'}` };
        const wire = await res.json();
        const raw = wire?.choices?.[0]?.message?.content;
        if (!raw) return { facts: [], error: 'empty response' };
        json = JSON.parse(raw);
    } catch (err: any) {
        return { facts: [], error: `fetch/parse: ${err?.message || err}` };
    }

    const env = ExtractionResponseSchema.safeParse(json);
    if (!env.success) {
        if (process.env.INSIGHTS_DEBUG) console.warn('  envelope FAIL:', JSON.stringify(json).slice(0, 400));
        return { facts: [], error: 'schema-mismatch' };
    }

    const facts: Fact[] = [];
    const dropped: string[] = [];
    for (const factType of Object.keys(FACT_REGISTRY) as FactType[]) {
        const payload = (env.data as any)[factType];
        if (!payload) { dropped.push(`${factType}=missing`); continue; }
        if (payload.confidence < CONFIDENCE_FLOOR) { dropped.push(`${factType}=lowConf(${payload.confidence})`); continue; }
        const valueParsed = FACT_REGISTRY[factType].safeParse(payload.value);
        if (!valueParsed.success) {
            dropped.push(`${factType}=schemaFail`);
            if (process.env.INSIGHTS_DEBUG) console.warn(`  ${factType} schema FAIL:`, JSON.stringify(payload.value).slice(0, 300), '·', JSON.stringify(valueParsed.error.issues.slice(0, 2)));
            continue;
        }
        const sourceEmailId =
            payload.source_message_index != null ? (ordered[payload.source_message_index]?.id as string | null) ?? null : null;
        facts.push({ factType, value: valueParsed.data, confidence: payload.confidence, sourceEmailId });
    }
    if (process.env.INSIGHTS_DEBUG && dropped.length > 0) {
        console.warn('  dropped:', dropped.join(', '));
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
