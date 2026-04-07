import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../src/lib/auth';
import { JARVIS_TOOLS, JARVIS_SYSTEM_PROMPT, executeJarvisTool } from '../../../src/services/jarvisService';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { messages } = await req.json();

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 500 });

    // Build conversation with system prompt
    const fullMessages = [
        { role: 'system', content: JARVIS_SYSTEM_PROMPT },
        ...messages,
    ];

    // Call Groq with tools — loop until no more tool calls
    let maxIterations = 8;
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
            console.error('[Jarvis] Groq error:', response.status, errText);
            // On second+ iteration failure, return what we have so far
            const toolResults = currentMessages.filter((m: any) => m.role === 'tool');
            if (toolResults.length > 0) {
                return NextResponse.json({
                    reply: `I gathered some data but hit an error processing it. Here's what I found:\n\n${toolResults.map((t: any) => t.content).join('\n\n')}`,
                    toolsUsed: toolResults.map((t: any) => t.tool_call_id),
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
                result = await executeJarvisTool(name, args);
            } catch (err) {
                console.error(`[Jarvis] Tool error (${name}):`, err);
                result = { error: `Tool ${name} failed` };
            }

            currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result).slice(0, 8000),
            } as any);
        }
    }

    return NextResponse.json({ error: 'Too many tool calls' }, { status: 500 });
}
