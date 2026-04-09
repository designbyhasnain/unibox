import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../src/lib/auth';
import { JARVIS_TOOLS, JARVIS_SYSTEM_PROMPT, executeJarvisTool } from '../../../src/services/jarvisService';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { messages } = await req.json();

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 500 });

    // Build conversation — keep system prompt short, limit history
    const recentMessages = messages.slice(-10); // Keep last 10 messages to avoid context overflow
    const fullMessages = [
        { role: 'system', content: JARVIS_SYSTEM_PROMPT },
        ...recentMessages,
    ];

    // Call Groq with tools — loop until no more tool calls
    let maxIterations = 5;
    let currentMessages = [...fullMessages];

    while (maxIterations-- > 0) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
                temperature: 0.3,
                max_tokens: 4096,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('[Jarvis] Groq error:', response.status, errText.slice(0, 500));
            console.error('[Jarvis] Messages count:', currentMessages.length, 'Total chars:', JSON.stringify(currentMessages).length);
            // On second+ iteration failure, summarize what we found
            const toolResults = currentMessages.filter((m: any) => m.role === 'tool');
            if (toolResults.length > 0) {
                const summary = toolResults.map((t: any) => t.content).join('\n\n').slice(0, 3000);
                return NextResponse.json({
                    reply: `Here's what I found:\n\n${summary}`,
                    toolsUsed: [],
                });
            }
            return NextResponse.json({ error: 'AI service error', detail: errText.slice(0, 200) }, { status: 502 });
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        const assistantMessage = choice?.message;

        if (!assistantMessage) {
            return NextResponse.json({ error: 'No response from AI' }, { status: 502 });
        }

        // If no tool calls, we're done — return the final response
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
            return NextResponse.json({
                reply: assistantMessage.content,
                toolsUsed: currentMessages.filter((m: any) => m.role === 'tool').map((m: any) => m.name),
            });
        }

        // Process tool calls
        // Groq requires content to be string or null, ensure proper format
        currentMessages.push({
            role: 'assistant',
            content: assistantMessage.content || '',
            tool_calls: assistantMessage.tool_calls,
        });

        for (const toolCall of assistantMessage.tool_calls) {
            const { name, arguments: argsStr } = toolCall.function;
            let args;
            try {
                args = JSON.parse(argsStr);
            } catch {
                args = {};
            }

            console.log(`[Jarvis] Tool call: ${name}`, args);
            let result;
            try {
                result = await executeJarvisTool(name, args, session.userId);
            } catch (err) {
                console.error(`[Jarvis] Tool error (${name}):`, err);
                result = { error: `Tool ${name} failed` };
            }

            // Format result concisely for the LLM — avoid raw JSON dumps
            let resultStr: string;
            if (Array.isArray(result)) {
                // Summarize arrays: show first 10 items with key fields only
                const summary = result.slice(0, 10).map((item: any) => {
                    if (item.name || item.email) {
                        return [item.name, item.email, item.location, item.pipeline_stage, item.total_revenue ? '$' + item.total_revenue : null, item.total_projects ? item.total_projects + ' projects' : null, item.unpaid_amount ? 'UNPAID $' + item.unpaid_amount : null].filter(Boolean).join(' | ');
                    }
                    if (item.region) {
                        return `${item.region}: ${item.count} contacts, $${item.revenue} revenue`;
                    }
                    return JSON.stringify(item).slice(0, 150);
                });
                resultStr = `Found ${result.length} results:\n${summary.join('\n')}${result.length > 10 ? '\n... and ' + (result.length - 10) + ' more' : ''}`;
            } else if (result && typeof result === 'object') {
                // For complex objects (briefings, financial health), format key fields
                const keys = Object.keys(result);
                const formatted = keys.map(k => {
                    const v = (result as any)[k];
                    if (Array.isArray(v)) return `${k}: ${v.length} items — ${JSON.stringify(v.slice(0, 3)).slice(0, 200)}`;
                    if (typeof v === 'object' && v !== null) return `${k}: ${JSON.stringify(v).slice(0, 200)}`;
                    return `${k}: ${v}`;
                });
                resultStr = formatted.join('\n').slice(0, 2500);
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
