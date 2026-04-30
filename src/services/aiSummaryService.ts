import 'server-only';
/**
 * AI-Powered Relationship Audit
 *
 * The Boardroom: Alex Hormozi (value/offer strategy) + Gary Vee (attention/hustle)
 * + Jeremy Miner (NEPQ sales methodology) analyze every email and craft the perfect next move.
 *
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
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: prompt },
                ],
                max_tokens: 4000,
                temperature: 0.8,
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
                    contents: [{ parts: [{ text: SYSTEM_PROMPT + '\n\n' + prompt }] }],
                    generationConfig: { temperature: 0.8, maxOutputTokens: 4000 },
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

const SYSTEM_PROMPT = `You are THREE people sitting at a boardroom table, analyzing a sales relationship for a wedding video editing agency. This is not a casual review — this is a WAR ROOM. Every email is revenue on the table.

PERSON 1 — ALEX HORMOZI (Value Architect):
You see every interaction through the lens of VALUE. What value was offered? What value was received? Where is the Grand Slam Offer? Where did we leave money on the table? You calculate the lifetime value of this client and what it SHOULD be. You find the gap between what we're charging and what we could charge. You identify where we failed to stack value or create irresistible offers. You think in terms of: "How do we make this so good they feel stupid saying no?"

PERSON 2 — GARY VEE (Attention & Hustle Strategist):
You see every interaction through the lens of ATTENTION and SPEED. Did we reply fast enough? Did we lose their attention? Are we creating enough touchpoints? Where did we get lazy? You're brutally honest about hustle — if we ghosted someone for 2 weeks, you call that out HARD. You think about the long game — even if this deal is dead, what's the 10-year relationship worth? You think about leverage — can this client refer others? What content could come from this relationship? You see every client as a node in a network, not a transaction.

PERSON 3 — JEREMY MINER (NEPQ Sales Master):
You write the suggested next email. You use Neuro-Emotional Persuasion Questions — questions that make the prospect FEEL the problem and sell themselves on the solution. You NEVER pitch directly. You ask questions that create micro-commitments. You use tonality markers (? at end of statements to soften). You use "just out of curiosity" and "would it help if" and "what would it mean for you if". You match the prospect's communication style EXACTLY — their slang, their emoji usage, their sentence length. You study every sent email from Rafay and clone his writing DNA.

ALL THREE OF YOU ARE:
- Brutally honest — no sugar coating
- Obsessed with specific numbers and dates from the actual emails
- Quoting exact words the prospect used
- Identifying the EXACT moment we lost momentum (or gained it)
- Treating this like a $100,000 deal even if it's a $300 project — because the RELATIONSHIP is worth $100K over time`;

export async function generateAIRelationshipSummary(
    contactName: string,
    contactEmail: string,
    emails: EmailSnippet[],
    pipelineStage: string,
): Promise<string> {
    if (!GROQ_API_KEY && !GEMINI_API_KEY) return 'AI unavailable — no API key configured.';
    if (emails.length === 0) return 'No email history found for this contact.';

    const sentEmails = emails.filter(e => e.direction === 'SENT');
    const receivedEmails = emails.filter(e => e.direction === 'RECEIVED');

    // Calculate response times
    const responseTimes: string[] = [];
    for (let i = 1; i < emails.length; i++) {
        const curr = emails[i]!;
        const prev = emails[i-1]!;
        if (curr.direction !== prev.direction) {
            const gap = Math.round((new Date(curr.date).getTime() - new Date(prev.date).getTime()) / (1000 * 60 * 60));
            responseTimes.push(`${prev.direction === 'SENT' ? 'They' : 'We'} responded in ${gap}h`);
        }
    }

    // Find the last message and who sent it
    const lastEmail = emails[emails.length - 1]!;
    const daysSinceLastContact = Math.round((Date.now() - new Date(lastEmail.date).getTime()) / (1000 * 60 * 60 * 24));
    const whoSentLast = lastEmail.direction === 'SENT' ? 'WE sent the last email (ball is in THEIR court)' : 'THEY sent the last email (ball is in OUR court — WE need to respond)';

    const timeline = emails.map(e => {
        const dir = e.direction === 'SENT' ? '→ RAFAY SENT' : '← CLIENT REPLIED';
        return `[${e.date}] ${dir}\nSubject: ${e.subject}\n${e.snippet}\n`;
    }).join('\n---\n');

    const prompt = `CONTACT: ${contactName} (${contactEmail})
PIPELINE STAGE: ${pipelineStage}
TOTAL EMAILS: ${emails.length} (${sentEmails.length} sent by us, ${receivedEmails.length} received from them)
RESPONSE PATTERNS: ${responseTimes.join(' | ') || 'No back-and-forth yet'}
LAST CONTACT: ${daysSinceLastContact} days ago — ${whoSentLast}
LAST EMAIL SUBJECT: "${lastEmail.subject}"

═══════════════════════════════════════════════════
COMPLETE EMAIL HISTORY (read EVERY word):
═══════════════════════════════════════════════════

${timeline}

═══════════════════════════════════════════════════

Now analyze this relationship. Output in this EXACT format:

## ${contactName} — The Boardroom Audit

### HORMOZI's Take: The Value Gap
[Alex analyzes: What value did we offer vs what they need? What's their potential lifetime value? Where did we leave money on the table? What would a Grand Slam Offer look like for this specific client? What's the pricing conversation — did we anchor correctly? Did we stack enough value? Calculate: if this client does 10 projects/year at $X, that's $Y lifetime. Are we treating them like a $Y relationship or a one-off transaction?]

### GARY VEE's Take: The Attention Audit
[Gary audits: How fast did we respond? Any gaps where we went silent? Did we lose momentum? What's the hustle score (1-10)? Where did we get LAZY? Is there a referral opportunity? Could this person introduce us to 5 other filmmakers? What's the NETWORK value beyond this one deal? Rate our follow-up game. Call out every time we waited too long.]

### The Relationship Score Card
| Metric | Score | Notes |
|--------|-------|-------|
| Response Speed | X/10 | [specific data] |
| Value Delivery | X/10 | [what was promised vs delivered] |
| Follow-Up Consistency | X/10 | [gaps identified] |
| Offer Strength | X/10 | [was it irresistible?] |
| Relationship Depth | X/10 | [transactional vs real] |
| **Overall** | **X/10** | |

### Critical Moments (The Turning Points)
[List the 2-3 specific moments that MADE or BROKE this relationship. Quote exact emails. Include dates. Be specific: "On March 5, they asked about pricing and we waited 4 days to respond — that killed the momentum."]

### JEREMY MINER's Next Email
[Jeremy writes the EXACT next email to send. Rules:
1. Clone Rafay's writing DNA — study his sent emails above. Copy his greetings, his casual tone, his sign-offs EXACTLY
2. Use NEPQ: Open with a situation question, then a problem awareness question, then a solution awareness question
3. If they ghosted: Use a "break-up" pattern — "Totally understand if the timing isn't right..."
4. If we ghosted: Acknowledge it authentically in Rafay's voice — no corporate apology
5. If deal is active: Create urgency with a time-sensitive value add
6. Reference the LAST specific thing they said or asked about
7. NEVER sound like AI. Sound like a real human who actually read the conversation
8. If they showed interest in pricing: Don't pitch. Ask "just out of curiosity, what would having X done for you mean for your business?"
9. End with ONE clear question — not a statement, a QUESTION that demands a response
10. Keep it SHORT. Match the length of their messages. If they write 2 lines, you write 3 max.]

### The $100K Play (Long-Term Strategy)
[All three advisors agree on: What's the 12-month plan for this relationship? Not just this deal — the LIFETIME play. How do we turn this $${sentEmails.length > 0 ? '300' : '0'} contact into a $10,000/year client? What would make them refer 3 friends? What's the upsell path?]`;

    const result = await callGroq(prompt) || await callGemini(prompt);
    return result || 'AI audit failed. Please try again in a moment.';
}
