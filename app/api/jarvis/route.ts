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
    //   • address the user by name ("Morning, Shayan…")
    //   • scope generic phrasings like "my clients" / "my pipeline" /
    //     "how am I doing" to data filtered by account_manager_id = userId
    //   • give CEO/ADMIN-level overviews only when role === 'ADMIN', else
    //     keep the focus on the user's own portfolio
    // session.role / session.userId are already enforced server-side by
    // executeJarvisTool; this prefix is a *focus hint*, not an auth check.
    const isAdmin = session.role === 'ADMIN';
    const identityPrefix = `## SPEAKING WITH

You are in a voice / chat session with **${session.name}** — userId \`${session.userId}\`, role \`${session.role}\`, email \`${session.email}\`.

Address them by their first name. Match their conversational register: short, warm, direct.

**Scope rule:**
- When ${session.name} says "my", "I", "me", "my clients", "my pipeline", "my numbers", "how am I doing", scope your insights to **their** portfolio — the contacts where account_manager_id = "${session.userId}". Use the tools that accept a userId argument to fetch that slice.
${isAdmin
    ? `- ${session.name} is an ADMIN — they may also ask about *another* account manager by name ("how is Shayan doing?"). Use \`search_contacts\`/\`get_am_performance\` filtered by that AM's name when they do.`
    : `- ${session.name} is **not** an admin. Do not surface CEO-wide totals (revenue, pipeline counts, top clients of other AMs) — those are visible above for context only. Keep replies focused on ${session.name}'s own work.`}
- If the user says "${session.name} here" / "this is ${session.name}" / "good morning ${session.name} here" — that's just identity confirmation, not a permission change. Greet them, then proceed normally.

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

        let response: Response;
        try {
            response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${groqKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: currentMessages,
                    tools: JARVIS_TOOLS,
                    tool_choice: 'auto',
                    temperature: 0.4,
                    max_tokens: 2048,
                }),
                signal: controller.signal,
            });
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
            console.error('[Jarvis] Groq error:', response.status, errText.slice(0, 300));

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

            return NextResponse.json({ error: 'AI service error. Try a simpler question.' }, { status: 502 });
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
