import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../src/lib/auth';
import { JARVIS_TOOLS, JARVIS_SYSTEM_PROMPT, executeJarvisTool } from '../../../src/services/jarvisService';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Jarvis tools expose business data (revenue, top clients, AM performance,
    // pipeline). VIDEO_EDITOR has no business reason to query them.
    if (session.role === 'VIDEO_EDITOR') {
        return NextResponse.json({ error: 'Jarvis is not available for this role' }, { status: 403 });
    }

    const { messages } = await req.json();

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 500 });

    // Keep last 12 messages (was 6 — too short to remember a back-and-forth
    // about the same contact across a few turns). Tool results still get
    // truncated below at 60k chars so the upgrade doesn't blow the budget.
    const recentMessages = messages.slice(-12);

    // Personalize the system prompt with the logged-in user's identity. The
    // 70B model uses this to:
    //   • greet them with a role-specific honorific (CEO / sales hero / etc.)
    //   • address them by first name in subsequent replies
    //   • scope generic phrasings like "my clients" / "my pipeline" /
    //     "how am I doing" to data filtered by account_manager_id = userId
    //   • give CEO/ADMIN-level overviews only when role === 'ADMIN', else
    //     keep the focus on the user's own portfolio
    // session.role / session.userId are already enforced server-side by
    // executeJarvisTool; this prefix is a *focus hint*, not an auth check.
    const firstName = (session.name || 'there').split(/\s+/)[0];
    // Role → playful honorific. Used in the greeting only (every-reply
    // repetition is annoying). New roles fall through to "champ".
    const HONORIFICS: Record<string, string> = {
        ADMIN: 'CEO',
        SALES: 'sales hero',
        VIDEO_EDITOR: 'edit master',
        ACCOUNT_MANAGER: 'sales hero',
    };
    // Per-account overrides — for users who run the company but don't
    // sit in the ADMIN row (e.g. founder logged in as a SALES / AM seat
    // for operational reasons). These also lift the scope rule to ADMIN
    // behaviour so the CEO sees CEO data regardless of DB role.
    //
    // Add new CEO emails here (lower-case). The match is case-insensitive
    // because session.email passes through the same toLowerCase below.
    const CEO_EMAILS = new Set<string>([
        'mustafakamran5@gmail.com',
        'designsbyhasnain@gmail.com',   // Design By Hasnain — already ADMIN, belt-and-suspenders
        'hasnainsiddike6@gmail.com',    // Hasnain Siddike — DB role is AM, but he's the CEO
    ]);
    const isCEO = CEO_EMAILS.has((session.email || '').toLowerCase());
    const isAdmin = session.role === 'ADMIN' || isCEO;
    const honorific = isCEO ? 'CEO' : (HONORIFICS[session.role] || 'champ');

    const identityPrefix = `## SPEAKING WITH

You are in a voice / chat session with the user known internally as **${session.name}** (userId \`${session.userId}\`, role \`${session.role}\`, email \`${session.email}\`).

**Form of address — IMPORTANT:**
- Always address them by **title only**: "${honorific}". Never use their first or last name in your replies.
- Greeting examples (use one of these patterns on the first turn or when the user says hi):
  - "Good morning, ${honorific}."
  - "Hey ${honorific} — …"
  - "Evening, ${honorific}."
- On subsequent turns, just speak normally without re-stating the title every sentence. The title is for greeting and the occasional emphasis, not every clause.
- Do **NOT** insert their name (${session.name}, ${firstName}, or any variant) into replies. If you need to refer to them, say "you" or repeat the title.

**Reply length — VOICE MODE:**
- Keep every reply **short**: ideally 1-2 sentences, max 4. The user is hearing this through TTS, not reading it. Long replies = long wait + tedious playback.
- If they want detail, they'll ask "tell me more". Until then, give the headline answer first.
- No bullet points or markdown — this gets read aloud.

**Scope rule:**
- When the user says "my", "I", "me", "my clients", "my pipeline", "my numbers", "how am I doing", scope your insights to **their** portfolio — the contacts where account_manager_id = "${session.userId}". Use the tools that accept a userId argument to fetch that slice.
${isAdmin
    ? `- The user is an ADMIN (${honorific}) — they may also ask about *another* account manager by name ("how is Shayan doing?"). Use \`search_contacts\`/\`get_am_performance\` filtered by that AM's name when they do.`
    : `- The user is **not** an admin. Do not surface CEO-wide totals (revenue, pipeline counts, top clients of other AMs) — those are visible above for context only. Keep replies focused on their own work.`}
- If the user says "this is ${firstName}" / "good morning, ${firstName} here" — that's identity confirmation. Acknowledge with the title only ("Good morning, ${honorific}"), do not repeat the name back.

`;

    const fullMessages = [
        { role: 'system', content: identityPrefix + JARVIS_SYSTEM_PROMPT },
        ...recentMessages,
    ];

    let maxIterations = 3; // Reduced from 5 to prevent context bloat
    let currentMessages = [...fullMessages];
    const toolsUsed: string[] = [];

    while (maxIterations-- > 0) {
        // Check context size — trim if too large
        const contextSize = JSON.stringify(currentMessages).length;
        if (contextSize > 60000) {
            currentMessages = currentMessages.map((m: any) => {
                if (m.role === 'tool' && m.content && m.content.length > 500) {
                    return { ...m, content: m.content.slice(0, 500) + '\n... (truncated)' };
                }
                return m;
            });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25_000); // 25s timeout

        // 70B is the primary; 8B is the safety net. The 70B model can hit
        // per-minute token limits (free tier especially) or transient
        // upstream errors that simply work on the smaller model. Try 70B
        // first; on any non-2xx, transparently retry with 8B before
        // surfacing an error to the user.
        const MODEL_PRIMARY = 'llama-3.3-70b-versatile';
        const MODEL_FALLBACK = 'llama-3.1-8b-instant';

        let response: Response;
        let primaryFailedStatus = 0;
        let primaryFailedBody = '';
        const callGroq = (model: string): Promise<Response> => fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: currentMessages,
                tools: JARVIS_TOOLS,
                tool_choice: 'auto',
                temperature: 0.4,
                max_tokens: 2048,
            }),
            signal: controller.signal,
        });
        try {
            response = await callGroq(MODEL_PRIMARY);
            if (!response.ok) {
                primaryFailedStatus = response.status;
                primaryFailedBody = await response.clone().text().catch(() => '');
                console.warn(`[Jarvis] ${MODEL_PRIMARY} returned ${primaryFailedStatus}; falling back to ${MODEL_FALLBACK}. Body: ${primaryFailedBody.slice(0, 200)}`);
                response = await callGroq(MODEL_FALLBACK);
            }
        } catch (fetchErr: unknown) {
            clearTimeout(timeout);
            const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
            // On timeout or network error, return collected tool results if any
            if (toolsUsed.length > 0) {
                const toolResults = currentMessages
                    .filter((m: any) => m.role === 'tool')
                    .map((m: any) => m.content)
                    .join('\n\n')
                    .slice(0, 3000);
                return NextResponse.json({
                    reply: `Here's what I found:\n\n${toolResults}`,
                    toolsUsed,
                });
            }
            return NextResponse.json(
                { error: isAbort ? 'AI request timed out. Try a simpler question.' : 'AI service unreachable' },
                { status: 504 }
            );
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            const errText = await response.text().catch(() => 'Unknown error');
            // Surface BOTH the primary failure (if it triggered the fallback)
            // AND the fallback failure. With logs unreliable in some Vercel
            // configs, this is the only place these statuses show up.
            console.error('[Jarvis] Groq error final:', response.status, errText.slice(0, 300));
            if (primaryFailedStatus) {
                console.error(`[Jarvis] Primary ${MODEL_PRIMARY} ${primaryFailedStatus}: ${primaryFailedBody.slice(0, 300)}`);
            }

            // If we have tool results, try a simpler summarization call without tools
            if (toolsUsed.length > 0) {
                const toolResults = currentMessages
                    .filter((m: any) => m.role === 'tool')
                    .map((m: any) => m.content)
                    .join('\n')
                    .slice(0, 3000);

                try {
                    const retryRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${groqKey}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            model: 'llama-3.3-70b-versatile',
                            messages: [
                                { role: 'system', content: `You are Jarvis, an AI executive assistant for Wedits (wedding video editing company). You are speaking with ${session.name} (role: ${session.role}). Address them by first name. Summarize the data below in a natural, conversational way — concise and insightful. ${isAdmin ? 'Brief them like a CEO.' : `Keep the focus on ${session.name}'s own portfolio; don't surface other AMs' figures.`}` },
                                { role: 'user', content: `The user asked: "${recentMessages[recentMessages.length - 1]?.content || 'briefing'}"\n\nHere is the data from our CRM tools:\n\n${toolResults}` },
                            ],
                            temperature: 0.4,
                            max_tokens: 1500,
                        }),
                    });

                    if (retryRes.ok) {
                        const retryData = await retryRes.json();
                        const reply = retryData.choices?.[0]?.message?.content;
                        if (reply) return NextResponse.json({ reply, toolsUsed });
                    }
                } catch { /* fall through */ }

                // Last resort — return formatted tool results
                return NextResponse.json({
                    reply: `Here's your data:\n\n${toolResults}`,
                    toolsUsed,
                });
            }

            // Try to extract Groq's user-facing message so the client (and
            // the spoken reply) can show *what* went wrong, not just a
            // generic "AI service error". Common cases: rate limit hit,
            // invalid model name, request too large, etc.
            let groqMsg = '';
            try {
                const parsed = JSON.parse(errText);
                groqMsg = parsed?.error?.message || parsed?.error?.code || '';
            } catch { /* errText wasn't JSON */ }
            const detail = groqMsg ? `: ${groqMsg.slice(0, 180)}` : ` (status ${response.status})`;
            return NextResponse.json(
                { error: `AI service error${detail}`, primaryStatus: primaryFailedStatus || undefined },
                { status: 502 }
            );
        }

        const data = await response.json();
        const assistantMessage = data.choices?.[0]?.message;

        if (!assistantMessage) {
            return NextResponse.json({ error: 'No response from AI' }, { status: 502 });
        }

        // If no tool calls, return the response
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
            return NextResponse.json({
                reply: assistantMessage.content,
                toolsUsed,
            });
        }

        // Process tool calls
        currentMessages.push({
            role: 'assistant',
            content: assistantMessage.content || '',
            tool_calls: assistantMessage.tool_calls,
        });

        for (const toolCall of assistantMessage.tool_calls) {
            const { name, arguments: argsStr } = toolCall.function;
            let args;
            try { args = JSON.parse(argsStr); } catch { args = {}; }

            console.log(`[Jarvis] Tool: ${name}`, JSON.stringify(args).slice(0, 100));
            toolsUsed.push(name);

            let result;
            try {
                result = await executeJarvisTool(name, args, session.userId);
            } catch (err) {
                console.error(`[Jarvis] Tool error (${name}):`, err);
                result = { error: `Tool ${name} failed` };
            }

            // Format result concisely — keep under 1500 chars per tool
            let resultStr: string;
            if (Array.isArray(result)) {
                const items = result.slice(0, 8).map((item: any) => {
                    if (item.name || item.email) {
                        return [item.name, item.location, item.pipeline_stage, item.total_revenue ? '$' + item.total_revenue : null, item.unpaid_amount ? 'unpaid:$' + item.unpaid_amount : null].filter(Boolean).join(' | ');
                    }
                    if (item.region) return `${item.region}: ${item.count} contacts, $${item.revenue}`;
                    return JSON.stringify(item).slice(0, 100);
                });
                resultStr = `${result.length} results:\n${items.join('\n')}`;
            } else if (result && typeof result === 'object') {
                const entries = Object.entries(result).map(([k, v]) => {
                    if (Array.isArray(v)) return `${k}: ${JSON.stringify(v).slice(0, 150)}`;
                    if (typeof v === 'object' && v !== null) return `${k}: ${JSON.stringify(v).slice(0, 150)}`;
                    return `${k}: ${v}`;
                });
                resultStr = entries.join('\n').slice(0, 1500);
            } else {
                resultStr = String(result);
            }

            currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: resultStr,
            } as any);
        }
    }

    return NextResponse.json({ error: 'Too many tool calls' }, { status: 500 });
}
