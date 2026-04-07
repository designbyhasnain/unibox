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
            return NextResponse.json({ error: 'AI service error', detail: errText }, { status: 502 });
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
        currentMessages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
            const { name, arguments: argsStr } = toolCall.function;
            let args;
            try {
                args = JSON.parse(argsStr);
            } catch {
                args = {};
            }

            console.log(`[Jarvis] Tool call: ${name}`, args);
            const result = await executeJarvisTool(name, args);

            currentMessages.push({
                role: 'tool' as const,
                tool_call_id: toolCall.id,
                name,
                content: JSON.stringify(result).slice(0, 8000), // Truncate large results
            } as any);
        }
    }

    return NextResponse.json({ error: 'Too many tool calls' }, { status: 500 });
}
