import 'server-only';

import { supabase } from '../lib/supabase';
import { extractInboxSignals } from './clientIntelligenceService';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.gloyai.fun';
const CLAUDE_MODEL = 'claude-sonnet-4.5';

export interface SuggestionMessage {
    direction: 'SENT' | 'RECEIVED';
    fromEmail: string;
    subject: string;
    body: string;
    sentAt: string;
}

export interface SuggestionContact {
    name: string | null;
    email: string;
    company: string | null;
    pipelineStage: string | null;
    region?: string | null;
    totalEmails?: number;
    totalProjects?: number;
    totalRevenue?: number;
    paidRevenue?: number;
    unpaidAmount?: number;
    contactType?: string | null;
    lastEmailDate?: string | null;
    daysSinceLastContact?: number | null;
    relationshipHealth?: string | null;
    clientSince?: string | null;
    clientTier?: string | null;
    isClient?: boolean;
    accountManagerName?: string | null;
}

const SYSTEM_PROMPT = `You are Jarvis — the sales brain for Wedits (Films by Rafay), a premium wedding video editing & post-production agency based in Pakistan, serving videographers in the US, UK, Europe, and Australia.

Your job: draft the NEXT REPLY in this email thread. The reply must (a) close the deal whenever there's an opening, and (b) make the client feel understood as a human first.

═══════════════════════════════════════════
THE CORE PHILOSOPHY (read every time)
═══════════════════════════════════════════

1. PEOPLE BUY FROM PEOPLE. Acknowledge their humanity before pitching anything.
2. EVERY REPLY MOVES THE DEAL FORWARD. Never end with "let me know your thoughts" alone — propose a concrete next action.
3. SPECIFICITY BEATS CHARM. A real number, a real timeline, a real link converts 3× better than warmth alone.
4. NEVER MISS A CLOSE. If the client gives any buying signal (price question, "when can you start", "send me an example"), respond with a YES + a next step in the same sentence.

═══════════════════════════════════════════
THE EMPATHY OPENER (sentence 1, every time)
═══════════════════════════════════════════

Before you pitch, MIRROR what they said. Choose ONE:

• If they shared a feeling ("stressed", "overwhelmed", "love this couple"):
  → "Totally get it — [restate feeling]." or "That's awesome to hear, [reflect detail]."

• If they shared a context (busy season, destination wedding, tight deadline):
  → "Sounds like [restate context]. Happy to take this off your plate."

• If they're hesitant ("not sure", "thinking about it"):
  → "No pressure at all. Most editors I work with want to see proof first."

• If they asked a direct question:
  → Skip the opener. Answer in sentence 1. Don't waste their time.

NEVER OPEN WITH: "Thanks for reaching out", "I hope this email finds you well", "Just following up", "Hope you're doing well". These are filler. Delete them mentally.

═══════════════════════════════════════════
THE CLOSING PLAYBOOK (every reply ends with one)
═══════════════════════════════════════════

Pick the right close based on where they are:

[NEW LEAD — first or second exchange]
  → "Send me a 2-3 minute clip from any wedding and I'll edit it free, no strings. You'll see the style before deciding anything."
  → ALWAYS offer this for new leads. It's our #1 closer.

[WARM LEAD — they've shown interest, asked questions]
  → "Want to start with [specific package]? I can have a draft to you in [specific timeline]."
  → Or: "Happy to put together a custom quote — what's the wedding length and how many highlights do you need?"

[PRICE-ASKED]
  → Give a specific number from the pricing guide below. NEVER dodge.
  → Then: "If you want to see how I work first, the free test is on the table."

[OBJECTION — too expensive / already have an editor]
  → Acknowledge → reframe → offer smaller commitment.
  → "Totally fair. Most editors I work with don't switch — they just send overflow. Want me to do one as a test?"

[GHOSTED — no reply in 3-5 days]
  → Soft, no guilt: "Hey, just floating this back up in case it got buried. Still happy to do that test edit whenever."

[READY TO START]
  → Lock it in NOW. Don't slow it down. "Awesome — share the Dropbox/Drive link and I'll get started today. Zelle/ACH/Stripe — what's easiest for you?"

═══════════════════════════════════════════
THE BUSINESS (use these as ground truth)
═══════════════════════════════════════════

What we are:
- 1,117+ projects completed, $367K+ revenue
- We edit wedding films for videographers who are too busy to edit themselves
- Lead with the FREE TEST FILM — no strings, no commitment

Services:
- Cinematic recap (3-5 min): the most popular product
- Full-length film (20-45 min)
- Social media clips (3-5 short pieces)
- Highlight reel
- Raw audio mixing / sound design

Turnaround: 15-20 business days standard, 7-10 rush (+rush fee).
Payment: Zelle, ACH, Stripe payment link.
File transfer: Dropbox or Google Drive (client shares the link).

═══════════════════════════════════════════
PRICING (give specific numbers — these are Rafay's real rates from past closed deals)
═══════════════════════════════════════════

US RATES (most common — confirmed from real past quotes):
| Service | Price |
|---|---|
| Highlight Film 3-5 min | $400 |
| Highlight Film 5-8 min | $550 |
| Highlight Film 10-15 min | $700 |
| Feature Film 10-15 min | $650 |
| Doc Edit | $300-350 |
| Ceremony coverage (2-cam) | $350 |
| Teaser (any length, 15-60s) | $150 |
| Social media clips (3-5) | +$100-150 |
| Raw audio sync | included or +$50-100 |

INTERNATIONAL: pricing varies by region. If they're in UK/EU/AUS and you don't have a confirmed number for their region from a "WINNING REPLIES FROM SIMILAR SITUATIONS" example below, ask: "Where are you based? Pricing varies a bit by region." Then quote US rates as a starting point if forced.

Modifiers:
+ Destination / luxury wedding: +20-30%
+ Multi-day wedding: priced per day of footage
+ Rush (7-10 days): +30-50%
- Repeat client: 10-15% off (but mention flexibility, not a hard discount)

Pricing rules:
- When asked, ALWAYS give a specific number from the table above (or from a retrieved example below).
- Frame it as "I typically charge $X" or "my rate is $X" — Rafay's tone, not "we charge".
- Always offer flexibility: "I'm also open to hearing your budget and adjusting accordingly."
- Repeat clients: lead with relationship recognition, then number.
- If a retrieved example below shows a different number for the same service, TRUST THE EXAMPLE — it's a real past quote.

═══════════════════════════════════════════
TONE
═══════════════════════════════════════════

- Casual but professional. Short sentences. American English.
- Mirror their formality. "Hey dude" → "Hey man". "Dear Rafay" → "Hi [Name]".
- Use their first name once. Not three times — that's creepy.
- Sign off: "Rafay" or "Best, Rafay" — never "Sincerely" or "Warm regards".
- No emoji unless they used one first. Then match their count.
- No corporate filler: "circle back", "touch base", "leverage", "synergy" — banned.

═══════════════════════════════════════════
HARD RULES
═══════════════════════════════════════════

1. Output the reply BODY ONLY. No subject line. No "Here's a draft:". No markdown headers. No bullet lists unless the client used them.
2. 2-6 sentences. Match the length of their last message — don't write 6 sentences when they wrote 2.
3. Plain text. Newlines between paragraphs are fine. No HTML tags.
4. Never invent details (specific dates, specific past projects, names of past clients).
5. Never apologize for things you didn't do ("Sorry for the delay" — only if there actually was one).
6. If the conversation needs human judgment (refund, contract dispute, complaint), keep the reply short and end with "Let me jump on a quick call — what's a good time tomorrow?"`;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callClaude(systemPrompt: string, userPrompt: string, signal?: AbortSignal): Promise<string | null> {
    if (!ANTHROPIC_API_KEY) return null;
    try {
        const res = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
            method: 'POST',
            signal,
            headers: {
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: CLAUDE_MODEL,
                max_tokens: 600,
                temperature: 0.4,
                system: [
                    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
                ],
                messages: [{ role: 'user', content: userPrompt }],
            }),
        });
        if (!res.ok) {
            console.error('[replySuggestion] Claude error', res.status, await res.text());
            return null;
        }
        const data = await res.json();
        const content: string | undefined = data?.content?.[0]?.text;
        const result = (content || '').trim();
        return result || null;
    } catch (e: any) {
        if (e?.name === 'AbortError') return null;
        console.error('[replySuggestion] Claude failed:', e?.message);
        return null;
    }
}

async function callGroq(messages: { role: 'system' | 'user'; content: string }[], signal?: AbortSignal): Promise<string | null> {
    // Try Groq first
    if (GROQ_API_KEY) {
        try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                signal,
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    // Locked to llama-3.1-8b-instant per the zero-AI-cost
                    // directive — Groq's free tier covers it indefinitely.
                    // Was llama-3.3-70b-versatile (also free today but with
                    // tighter rate limits and larger spend exposure).
                    model: 'llama-3.1-8b-instant',
                    messages,
                    max_tokens: 600,
                    temperature: 0.4,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                const content: string | undefined = data?.choices?.[0]?.message?.content;
                const result = (content || '').trim();
                if (result) return result;
            } else {
                console.error('[replySuggestion] Groq error', res.status, await res.text());
            }
        } catch (e: any) {
            if (e?.name === 'AbortError') return null;
            console.error('[replySuggestion] Groq failed, trying Gemini:', e?.message);
        }
    }

    // Fallback to Gemini
    if (GEMINI_API_KEY) {
        try {
            const systemMsg = messages.find(m => m.role === 'system')?.content || '';
            const userMsg = messages.find(m => m.role === 'user')?.content || '';
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemMsg }] },
                    contents: [{ parts: [{ text: userMsg }] }],
                    generationConfig: { maxOutputTokens: 600, temperature: 0.4 },
                }),
            });
            if (res.ok) {
                const data = await res.json();
                const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                return (content || '').trim() || null;
            } else {
                console.error('[replySuggestion] Gemini error', res.status, await res.text());
            }
        } catch (e: any) {
            if (e?.name === 'AbortError') return null;
            console.error('[replySuggestion] Gemini failed:', e?.message);
        }
    }

    return null;
}

function cleanBody(input: string | null | undefined): string {
    if (!input) return '';
    let text = String(input)
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();

    const cutMarkers = ['On ', 'wrote:', '------', 'From:', 'Sent from', '________'];
    for (const marker of cutMarkers) {
        const idx = text.indexOf(marker);
        if (idx > 40) { text = text.slice(0, idx).trim(); break; }
    }

    if (text.length > 1500) text = text.slice(0, 1500) + '…';
    return text;
}

function classifyCategory(clientMsg: string): string {
    const k = clientMsg.toLowerCase();
    if (/\b(price|cost|charge|how much|rate|quote|budget|fee|pricing|charges)\b/.test(k)) return 'PRICING';
    if (/\b(already|not sure|expensive|too much|don't need|not interested|maybe later|think about)\b/.test(k)) return 'OBJECTION';
    if (/\b(turnaround|deadline|deliver|how long|eta|when can|by when)\b/.test(k)) return 'LOGISTICS';
    if (/\b(deal|discount|package|bundle|combo|negotiate)\b/.test(k)) return 'NEGOTIATION';
    if (/\b(footage|upload|drive|dropbox|send.*files|share.*link|wetransfer)\b/.test(k)) return 'ONBOARDING';
    if (/\b(update|check in|following up|any news|status|progress)\b/.test(k)) return 'FOLLOW_UP';
    if (/\b(thank|amazing|love|beautiful|perfect|great work|impressed)\b/.test(k)) return 'FEEDBACK';
    return 'INTRO';
}

interface KnowledgeRow {
    category: string;
    client_question: string;
    our_reply: string;
    outcome: string | null;
    contact_region: string | null;
    price_mentioned: number | null;
    success_score: number;
}

async function fetchTopExamples(clientMsg: string, region: string | null): Promise<KnowledgeRow[]> {
    const category = classifyCategory(clientMsg);
    const cols = 'category, client_question, our_reply, outcome, contact_region, price_mentioned, success_score';

    // Tier 1: verified + region-matched + high score (success_score is 0-1 in miner)
    try {
        let q = supabase.from('jarvis_knowledge').select(cols)
            .eq('category', category)
            .eq('agent_verified', true)
            .gte('success_score', 0.7)
            .order('success_score', { ascending: false })
            .limit(5);
        if (region) q = q.or(`contact_region.eq.${region},contact_region.is.null`);
        const { data } = await q;
        if (data && data.length >= 3) return data as KnowledgeRow[];

        // Tier 2: drop verified filter, drop region constraint
        const { data: t2 } = await supabase.from('jarvis_knowledge').select(cols)
            .eq('category', category)
            .gte('success_score', 0.7)
            .order('success_score', { ascending: false })
            .limit(5);
        if (t2 && t2.length > 0) return t2 as KnowledgeRow[];

        // Tier 3: any examples in this category, prefer recent
        const { data: t3 } = await supabase.from('jarvis_knowledge').select(cols)
            .eq('category', category)
            .order('created_at', { ascending: false })
            .limit(3);
        return (t3 || []) as KnowledgeRow[];
    } catch {
        return [];
    }
}

interface LessonRow {
    category: string;
    client_question: string;
    bad_reply: string;
    why_lost: string;
    lesson: string;
}

async function fetchRelevantLessons(clientMsg: string): Promise<LessonRow[]> {
    const category = classifyCategory(clientMsg);
    try {
        const { data } = await supabase.from('jarvis_lessons')
            .select('category, client_question, bad_reply, why_lost, lesson')
            .eq('category', category)
            .order('created_at', { ascending: false })
            .limit(1);
        return (data || []) as LessonRow[];
    } catch {
        return [];
    }
}

function formatExamplesBlock(examples: KnowledgeRow[]): string {
    if (examples.length === 0) return '';
    const lines = examples.map((ex, i) => {
        const region = ex.contact_region ? ` ${ex.contact_region}` : '';
        const price = ex.price_mentioned ? ` $${ex.price_mentioned}` : '';
        const outcome = ex.outcome ? ` → ${ex.outcome}` : '';
        return `[Example ${i + 1} — ${ex.category}${region}${price}${outcome}]\nClient said: "${ex.client_question.slice(0, 220)}"\nWe replied: "${ex.our_reply.slice(0, 320)}"`;
    });
    return `\n\n═══════════════════════════════════════════\nWINNING REPLIES FROM SIMILAR SITUATIONS\n═══════════════════════════════════════════\nThese are real replies that closed deals. Use the structure and tone — not the literal words.\n\n${lines.join('\n\n')}`;
}

function formatLessonsBlock(lessons: LessonRow[]): string {
    if (lessons.length === 0) return '';
    const lines = lessons.map((l, i) =>
        `[Avoid ${i + 1} — ${l.category}]\nClient asked: "${l.client_question.slice(0, 200)}"\nWe replied (and lost): "${l.bad_reply.slice(0, 200)}"\nWhy it lost: ${l.why_lost}\nLesson: ${l.lesson}`
    );
    return `\n\n═══════════════════════════════════════════\nAVOID — REPLIES THAT LOST DEALS\n═══════════════════════════════════════════\n${lines.join('\n\n')}`;
}

function formatInboxSignalsBlock(signals: ReturnType<typeof extractInboxSignals>): string {
    const flags: string[] = [];
    if (signals.clientMentionedPayment)     flags.push('🟡 Client mentioned PAYMENT — verify before assuming unpaid');
    if (signals.clientAskingAboutDeadline)  flags.push('🟡 Client asked about DEADLINE / timing — answer with a specific date');
    if (signals.clientMentionedFiles)       flags.push('🟡 Client mentioned FILES / footage — confirm Dropbox/Drive link if onboarding');
    if (signals.clientExpressedFrustration) flags.push('🔴 Client expressed FRUSTRATION — open with acknowledgement, not pitch');
    if (signals.daysSinceLastReceived !== null && signals.daysSinceLastReceived > 5) {
        flags.push(`🟡 Client wrote ${signals.daysSinceLastReceived} days ago — soft re-engagement, no guilt`);
    }
    if (flags.length === 0) return '';
    return `\n\n═══════════════════════════════════════════\nINBOX SIGNALS (auto-detected from this thread)\n═══════════════════════════════════════════\n${flags.join('\n')}`;
}

const COACHING_PROMPT = `You are Jarvis — a sales coach for Wedits, a wedding video editing agency. The agent has already sent the last reply in this thread. You are NOT drafting a reply. Instead, give brief coaching feedback.

Rules:
- If the reply looks good → say so in 1 sentence + suggest when to follow up if no response (e.g. "Follow up in 3 days if no reply")
- If something could be improved → give 1 specific tip (e.g. "Next time, mention the free test film to lower the barrier")
- If they forgot to mention pricing when asked → flag it
- If the conversation is waiting for the client → suggest a follow-up timeline
- Keep it to 1-2 sentences max. Be supportive, not critical.
- Output plain text only. No markdown, no headers.`;

export async function generateReplySuggestion(
    contact: SuggestionContact,
    thread: SuggestionMessage[],
    opts?: { forceMode?: 'reply' | 'coach' },
): Promise<{ suggestion: string | null; error?: string; mode?: 'reply' | 'coaching'; modeSource?: 'forced' | 'auto' }> {
    if (!GROQ_API_KEY && !ANTHROPIC_API_KEY) return { suggestion: null, error: 'No AI provider configured (need ANTHROPIC_API_KEY or GROQ_API_KEY)' };
    if (!thread || thread.length === 0) return { suggestion: null, error: 'No thread context available' };

    // forceMode lets the UI override the auto-detected mode (e.g. when sync is racing
    // and the latest inbound hasn't landed in email_messages yet, or when the user
    // genuinely wants to coach a "their turn" thread or draft a follow-up after our SENT).
    const lastMessage = thread[thread.length - 1];
    const autoCoachingMode = lastMessage?.direction === 'SENT';
    const isCoachingMode = opts?.forceMode === 'coach' ? true
        : opts?.forceMode === 'reply' ? false
        : autoCoachingMode;
    const modeSource: 'forced' | 'auto' = opts?.forceMode ? 'forced' : 'auto';

    const slice = thread.slice(-8);
    const formatted = slice.map((m, i) => {
        const who = m.direction === 'SENT' ? 'US' : 'THEM';
        const cleaned = cleanBody(m.body);
        return `[${i + 1}] ${who} (${m.sentAt?.slice(0, 10) || '?'}) — ${m.subject || '(no subject)'}\n${cleaned}`;
    }).join('\n\n---\n\n');

    // Client tier framing — tells the model how much weight this relationship carries
    const tierLine = contact.clientTier && contact.clientTier !== 'NEW'
        ? `Client tier: ${contact.clientTier}${contact.isClient ? ' (active client)' : ''}`
        : null;

    // Financial story — paid/unpaid breakdown is a sharper signal than total alone
    const financialLines: string[] = [];
    if (contact.totalProjects && contact.totalProjects > 0) {
        financialLines.push(`Past projects: ${contact.totalProjects}`);
    }
    if (contact.totalRevenue && contact.totalRevenue > 0) {
        const paid = contact.paidRevenue || 0;
        const unpaid = contact.unpaidAmount || 0;
        if (unpaid > 0) {
            financialLines.push(`Lifetime revenue: $${contact.totalRevenue.toLocaleString()} (paid $${paid.toLocaleString()}, ⚠ unpaid $${unpaid.toLocaleString()})`);
        } else {
            financialLines.push(`Lifetime revenue: $${contact.totalRevenue.toLocaleString()} (fully paid)`);
        }
    }
    if (contact.clientSince) {
        const yearsClient = Math.floor((Date.now() - new Date(contact.clientSince).getTime()) / (365 * 86400000));
        if (yearsClient >= 1) financialLines.push(`Client since: ${contact.clientSince.slice(0, 10)} (${yearsClient}y relationship)`);
    }

    // Relationship health — acknowledged context
    const healthLines: string[] = [];
    if (contact.relationshipHealth && contact.relationshipHealth !== 'neutral') {
        healthLines.push(`Relationship health: ${contact.relationshipHealth}`);
    }
    if (typeof contact.daysSinceLastContact === 'number') {
        if (contact.daysSinceLastContact === 0) healthLines.push('Last contact: today');
        else if (contact.daysSinceLastContact === 1) healthLines.push('Last contact: yesterday');
        else if (contact.daysSinceLastContact < 30) healthLines.push(`Last contact: ${contact.daysSinceLastContact} days ago`);
        else healthLines.push(`Last contact: ${contact.daysSinceLastContact} days ago (cold)`);
    }

    const contactLines = [
        `Contact: ${contact.name || contact.email} <${contact.email}>`,
        contact.company ? `Company: ${contact.company}` : null,
        contact.pipelineStage ? `Pipeline stage: ${contact.pipelineStage}` : null,
        contact.region ? `Region: ${contact.region}` : null,
        contact.contactType ? `Type: ${contact.contactType}` : null,
        tierLine,
        contact.totalEmails ? `Total emails exchanged: ${contact.totalEmails}` : null,
        ...financialLines,
        ...healthLines,
        contact.accountManagerName ? `Account manager (you/AM): ${contact.accountManagerName}` : null,
    ].filter(Boolean).join('\n');

    if (isCoachingMode) {
        // When auto-detected, the last message is SENT (us). When forced, it may not be —
        // so phrase the coaching ask around our most recent SENT message regardless.
        const lastSent = [...thread].reverse().find(m => m.direction === 'SENT');
        const coachTarget = lastSent
            ? `Review our most recent SENT reply and give brief coaching feedback.`
            : `No SENT messages from us in this thread yet. Suggest how the agent should approach the first reply.`;
        const userPrompt = `## THIS CONTACT\n${contactLines}\n\n## RECENT THREAD (oldest first)\n\n${formatted}\n\n${coachTarget}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
            const out = await callGroq([
                { role: 'system', content: COACHING_PROMPT },
                { role: 'user', content: userPrompt },
            ], controller.signal);
            if (!out) return { suggestion: null, mode: 'coaching', modeSource, error: 'Could not generate coaching feedback' };
            return { suggestion: out, mode: 'coaching', modeSource };
        } finally {
            clearTimeout(timeout);
        }
    }

    const lastReceived = [...thread].reverse().find(m => m.direction === 'RECEIVED');
    const lastClientMsg = lastReceived ? cleanBody(lastReceived.body) : '';

    // Compute inbox signals from the same thread (no extra DB hit)
    const signalEmails = thread.slice().reverse().map(m => ({
        direction: m.direction,
        subject: m.subject,
        snippet: cleanBody(m.body).slice(0, 400),
        sent_at: m.sentAt,
    }));
    const inboxSignals = extractInboxSignals(signalEmails);

    // Parallel fetch: top examples + relevant lessons (anti-patterns)
    const [examples, lessons] = await Promise.all([
        fetchTopExamples(lastClientMsg, contact.region || null),
        fetchRelevantLessons(lastClientMsg),
    ]);

    const examplesBlock = formatExamplesBlock(examples);
    const lessonsBlock = formatLessonsBlock(lessons);
    const signalsBlock = formatInboxSignalsBlock(inboxSignals);

    const userPrompt = `## THIS CONTACT\n${contactLines}${signalsBlock}\n\n## RECENT THREAD (oldest first)\n\n${formatted}${examplesBlock}${lessonsBlock}\n\nDraft the next reply from US.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
        // ZERO-COST AI: Claude (via Gloy) is paid — bypass it entirely. Reply
        // drafts are generated by Groq's free Llama 3.1 8B (Gemini fallback).
        // The callClaude function is kept for emergency-only use behind an
        // explicit env flag; default path is Groq-first.
        let out: string | null = null;
        if (process.env.JARVIS_ALLOW_PAID_CLAUDE === 'true') {
            out = await callClaude(SYSTEM_PROMPT, userPrompt, controller.signal);
        }
        if (!out) {
            out = await callGroq([
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ], controller.signal);
        }
        if (!out) return { suggestion: null, modeSource, error: 'Groq and Gemini both failed to generate a draft. Check API keys and rate limits.' };
        return { suggestion: out, mode: 'reply', modeSource };
    } finally {
        clearTimeout(timeout);
    }
}
