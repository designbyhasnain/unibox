import 'server-only';
import { z } from 'zod';
import { supabase } from '../lib/supabase';

/**
 * Sales-head coach for a single contact.
 *
 * Pulls the contact + their recent thread + their existing insights and asks
 * Groq llama-3.1-8b for a structured read: intent, the stage the conversation
 * actually warrants, the next concrete action (timing + draft message + anchor
 * price when applicable), and any data-quality red flags ("is_client=true but
 * no project" etc).
 *
 * Output is Zod-validated; malformed responses fall through to a sentinel
 * "needs review" object so callers can surface the failure rather than crash.
 *
 * Cost: ~250 input + ~250 output tokens per call. Groq llama-3.1-8b at
 * roughly $0.00010 per call. Cheap enough to run on demand from the UI.
 */

const MODEL = 'llama-3.1-8b-instant';

// Pipeline stages the inference can return. Mirrors prisma/schema.prisma
// PipelineStage enum so the Apply button can write directly.
const StageSchema = z.enum([
    'COLD_LEAD',
    'CONTACTED',
    'WARM_LEAD',
    'LEAD',
    'OFFER_ACCEPTED',
    'CLOSED',
    'NOT_INTERESTED',
]);

const IntentSchema = z.enum([
    'WEDDING_PROSPECT',          // a couple / planner looking to book a wedding film
    'PAID_CLIENT_ACTIVE',        // money already exchanged; ongoing engagement
    'EDITOR_RECRUITER_INBOUND',  // someone we asked to hire us as editors
    'PEER_NETWORKING',           // fellow filmmakers exchanging info, not a sale
    'VENDOR_OR_TOOL_PITCH',      // someone selling US software / services
    'AUTOMATED_NOTIFICATION',    // tracking pixels, system mail
    'SPAM_OR_NOT_INTERESTED',    // explicit STOP or junk
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

export const ClientCoachOutputSchema = z.object({
    intent: IntentSchema,
    situation: z.string().min(8).max(300),
    inferred_stage: StageSchema,
    inferred_stage_confidence: z.number().min(0).max(1),
    inferred_stage_reason: z.string().min(4).max(200),
    blockers: z.array(z.string().min(2).max(160)).max(5),
    next_action: z.object({
        type: NextActionTypeSchema,
        timing: z.string().min(2).max(60),
        message_to_send: z.string().max(800).nullable(),
        anchor_price_usd: z.number().nullable(),
        notes: z.string().max(200).nullable(),
    }),
    red_flags: z.array(z.string().min(2).max(200)).max(6),
});

export type ClientCoachOutput = z.infer<typeof ClientCoachOutputSchema>;

const SYSTEM_PROMPT = `You are the head of sales for a wedding-filmmaking studio.

Read a contact's CRM record + recent thread + extracted insights, then output STRICT JSON describing exactly what's happening and what to do next. No prose, no preamble.

Rules:
- "intent" is the SINGLE category that best describes who this contact is to us. EDITOR_RECRUITER_INBOUND when the thread shows we approached THEM for editing work; never call that stage CONTACTED-for-sales.
- "situation" = one tight sentence on what's currently true (≤ 30 words).
- "inferred_stage" — what the pipeline_stage SHOULD be given the conversation today, ignoring the stale value in the DB. NOT_INTERESTED when they explicitly declined or never replied after >60 days. CLOSED only if money is on file or a deliverable shipped.
- "inferred_stage_confidence" ≥ 0.8 means safe to auto-apply; < 0.8 surfaces for human review.
- "inferred_stage_reason" cites the literal evidence in one phrase.
- "blockers" — what's actually preventing the deal (price, timeline, partner-decision, ghosting). Empty array if none.
- "next_action" — the ONE move we should make:
    type: SEND_REPLY (we owe a response now), SEND_FOLLOWUP (gentle re-engage), SCHEDULE_CALL, SEND_QUOTE, SEND_DELIVERABLE, WAIT_AND_REMIND_LATER, STOP_OUTREACH, NO_ACTION_NEEDED.
    timing: when (e.g. "today", "in 3 days", "next Tuesday", "in 60 days").
    message_to_send: a ready-to-send 2-4 sentence reply IF type is SEND_REPLY / SEND_FOLLOWUP / SEND_QUOTE / SEND_DELIVERABLE; otherwise null. Match the contact's tone and any names mentioned. NEVER fabricate facts; only use what's in the thread.
    anchor_price_usd: when type is SEND_QUOTE, the price we should anchor to. Otherwise null.
    notes: optional one-liner for the rep ("they explicitly mentioned $500 cap — don't go higher").
- "red_flags" — data-quality issues you spot ("is_client=true but no project rows", "stage says CONTACTED but conversation already CLOSED in 2024", "thread looks like recruiter outreach but pipeline stage is CONTACTED"). Empty array if none.

Output schema (return JSON object only):
{
  "intent": "WEDDING_PROSPECT" | "PAID_CLIENT_ACTIVE" | "EDITOR_RECRUITER_INBOUND" | "PEER_NETWORKING" | "VENDOR_OR_TOOL_PITCH" | "AUTOMATED_NOTIFICATION" | "SPAM_OR_NOT_INTERESTED" | "UNCLEAR",
  "situation": "string",
  "inferred_stage": "COLD_LEAD" | "CONTACTED" | "WARM_LEAD" | "LEAD" | "OFFER_ACCEPTED" | "CLOSED" | "NOT_INTERESTED",
  "inferred_stage_confidence": number,
  "inferred_stage_reason": "string",
  "blockers": ["string"],
  "next_action": {
    "type": "SEND_REPLY" | "SEND_FOLLOWUP" | "SCHEDULE_CALL" | "SEND_QUOTE" | "SEND_DELIVERABLE" | "WAIT_AND_REMIND_LATER" | "STOP_OUTREACH" | "NO_ACTION_NEEDED",
    "timing": "string",
    "message_to_send": "string" | null,
    "anchor_price_usd": number | null,
    "notes": "string" | null
  },
  "red_flags": ["string"]
}`;

export type CoachInput = {
    contactId: string;
};

export type CoachResult =
    | { success: true; output: ClientCoachOutput; rawSnapshot: SnapshotForPrompt }
    | { success: false; error: string };

export async function coachContact(input: CoachInput): Promise<CoachResult> {
    if (!process.env.GROQ_API_KEY) return { success: false, error: 'GROQ_API_KEY not set' };

    const snapshot = await buildSnapshot(input.contactId);
    if (!snapshot) return { success: false, error: 'contact not found' };

    const userMsg = renderSnapshot(snapshot);
    let raw: any;
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userMsg },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.2,
                max_tokens: 900,
            }),
        });
        if (!res.ok) return { success: false, error: `groq ${res.status}` };
        const wire = await res.json();
        const content = wire?.choices?.[0]?.message?.content;
        if (!content) return { success: false, error: 'empty completion' };
        raw = JSON.parse(content);
    } catch (e: any) {
        return { success: false, error: `fetch/parse: ${e?.message || e}` };
    }

    const parsed = ClientCoachOutputSchema.safeParse(raw);
    if (!parsed.success) {
        console.warn('[coachContact] schema-mismatch:', parsed.error.issues.slice(0, 3));
        return { success: false, error: 'schema-mismatch' };
    }
    return { success: true, output: parsed.data, rawSnapshot: snapshot };
}

// ─── Snapshot builder ───────────────────────────────────────────────────────

export type SnapshotForPrompt = {
    contact: {
        id: string;
        name: string | null;
        email: string;
        company: string | null;
        location: string | null;
        pipeline_stage: string | null;
        is_client: boolean | null;
        contact_type: string | null;
        last_email_at: string | null;
        days_since_last_contact: number | null;
        total_emails_sent: number | null;
        total_emails_received: number | null;
    };
    insights: { fact_type: string; value: any; confidence: number }[];
    projects: { name: string | null; value: number | null; paid: string | null; date: string | null }[];
    thread: {
        direction: string;
        date: string;
        subject: string | null;
        from: string | null;
        to: string | null;
        body: string;
    }[];
    mailbox: string | null;
};

async function buildSnapshot(contactId: string): Promise<SnapshotForPrompt | null> {
    const { data: c } = await supabase
        .from('contacts')
        .select('id, name, email, company, location, pipeline_stage, is_client, contact_type, last_email_at, days_since_last_contact, total_emails_sent, total_emails_received')
        .eq('id', contactId)
        .maybeSingle();
    if (!c) return null;

    const [insightsResp, projectsResp, msgsResp] = await Promise.all([
        supabase.from('contact_insights').select('fact_type, value, confidence').eq('contact_id', contactId),
        supabase.from('projects').select('project_name, project_value, paid_status, project_date').eq('client_id', contactId).order('project_date', { ascending: false }).limit(5),
        supabase.from('email_messages')
            .select('direction, sent_at, subject, from_email, to_email, body, snippet, gmail_account_id')
            .eq('contact_id', contactId)
            .order('sent_at', { ascending: false })
            .limit(8),
    ]);

    const messages = [...(msgsResp.data ?? [])].reverse(); // chronological for the LLM

    let mailbox: string | null = null;
    const accId = messages[0]?.gmail_account_id as string | undefined;
    if (accId) {
        const { data: acc } = await supabase.from('gmail_accounts').select('email').eq('id', accId).maybeSingle();
        mailbox = acc?.email ?? null;
    }

    return {
        contact: {
            id: c.id,
            name: c.name ?? null,
            email: c.email ?? '',
            company: c.company ?? null,
            location: c.location ?? null,
            pipeline_stage: c.pipeline_stage ?? null,
            is_client: c.is_client ?? null,
            contact_type: c.contact_type ?? null,
            last_email_at: c.last_email_at ?? null,
            days_since_last_contact: c.days_since_last_contact ?? null,
            total_emails_sent: c.total_emails_sent ?? null,
            total_emails_received: c.total_emails_received ?? null,
        },
        insights: (insightsResp.data ?? [])
            .filter((i: any) => i.fact_type !== '_no_facts')
            .map((i: any) => ({ fact_type: i.fact_type, value: i.value, confidence: i.confidence ?? 1 })),
        projects: (projectsResp.data ?? []).map((p: any) => ({
            name: p.project_name,
            value: p.project_value ?? null,
            paid: p.paid_status ?? null,
            date: p.project_date ?? null,
        })),
        thread: messages.map((m: any) => ({
            direction: m.direction,
            date: m.sent_at ? new Date(m.sent_at).toISOString().slice(0, 10) : '',
            subject: m.subject,
            from: m.from_email ?? null,
            to: m.to_email ?? null,
            body: ((m.body as string | null) || (m.snippet as string | null) || '').slice(0, 1200),
        })),
        mailbox,
    };
}

function renderSnapshot(s: SnapshotForPrompt): string {
    const lines: string[] = [];
    lines.push('CONTACT:');
    lines.push(`  name: ${s.contact.name || '(none)'}, email: ${s.contact.email}`);
    if (s.contact.company) lines.push(`  company: ${s.contact.company}`);
    if (s.contact.location) lines.push(`  location: ${s.contact.location}`);
    lines.push(`  pipeline_stage (current DB): ${s.contact.pipeline_stage || '(null)'}`);
    lines.push(`  is_client: ${s.contact.is_client}, contact_type: ${s.contact.contact_type || '(null)'}`);
    if (s.contact.last_email_at) lines.push(`  last_email_at: ${s.contact.last_email_at} (days_since_last_contact: ${s.contact.days_since_last_contact ?? '(unknown)'})`);
    lines.push(`  emails: sent=${s.contact.total_emails_sent ?? '(unknown)'}, received=${s.contact.total_emails_received ?? '(unknown)'}`);
    if (s.mailbox) lines.push(`  conversation mailbox: ${s.mailbox}`);
    lines.push('');

    if (s.projects.length > 0) {
        lines.push('LINKED PROJECTS:');
        for (const p of s.projects) {
            lines.push(`  · ${p.name || '(unnamed)'} | value=$${p.value ?? '?'} | paid=${p.paid || '?'} | date=${p.date || '?'}`);
        }
        lines.push('');
    } else {
        lines.push('LINKED PROJECTS: none');
        lines.push('');
    }

    if (s.insights.length > 0) {
        lines.push('EXTRACTED INSIGHTS:');
        for (const i of s.insights) {
            lines.push(`  · ${i.fact_type}: ${JSON.stringify(i.value)} (conf ${i.confidence.toFixed(2)})`);
        }
        lines.push('');
    }

    lines.push(`RECENT THREAD (${s.thread.length} messages, oldest first):`);
    for (let i = 0; i < s.thread.length; i++) {
        const m = s.thread[i];
        const role = m.direction === 'SENT' ? 'US → them' : 'them → US';
        lines.push(`  [msg ${i}] ${role} ${m.date} subj: "${m.subject || ''}"`);
        lines.push(`    ${m.body.slice(0, 800)}`);
    }
    return lines.join('\n');
}
