import 'server-only';

/**
 * Jarvis Suggested Replies
 *
 * Reads the last few messages in a thread + basic contact info and asks
 * Groq (Llama 3.1 8B Instant — free & fast) to draft a short, polite,
 * on-brand reply the user can paste into the composer.
 *
 * Keep output as plain text (no HTML, no signature). The composer lets the
 * user edit before sending — we optimise for something they can ship in
 * two keystrokes.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;

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
}

const SYSTEM_PROMPT = `You are Jarvis — a sales assistant for a wedding video production agency. You draft the NEXT reply the user should send.

Rules:
- Output the reply body ONLY. No "Here's a draft:", no markdown, no subject line, no signature.
- Keep it short: 2–5 sentences. Match the warmth and length of the latest incoming email.
- Mirror the sender's tone — casual if they were casual, formal if they were formal.
- Move the conversation forward: answer open questions, propose a concrete next step, or acknowledge if nothing actionable is needed.
- Do NOT invent prices, dates, deliverables, or commitments that weren't already discussed.
- Never use "I hope this email finds you well" or any corporate filler. Write like a human.
- Plain text only. Newlines between paragraphs are fine. No HTML, no emoji unless the prospect used them.`;

async function callGroq(messages: { role: 'system' | 'user'; content: string }[], signal?: AbortSignal): Promise<string | null> {
    if (!GROQ_API_KEY) return null;
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            signal,
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages,
                max_tokens: 350,
                temperature: 0.6,
            }),
        });
        if (!res.ok) {
            console.error('[replySuggestion] Groq error', res.status, await res.text());
            return null;
        }
        const data = await res.json();
        const content: string | undefined = data?.choices?.[0]?.message?.content;
        return (content || '').trim() || null;
    } catch (e: any) {
        if (e?.name === 'AbortError') return null;
        console.error('[replySuggestion] Groq call failed:', e?.message || e);
        return null;
    }
}

/** Strip quoted/forwarded fluff so the model focuses on the actual message. */
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

    if (text.length > 1200) text = text.slice(0, 1200) + '…';
    return text;
}

export async function generateReplySuggestion(
    contact: SuggestionContact,
    thread: SuggestionMessage[],
): Promise<{ suggestion: string | null; error?: string }> {
    if (!GROQ_API_KEY) return { suggestion: null, error: 'GROQ_API_KEY not configured' };
    if (!thread || thread.length === 0) return { suggestion: null, error: 'No thread context available' };

    // Use last 6 messages for context. Oldest first so the model can follow the narrative.
    const slice = thread.slice(-6);
    const formatted = slice.map((m, i) => {
        const who = m.direction === 'SENT' ? 'US' : 'THEM';
        const cleaned = cleanBody(m.body);
        return `[${i + 1}] ${who} (${m.sentAt?.slice(0, 10) || '?'}) — ${m.subject || '(no subject)'}\n${cleaned}`;
    }).join('\n\n---\n\n');

    const header = [
        `Contact: ${contact.name || contact.email} <${contact.email}>`,
        contact.company ? `Company: ${contact.company}` : null,
        contact.pipelineStage ? `Pipeline: ${contact.pipelineStage}` : null,
    ].filter(Boolean).join('\n');

    const userPrompt = `${header}\n\nRecent thread (oldest first):\n\n${formatted}\n\nDraft the next reply from US, ready to paste into the composer.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
        const out = await callGroq([
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
        ], controller.signal);
        if (!out) return { suggestion: null, error: 'Jarvis returned no draft' };
        return { suggestion: out };
    } finally {
        clearTimeout(timeout);
    }
}
