import 'server-only';

import { supabase } from '../lib/supabase';

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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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
                    model: 'llama-3.3-70b-versatile',
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

async function fetchRelevantExamples(lastClientMsg: string, region: string | null): Promise<string> {
    try {
        const keywords = lastClientMsg.toLowerCase();
        let category = 'INTRO';
        if (keywords.includes('price') || keywords.includes('cost') || keywords.includes('charge') || keywords.includes('how much') || keywords.includes('rate') || keywords.includes('quote') || keywords.includes('budget')) {
            category = 'PRICING';
        } else if (keywords.includes('already') || keywords.includes('not sure') || keywords.includes('expensive') || keywords.includes('too much') || keywords.includes("don't need") || keywords.includes('not interested')) {
            category = 'OBJECTION';
        } else if (keywords.includes('turnaround') || keywords.includes('deadline') || keywords.includes('deliver') || keywords.includes('how long') || keywords.includes('when')) {
            category = 'LOGISTICS';
        } else if (keywords.includes('deal') || keywords.includes('discount') || keywords.includes('package') || keywords.includes('bundle')) {
            category = 'NEGOTIATION';
        } else if (keywords.includes('footage') || keywords.includes('upload') || keywords.includes('drive') || keywords.includes('dropbox') || keywords.includes('send') || keywords.includes('file')) {
            category = 'ONBOARDING';
        } else if (keywords.includes('update') || keywords.includes('check in') || keywords.includes('follow') || keywords.includes('any news')) {
            category = 'FOLLOW_UP';
        }

        let query = supabase
            .from('jarvis_knowledge')
            .select('category, client_question, our_reply, outcome, contact_region, price_mentioned')
            .eq('category', category)
            .order('success_score', { ascending: false })
            .limit(5);

        if (region) {
            query = query.eq('contact_region', region);
        }

        const { data } = await query;

        if (!data || data.length === 0) {
            const { data: fallback } = await supabase
                .from('jarvis_knowledge')
                .select('category, client_question, our_reply, outcome, contact_region, price_mentioned')
                .eq('category', category)
                .order('success_score', { ascending: false })
                .limit(3);
            if (!fallback || fallback.length === 0) return '';
            return formatExamples(fallback);
        }

        return formatExamples(data.slice(0, 3));
    } catch {
        return '';
    }
}

function formatExamples(examples: Array<{ category: string; client_question: string; our_reply: string; outcome: string; contact_region: string | null; price_mentioned: number | null }>): string {
    if (examples.length === 0) return '';

    const lines = examples.map((ex, i) => {
        const regionTag = ex.contact_region ? ` [${ex.contact_region}]` : '';
        const priceTag = ex.price_mentioned ? ` ($${ex.price_mentioned})` : '';
        return `Example ${i + 1} (${ex.category}${regionTag}${priceTag} → ${ex.outcome}):\nClient: "${ex.client_question.slice(0, 200)}"\nWe replied: "${ex.our_reply.slice(0, 300)}"`;
    });

    return `\n## WINNING REPLIES FROM SIMILAR SITUATIONS\nThese are real replies that led to closed deals. Use them as style/content reference:\n\n${lines.join('\n\n')}`;
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
): Promise<{ suggestion: string | null; error?: string; mode?: 'reply' | 'coaching' }> {
    if (!GROQ_API_KEY) return { suggestion: null, error: 'GROQ_API_KEY not configured' };
    if (!thread || thread.length === 0) return { suggestion: null, error: 'No thread context available' };

    const lastMessage = thread[thread.length - 1];
    const isCoachingMode = lastMessage?.direction === 'SENT';

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

    if (isCoachingMode) {
        const userPrompt = `## THIS CONTACT\n${contactLines}\n\n## RECENT THREAD (oldest first)\n\n${formatted}\n\nThe last message was sent by US. Review our reply and give brief coaching feedback.`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
            const out = await callGroq([
                { role: 'system', content: COACHING_PROMPT },
                { role: 'user', content: userPrompt },
            ], controller.signal);
            if (!out) return { suggestion: null, mode: 'coaching', error: 'Could not generate coaching feedback' };
            return { suggestion: out, mode: 'coaching' };
        } finally {
            clearTimeout(timeout);
        }
    }

    const lastReceived = [...thread].reverse().find(m => m.direction === 'RECEIVED');
    const lastClientMsg = lastReceived ? cleanBody(lastReceived.body) : '';
    const examples = await fetchRelevantExamples(lastClientMsg, contact.region || null);

    const userPrompt = `## THIS CONTACT\n${contactLines}\n\n## RECENT THREAD (oldest first)\n\n${formatted}${examples}\n\nDraft the next reply from US.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
        const out = await callGroq([
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
        ], controller.signal);
        if (!out) return { suggestion: null, error: 'Both Groq and Gemini failed to generate a draft. Check API keys and rate limits.' };
        return { suggestion: out, mode: 'reply' };
    } finally {
        clearTimeout(timeout);
    }
}
