import 'server-only';
import { z } from 'zod';
import { supabase } from '../lib/supabase';

/**
 * Email Intelligence Layer extractor.
 *
 * For each contact, takes the most recent ≤5 messages on their thread,
 * sends a single Groq llama-3.1-8b call in JSON-mode, validates with Zod,
 * and UPSERTs the resulting facts into `contact_insights`.
 *
 * One row per (contact_id, fact_type) — see prisma/insights_layer_migration.sql.
 *
 * Cost envelope: ~150 input + ~80 output tokens per contact, ~$0.00005 each.
 * Backfilling 100k contacts: ~$5 total.
 *
 * Failure modes:
 * - LLM returns malformed JSON → entire result dropped, contact retried next cycle.
 * - LLM returns extra fact_types not in registry → silently dropped.
 * - Confidence < 0.4 from the LLM → row not written (cuts noise).
 *
 * Model versioning: every row carries `model_version`. When the prompt or
 * model changes, bump MODEL_VERSION below. The cron will re-extract any
 * contact whose existing insights all carry an older version.
 */

const MODEL = 'llama-3.1-8b-instant';
const MODEL_VERSION = 'groq-llama-3.1-8b@v1';
const MAX_MESSAGES_PER_THREAD = 5;
const MAX_BODY_CHARS = 1500;
const CONFIDENCE_FLOOR = 0.4;

// ─── Fact-type registry ─────────────────────────────────────────────────────
// Each key is a `fact_type` column value. Each schema validates the LLM's
// output for that fact. Add new fact types here + a corresponding hint in
// the system prompt. Phase 1 covers Tier 1 from INSIGHTS_LAYER_PLAN.md.

const ProjectTypeSchema = z.enum([
    'HIGHLIGHT',
    'FULL_FILM',
    'TRAILER',
    'SOCIAL_CUT',
    'RESTORATION',
    'OTHER',
]);

const SourceChannelSchema = z.enum([
    'UPWORK',
    'INSTAGRAM',
    'REFERRAL',
    'WEBSITE',
    'COLD_OUTREACH',
    'UNKNOWN',
]);

const OutcomeSchema = z.enum([
    'WON',
    'LOST',
    'GHOSTED',
    'NOT_INTERESTED',
    'STILL_OPEN',
]);

/** Maps fact_type → Zod schema for the value column. */
export const FACT_REGISTRY = {
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

export type FactType = keyof typeof FACT_REGISTRY;

/** Per-fact wire shape from the LLM: value object + confidence + provenance hint. */
const FactPayloadSchema = z.object({
    value: z.unknown(),
    confidence: z.number().min(0).max(1),
    /** Best-effort: which message_id (out of the ones we sent) the LLM cited. */
    source_message_index: z.number().int().min(0).max(MAX_MESSAGES_PER_THREAD - 1).nullable().optional(),
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
- Output JSON object with one or more of: wedding_date, couple_names, location, project_type, price_quoted, source_channel, delivery_date, outcome.

Schema:
{
  "wedding_date":   { "value": { "iso": "YYYY-MM-DD" }, "confidence": 0.95, "source_message_index": 1 } | null,
  "couple_names":   { "value": { "names": ["Alex","Sam"] }, "confidence": 0.9 } | null,
  "location":       { "value": { "city": "Austin", "region": "TX", "country": "US" }, "confidence": 0.8 } | null,
  "project_type":   { "value": { "value": "HIGHLIGHT" }, "confidence": 0.9 } | null,
  "price_quoted":   { "value": { "usd": 850, "per": "package" }, "confidence": 0.85 } | null,
  "source_channel": { "value": { "value": "UPWORK" }, "confidence": 0.9 } | null,
  "delivery_date":  { "value": { "iso": "YYYY-MM-DD" }, "confidence": 0.7 } | null,
  "outcome":        { "value": { "value": "WON" }, "confidence": 0.85 } | null
}`;

// ─── Public API ─────────────────────────────────────────────────────────────

export type ExtractionResult = {
    contactId: string;
    facts: { factType: FactType; value: any; confidence: number; sourceEmailId: string | null }[];
    error?: string;
};

/** Extract for one contact. Reads recent thread, calls Groq, validates, returns. */
export async function extractInsightsForContact(contactId: string): Promise<ExtractionResult> {
    const thread = await fetchThreadForContact(contactId);
    if (!thread || thread.length === 0) {
        return { contactId, facts: [], error: 'no messages' };
    }

    const promptBody = thread
        .map((m, i) => {
            const role = m.direction === 'SENT' ? '(US → them)' : '(them → US)';
            const date = m.sent_at ? new Date(m.sent_at).toISOString().slice(0, 10) : '';
            const subject = m.subject ? `Subject: ${m.subject}\n` : '';
            const body = (m.body || m.snippet || '').slice(0, MAX_BODY_CHARS);
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
        if (!res.ok) {
            return { contactId, facts: [], error: `groq ${res.status}` };
        }
        const wire = await res.json();
        const raw = wire?.choices?.[0]?.message?.content;
        if (!raw) return { contactId, facts: [], error: 'empty response' };
        json = JSON.parse(raw);
    } catch (err: any) {
        return { contactId, facts: [], error: `fetch/parse: ${err?.message || err}` };
    }

    // Validate top-level envelope
    const env = ExtractionResponseSchema.safeParse(json);
    if (!env.success) {
        return { contactId, facts: [], error: 'schema-mismatch envelope' };
    }

    const out: ExtractionResult = { contactId, facts: [] };
    for (const factType of Object.keys(FACT_REGISTRY) as FactType[]) {
        const payload = env.data[factType];
        if (!payload) continue;
        if (payload.confidence < CONFIDENCE_FLOOR) continue;
        const valueSchema = FACT_REGISTRY[factType];
        const valueParsed = valueSchema.safeParse(payload.value);
        if (!valueParsed.success) continue;
        const sourceEmailId =
            payload.source_message_index != null
                ? thread[payload.source_message_index]?.id ?? null
                : null;
        out.facts.push({
            factType,
            value: valueParsed.data,
            confidence: payload.confidence,
            sourceEmailId,
        });
    }
    return out;
}

/**
 * Persist an extraction result to `contact_insights`. Best-effort bumps
 * `contacts.insights_extracted_at` when that column exists — if the column
 * isn't there yet (the ALTER TABLE in the migration hasn't run), the bump
 * is silently skipped. Cron freshness uses a NOT EXISTS join in that case.
 */
export async function persistExtraction(result: ExtractionResult): Promise<{ written: number; error?: string }> {
    const stamp = new Date().toISOString();

    // Always try to bump the timestamp; ignore "column does not exist" errors
    // so this code works pre- and post-ALTER-TABLE migration.
    await supabase
        .from('contacts')
        .update({ insights_extracted_at: stamp })
        .eq('id', result.contactId)
        .then(() => null, () => null);

    if (result.facts.length === 0) {
        // No facts extracted but contact has been processed — write a zero-fact
        // sentinel row so the cron's NOT EXISTS check skips this contact next run.
        await supabase
            .from('contact_insights')
            .upsert(
                [
                    {
                        contact_id: result.contactId,
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
        return { written: 0 };
    }

    const rows = result.facts.map(f => ({
        contact_id: result.contactId,
        fact_type: f.factType,
        value: f.value,
        confidence: f.confidence,
        source_email_id: f.sourceEmailId,
        model_version: MODEL_VERSION,
        extracted_at: stamp,
    }));

    const { error } = await supabase
        .from('contact_insights')
        .upsert(rows, { onConflict: 'contact_id,fact_type' });

    if (error) {
        return { written: 0, error: error.message };
    }

    return { written: rows.length };
}

// ─── Internal helpers ───────────────────────────────────────────────────────

type ThreadMessage = {
    id: string;
    subject: string | null;
    body: string | null;
    snippet: string | null;
    direction: 'SENT' | 'RECEIVED' | string;
    sent_at: string | null;
};

async function fetchThreadForContact(contactId: string): Promise<ThreadMessage[]> {
    // Latest 5 messages across all threads belonging to this contact, oldest
    // first so the LLM reads them in narrative order.
    const { data } = await supabase
        .from('email_messages')
        .select('id, subject, body, snippet, direction, sent_at')
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false })
        .limit(MAX_MESSAGES_PER_THREAD);
    if (!data) return [];
    return [...data].reverse() as ThreadMessage[];
}
