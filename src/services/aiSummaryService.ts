/**
 * AI-Powered Relationship Summary
 * Primary: Groq (Llama 3.3 70B — free, fast)
 * Fallback: Google Gemini
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface EmailSnippet {
    date: string;
    direction: 'SENT' | 'RECEIVED';
    subject: string;
    snippet: string;
}

async function callGroq(prompt: string): Promise<string | null> {
    if (!GROQ_API_KEY) return null;
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 2000,
                temperature: 0.7,
            }),
        });
        if (!res.ok) {
            console.error('[AI:Groq] Error:', res.status, await res.text());
            return null;
        }
        const data = await res.json();
        return data?.choices?.[0]?.message?.content || null;
    } catch (e: any) {
        console.error('[AI:Groq] Failed:', e.message);
        return null;
    }
}

async function callGemini(prompt: string): Promise<string | null> {
    if (!GEMINI_API_KEY) return null;
    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
                }),
            }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e: any) {
        console.error('[AI:Gemini] Failed:', e.message);
        return null;
    }
}

export async function generateAIRelationshipSummary(
    contactName: string,
    contactEmail: string,
    emails: EmailSnippet[],
    pipelineStage: string,
): Promise<string> {
    if (!GROQ_API_KEY && !GEMINI_API_KEY) return 'AI unavailable — no API key configured.';
    if (emails.length === 0) return 'No email history found for this contact.';

    const timeline = emails.map(e => {
        const dir = e.direction === 'SENT' ? '→ YOU SENT' : '← THEY REPLIED';
        const content = e.snippet || e.subject || '';
        return `[${e.date}] ${dir}\nSubject: ${e.subject}\n${content}\n`;
    }).join('\n---\n');

    const prompt = `You are a sales relationship analyst for a wedding video editing agency called Wedits.

Analyze this email history between our sales agent (Rafay) and a prospect/client.

Contact: ${contactName} (${contactEmail})
Current Pipeline Stage: ${pipelineStage}
Total Emails: ${emails.length} (${emails.filter(e => e.direction === 'SENT').length} sent, ${emails.filter(e => e.direction === 'RECEIVED').length} received)

EMAIL TIMELINE:
${timeline}

Generate a relationship audit in this EXACT format:

## ${contactName} — Relationship Summary

### The Timeline
[Group emails into phases with dates. For each phase, write 1-2 sentences explaining what happened. Include direct quotes from emails when relevant. Be specific about what was discussed - pricing, projects, deadlines, etc.]

### What Went Right
[Bullet points of positive moments - replies, deals discussed, interest shown]

### What Went Wrong
[Bullet points of mistakes - missed follow-ups, broken promises, ghosting, wrong approach. Be honest and specific.]

### Opportunities
[What can be done to improve this relationship. Specific actionable steps.]

### Suggested Next Email
[Write a complete ready-to-send email. CRITICAL RULES FOR THIS EMAIL:
1. Study Rafay's ACTUAL writing style from the sent emails above — his tone, word choices, greetings, sign-offs, sentence length, use of slang/casual language
2. Match the energy of how the CLIENT communicates — if they're casual, be casual. If they're formal, be formal. If they use emojis, use emojis.
3. Reference SPECIFIC details from past conversations (project names, prices discussed, feedback given)
4. The email must sound EXACTLY like Rafay wrote it, not like an AI. Copy his patterns — how he starts emails, how he transitions, how he signs off
5. If there was a mistake (ghosting, missed deadline), acknowledge it the way Rafay naturally would based on his past emails
6. DO NOT use corporate language like "I hope this email finds you well" or "I wanted to reach out" — use Rafay's actual style]

IMPORTANT RULES:
- READ EVERY EMAIL CAREFULLY — the full content is provided, not just snippets
- Be brutally honest about mistakes (missed deadlines, ghosting, broken promises)
- Reference specific dates, prices, project names, and details from the emails
- Include DIRECT QUOTES from their replies — use their exact words
- Identify pricing discussed, deals made, feedback given
- Note any promises made and whether they were kept
- The suggested email must feel deeply personal, reference specific past events
- If they ghosted or we ghosted, say so directly with the exact date gap
- If pricing was discussed, mention the exact numbers
- If there was negative feedback, quote it exactly
- WRITING STYLE: Study how Rafay writes in his SENT emails. Notice his greeting style (Hey/Hi/Hello), his casual phrases (man, bro, no worries), his sign-off style. The suggested email MUST sound like him, not like ChatGPT
- MATCH CLIENT ENERGY: If the client writes short casual messages, write short. If they write long detailed ones, match that. Mirror their communication style`;

    // Try Groq first (faster), then Gemini as fallback
    const result = await callGroq(prompt) || await callGemini(prompt);
    return result || 'AI summary failed. Please try again in a moment.';
}
