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
// Bump v1 → v2 when extractor envelope changes. The cron re-extracts any
// contact whose existing rows all carry an older version. v2: bigger
// context window (12 messages, 4k chars/msg), HTML/quote-chain stripping,
// and fanned sampling so 88-message threads aren't reduced to 5 tail
// follow-ups (the Josh Loseke failure mode).
const MODEL_VERSION = 'groq-llama-3.1-8b@v2';
const MAX_MESSAGES_PER_THREAD = 12;
const MAX_BODY_CHARS = 4000;
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

// PipelineStage for the inferred_stage fact. Mirrors prisma/schema.prisma
// PipelineStage enum so consumers can write directly to contacts.pipeline_stage
// (or contacts.pipeline_stage_override once Phase 2 lands).
const PipelineStageSchema = z.enum([
    'COLD_LEAD',
    'CONTACTED',
    'WARM_LEAD',
    'LEAD',
    'OFFER_ACCEPTED',
    'CLOSED',
    'NOT_INTERESTED',
]);

const IntentSchema = z.enum([
    'WEDDING_PROSPECT',
    'PAID_CLIENT_ACTIVE',
    'EDITOR_RECRUITER_INBOUND',
    'PEER_NETWORKING',
    'VENDOR_OR_TOOL_PITCH',
    'AUTOMATED_NOTIFICATION',
    'SPAM_OR_NOT_INTERESTED',
    'UNCLEAR',
]);

const NextActionTypeSchema = z.enum([
    'SEND_REPLY',
    'SEND_FOLLOWUP',
    'SCHEDULE_CALL',
    'SEND_QUOTE',
    'SEND_DELIVERABLE',
    'WAIT_AND_REMIND_LATER',
    'STOP_OUTREACH',
    'NO_ACTION_NEEDED',
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
    /**
     * Pipeline stage the conversation actually warrants TODAY, ignoring the
     * mechanical heuristic that stamps WARM_LEAD on first reply. The Phase-2
     * UI reads this when confidence ≥ 0.85; until then it powers the
     * contact-detail Coach panel and the action queue.
     */
    inferred_stage: z.object({
        stage: PipelineStageSchema,
        reason: z.string().min(2).max(200),
    }),
    /**
     * Full structured "what's going on, what should we do" output the Coach
     * panel renders. Stored as JSON in contact_insights.value so a single
     * extraction round produces both the chip-level stage AND the rep-facing
     * action card.
     */
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
    inferred_stage: FactPayloadSchema.nullable().optional(),
    coach_next_action: FactPayloadSchema.nullable().optional(),
});

const SYSTEM_PROMPT = `You are the head of sales for a wedding-filmmaking CRM. Read the email thread and extract structured facts AND a coach output. Output STRICT JSON matching the schema below — no prose.

Rules — extracted facts:
- Only extract a fact if you find evidence in the messages. If unsure, OMIT the field (do not guess).
- "wedding_date" must be ISO YYYY-MM-DD. If only month/year given, use the 1st of the month with confidence ≤ 0.5.
- "couple_names" extracts the COUPLE / CLIENTS — not the sender (us). Names like "Alex & Sam", "Hi Mark and Jenny" → ["Mark","Jenny"].
- "location" — city > region > country, in that order.
- "project_type" maps to one of: HIGHLIGHT (highlight reel), FULL_FILM (full ceremony/feature edit), TRAILER, SOCIAL_CUT (Instagram/TikTok cuts), RESTORATION (old footage), OTHER.
- "price_quoted" — only if a USD amount is mentioned in OUR outbound or theirs.
- "source_channel" — UPWORK / INSTAGRAM / REFERRAL / WEBSITE / COLD_OUTREACH / UNKNOWN.
- "delivery_date" — date we shipped or said we'd ship the deliverable.
- "outcome" — WON if they paid / accepted / are a client; LOST if explicitly declined; GHOSTED if no reply >60 days after our last send; NOT_INTERESTED if they said so; STILL_OPEN otherwise.

Rules — coach output (ALWAYS produce these two if there's any thread to read):
- "inferred_stage" — what pipeline_stage the conversation ACTUALLY warrants today, ignoring the value already in the DB:
    COLD_LEAD: never replied, no inbound from them
    CONTACTED: we sent something, they have not yet engaged
    WARM_LEAD: they replied with interest, no quote yet
    LEAD: a quote / scope / proposal is on the table
    OFFER_ACCEPTED: they accepted price/scope verbally; deposit not yet paid
    CLOSED: money on file OR a deliverable shipped
    NOT_INTERESTED: explicit decline / >60d ghosting after our last send / they're a peer / vendor / recruiter
  Confidence ≥ 0.8 means safe to auto-apply.
- "coach_next_action" — the rep-facing playbook:
    intent: WEDDING_PROSPECT (couple looking to book) | PAID_CLIENT_ACTIVE | EDITOR_RECRUITER_INBOUND (we asked them to hire us) | PEER_NETWORKING (fellow filmmakers) | VENDOR_OR_TOOL_PITCH (someone selling US software/services) | AUTOMATED_NOTIFICATION | SPAM_OR_NOT_INTERESTED | UNCLEAR
    situation: ONE tight sentence on what's true now (≤30 words).
    blockers: array of strings (price, timeline, partner-decision, ghosting). Empty array if none.
    next_action: { type, timing, message_to_send, anchor_price_usd, notes }
      type: SEND_REPLY | SEND_FOLLOWUP | SCHEDULE_CALL | SEND_QUOTE | SEND_DELIVERABLE | WAIT_AND_REMIND_LATER | STOP_OUTREACH | NO_ACTION_NEEDED
      timing: when ("today" / "in 3 days" / "next Tuesday" / "in 60 days").
      message_to_send: ready-to-send 2-4 sentence reply IF type is SEND_REPLY/SEND_FOLLOWUP/SEND_QUOTE/SEND_DELIVERABLE — match the contact's tone, never fabricate facts. Otherwise null.
      anchor_price_usd: number when type=SEND_QUOTE, otherwise null.
      notes: optional one-liner for the rep, otherwise null.
    red_flags: data-quality issues you spot (e.g. "is_client=true with no project rows", "thread is editor recruiting but stage says CONTACTED"). Empty array if none.

- Each fact MUST include: { value, confidence (0-1), source_message_index (0-based, optional) }.
- If a fact's confidence < 0.4, OMIT it (except inferred_stage and coach_next_action — always emit those if there's a thread).

Schema:
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
            const cleaned = stripBoilerplate(m.body || m.snippet || '');
            const body = smartTruncate(cleaned, MAX_BODY_CHARS);
            return `[message ${i}] ${role} ${date}\n${subject}${body}`;
        })
        .join('\n\n---\n\n');

    let json: unknown;
    try {
        // Groq returns 429 in bursts when the cron / backfill submits faster
        // than the per-minute quota allows. The X-RateLimit-Reset header
        // tells us when to try again, but it's only sometimes present —
        // fall back to exponential backoff (1s, 2s, 4s) up to 3 retries.
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
            if (attempt === 3) break; // last attempt — fall through to error path
            const retryAfterHdr = res.headers.get('retry-after');
            const retryAfterSec = retryAfterHdr ? parseFloat(retryAfterHdr) : NaN;
            const waitMs = Number.isFinite(retryAfterSec)
                ? Math.min(retryAfterSec * 1000, 8000)
                : 1000 * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, waitMs));
        }
        if (!res || !res.ok) {
            return { contactId, facts: [], error: `groq ${res?.status ?? 'noresp'}` };
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

/**
 * Sample up to MAX_MESSAGES_PER_THREAD messages for the LLM in a way that
 * preserves narrative shape on long threads (Josh Loseke had 88 emails over
 * 351 days; the old code fed the LLM the last 5 follow-ups, all `(US→them)`,
 * and concluded "ghosted" while ignoring his 25 inbound replies entirely).
 *
 * Strategy:
 *   - Short threads (≤ MAX): take everything, oldest-first.
 *   - Long threads: fanned sample
 *       • 3 oldest        — origin story
 *       • 3 latest inbound — their voice / current intent
 *       • 6 most recent    — what's happening now
 *     Deduped, sorted oldest-first. Pulls up to 60 messages from the DB to
 *     have enough material to fan from.
 */
async function fetchThreadForContact(contactId: string): Promise<ThreadMessage[]> {
    const { data } = await supabase
        .from('email_messages')
        .select('id, subject, body, snippet, direction, sent_at')
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false })
        .limit(60);
    if (!data || data.length === 0) return [];

    const desc = data as ThreadMessage[]; // newest-first
    if (desc.length <= MAX_MESSAGES_PER_THREAD) {
        return [...desc].reverse();
    }

    const oldest = desc.slice(-3); // .slice(-3) on a desc array = 3 oldest
    const recentInbound = desc.filter(m => m.direction === 'RECEIVED').slice(0, 3);
    const recentAny = desc.slice(0, 6);

    const seen = new Set<string>();
    const chosen: ThreadMessage[] = [];
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
    return chosen;
}

/**
 * Strip HTML, signatures, tracking pixels, and quote chains so the
 * MAX_BODY_CHARS budget gets spent on actual content. Many emails in
 * production are 95%+ markup — a 17,751-char body for Josh shrinks to
 * <1,000 chars after this runs.
 */
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
    // Mailtrack / open-pixel residue
    out = out.replace(/mailtrack-[a-z0-9-]+[^\s]*/gi, ' ');
    // Gmail-style quote chain. Cuts everything from the "On <date> ... wrote:"
    // marker to the end. Conservative — only matches when the marker is
    // followed by enough quoted material to be a real chain, not a phrase
    // like "she wrote: yes" inside prose.
    out = out.replace(/\n+On\s+\w+,?\s+\w+\s+\d+,?\s+\d{4}[^\n]{0,80}wrote:[\s\S]*$/i, '');
    // Outlook-style "-----Original Message-----"
    out = out.replace(/\n+-+\s*Original Message\s*-+[\s\S]*$/i, '');
    // Outlook-style "From: / Sent: / To:" header block
    out = out.replace(/\n+From:\s+[^\n]+\n+Sent:\s+[^\n]+\n+To:\s+[\s\S]*$/i, '');
    // Line-prefixed quotes (> ...)
    out = out.replace(/^\s*>\s*.*$/gm, '');
    out = out.replace(/[ \t]+/g, ' ');
    out = out.replace(/\n{3,}/g, '\n\n');
    return out.trim();
}

/**
 * Head+tail truncate: keeps the first half and last half of a long string,
 * dropping the middle. Long sales threads usually have the buyer's question
 * at the top and the price/decision at the bottom; pure .slice(0, max)
 * loses the bottom entirely.
 */
function smartTruncate(s: string, max: number): string {
    if (s.length <= max) return s;
    const half = Math.floor(max / 2) - 6; // leave room for the marker
    return s.slice(0, half) + '\n[...]\n' + s.slice(-half);
}
