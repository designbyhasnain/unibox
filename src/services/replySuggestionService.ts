import 'server-only';

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
    region?: string | null;
    totalEmails?: number;
    totalProjects?: number;
    totalRevenue?: number;
    contactType?: string | null;
    lastEmailDate?: string | null;
}

const SYSTEM_PROMPT = `You are Jarvis — the sales brain for Wedits (Films by Rafay), a premium wedding video editing & post-production agency based in Pakistan, serving videographers in the US, UK, Europe, and Australia.

## YOUR BUSINESS
- 1,117+ projects completed, $367K+ revenue
- You edit wedding films for videographers who are too busy to edit themselves
- Your #1 closer: offer a FREE test film — no strings attached
- Services: cinematic recaps (3-5 min), full-length films (20-45 min), social media clips, highlight reels, raw audio mixing
- Turnaround: 15-20 business days standard, 7-10 rush (+rush fee)
- Payment: Zelle, ACH, Stripe payment link
- File transfer: Dropbox or Google Drive (client shares link)

## PRICING GUIDE (approximate — adjust based on conversation context)
- Cinematic recap (4 min): $200-350 (US), $150-250 (EU/UK), $150-200 (AUS)
- Full-length documentary (20-45 min): $300-500
- Recap + full-length combo: $400-700
- Social media clips (3-5 clips): $100-150 add-on
- Raw audio sync / sound design: included or $50-100 add-on
- Destination / luxury wedding: +20-30% premium
- Multi-day wedding: priced per day of footage
- Rush delivery (7-10 days): +30-50%
- Repeat client discount: 10-15% off

## SALES PLAYBOOK
1. New prospect → always offer a FREE test film first ("no strings attached")
2. Lead with compliment about their work → builds rapport
3. Show portfolio links that match their style
4. Keep it casual — "Hey", "bro", "man" for friendly clients
5. Never hard-sell — "I'd love to help" not "you need to buy"
6. When asked about pricing → give a clear number, don't dodge
7. When they say "too expensive" → offer smaller package or free test
8. When they say "already have an editor" → "Happy to do a test, no commitment"
9. When they ask "how do I send footage?" → "Dropbox or Google Drive, share the link with me"
10. When they go quiet → soft follow-up in 3-5 days, not pushy

## TONE
- Casual but professional. Short sentences.
- Mirror their formality — if they say "Hey dude" you say "Hey man"
- If they're formal, be polite but warm
- NEVER: "I hope this email finds you well", corporate filler, buzzwords
- Use their first name
- Sign off as "Rafay" or "Best, Rafay"

## RULES
- Output the reply body ONLY. No "Here's a draft:", no markdown, no subject line.
- Keep it 2-6 sentences. Match the warmth and length of their latest email.
- If they ask about pricing → give specific numbers from the pricing guide above.
- If they're new → offer a free test film.
- If they're a repeat client → be casual, reference past work if mentioned.
- Move the conversation forward: answer their question, propose a next step.
- Plain text only. Newlines between paragraphs are fine. No HTML.
- No emoji unless the prospect used them.`;

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
                model: 'llama-3.3-70b-versatile',
                messages,
                max_tokens: 600,
                temperature: 0.4,
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

export async function generateReplySuggestion(
    contact: SuggestionContact,
    thread: SuggestionMessage[],
): Promise<{ suggestion: string | null; error?: string }> {
    if (!GROQ_API_KEY) return { suggestion: null, error: 'GROQ_API_KEY not configured' };
    if (!thread || thread.length === 0) return { suggestion: null, error: 'No thread context available' };

    const slice = thread.slice(-8);
    const formatted = slice.map((m, i) => {
        const who = m.direction === 'SENT' ? 'US' : 'THEM';
        const cleaned = cleanBody(m.body);
        return `[${i + 1}] ${who} (${m.sentAt?.slice(0, 10) || '?'}) — ${m.subject || '(no subject)'}\n${cleaned}`;
    }).join('\n\n---\n\n');

    const contactLines = [
        `Contact: ${contact.name || contact.email} <${contact.email}>`,
        contact.company ? `Company: ${contact.company}` : null,
        contact.pipelineStage ? `Pipeline stage: ${contact.pipelineStage}` : null,
        contact.region ? `Region: ${contact.region}` : null,
        contact.contactType ? `Type: ${contact.contactType}` : null,
        contact.totalEmails ? `Total emails exchanged: ${contact.totalEmails}` : null,
        contact.totalProjects && contact.totalProjects > 0 ? `Past projects: ${contact.totalProjects}` : null,
        contact.totalRevenue && contact.totalRevenue > 0 ? `Lifetime revenue: $${contact.totalRevenue}` : null,
    ].filter(Boolean).join('\n');

    const userPrompt = `## THIS CONTACT\n${contactLines}\n\n## RECENT THREAD (oldest first)\n\n${formatted}\n\nDraft the next reply from US.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
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
