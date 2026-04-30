import 'server-only';

import {
    getPipelineStats, getRevenueAnalytics,
    getRegionBreakdown, getEmailAccounts,
    JARVIS_TOOLS, executeJarvisTool, JARVIS_SYSTEM_PROMPT,
} from './jarvisService';

// ── Agent Goals Table ───────────────────────────────────────────────────────

export type AgentGoal = {
    id: string;
    goal: string;
    status: 'PLANNING' | 'EXECUTING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
    plan: AgentStep[];
    progress: string;
    metrics: Record<string, number>;
    createdAt: string;
    updatedAt: string;
    logs: string[];
};

export type AgentStep = {
    id: number;
    action: string;
    description: string;
    status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';
    result?: string;
    toolCalls?: string[];
};

// ── The Agent Brain ─────────────────────────────────────────────────────────

const AGENT_SYSTEM_PROMPT = `${JARVIS_SYSTEM_PROMPT}

## AGENT MODE — You are now an AUTONOMOUS AGENT, not a chatbot.

When given a GOAL, you must:
1. THINK — analyze the goal, check what data/tools you have
2. PLAN — create a numbered step-by-step plan (max 10 steps)
3. EXECUTE — run each step by calling tools
4. EVALUATE — check if you're making progress toward the goal
5. REPORT — summarize what was done and what's next

### Response Format for Planning
When asked to create a plan, respond with JSON:
\`\`\`json
{
  "plan": [
    {"id": 1, "action": "RESEARCH", "description": "Search CRM for all Australian filmmakers"},
    {"id": 2, "action": "SEGMENT", "description": "Group by cold/warm/closed status"},
    {"id": 3, "action": "DRAFT", "description": "Write 5-step email sequence for cold outreach"},
    {"id": 4, "action": "CAMPAIGN", "description": "Create campaign with account rotation"},
    {"id": 5, "action": "MONITOR", "description": "Track replies and meetings booked"}
  ],
  "estimated_impact": "500 emails → 25 replies → 8 meetings in 2 weeks",
  "accounts_needed": 10,
  "duration_days": 14
}
\`\`\`

### Response Format for Execution
When executing a step, call the relevant tools and respond with:
\`\`\`json
{
  "step_id": 1,
  "status": "DONE",
  "result": "Found 847 Australian contacts: 305 CLOSED, 200 LEAD, 342 COLD_LEAD",
  "next_action": "Segment these contacts by email activity"
}
\`\`\`

### Key Rules
- Always verify data before acting — don't assume, query the CRM
- When creating campaigns, specify: target contacts, email template, sending accounts, daily limits
- Track metrics: emails_sent, replies, opens, meetings_booked
- If a step fails, log it and try an alternative approach
- Be aggressive but smart — maximize volume while protecting email deliverability`;

// ── Create a plan for a goal ────────────────────────────────────────────────

export async function createAgentPlan(goal: string): Promise<{
    plan: AgentStep[];
    analysis: string;
    estimatedImpact: string;
}> {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw new Error('GROQ_API_KEY not set');

    // First, gather context about the current state
    const [pipeline, revenue, regions, accounts] = await Promise.all([
        getPipelineStats(),
        getRevenueAnalytics(),
        getRegionBreakdown(),
        getEmailAccounts(),
    ]);

    const contextMessage = `
CURRENT CRM STATE:
- Pipeline: ${JSON.stringify(pipeline)}
- Revenue: Total $${revenue.totalRevenue}, Avg/month $${revenue.avgMonthlyRevenue}, Avg/project $${revenue.avgProjectValue}
- Active email accounts: ${accounts.filter((a: any) => a.status === 'ACTIVE').length} accounts
- Top regions: ${regions.slice(0, 10).map((r: any) => `${r.region}(${r.count})`).join(', ')}

GOAL: ${goal}

Create a detailed plan to achieve this goal. Use the JSON format specified. Think step by step about what tools and data you need.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
                { role: 'system', content: AGENT_SYSTEM_PROMPT },
                { role: 'user', content: contextMessage },
            ],
            temperature: 0.2,
            max_tokens: 2000,
        }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse the plan from the response
    let plan: AgentStep[] = [];
    let estimatedImpact = '';

    try {
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[1]);
            plan = (parsed.plan || []).map((s: any, i: number) => ({
                id: s.id || i + 1,
                action: s.action || 'EXECUTE',
                description: s.description || '',
                status: 'PENDING' as const,
            }));
            estimatedImpact = parsed.estimated_impact || '';
        }
    } catch {
        // If JSON parsing fails, create a basic plan
        plan = [
            { id: 1, action: 'RESEARCH', description: 'Analyze target audience in CRM', status: 'PENDING' },
            { id: 2, action: 'SEGMENT', description: 'Segment contacts by stage and region', status: 'PENDING' },
            { id: 3, action: 'DRAFT', description: 'Create email sequence templates', status: 'PENDING' },
            { id: 4, action: 'LAUNCH', description: 'Create and launch campaign', status: 'PENDING' },
            { id: 5, action: 'MONITOR', description: 'Track results and adjust', status: 'PENDING' },
        ];
    }

    return {
        plan,
        analysis: content,
        estimatedImpact,
    };
}

// ── Execute a single step ───────────────────────────────────────────────────

export async function executeAgentStep(
    goal: string,
    step: AgentStep,
    previousResults: string[],
): Promise<{ status: 'DONE' | 'FAILED'; result: string; data?: any }> {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw new Error('GROQ_API_KEY not set');

    const contextMessage = `
GOAL: ${goal}

PREVIOUS STEPS COMPLETED:
${previousResults.map((r, i) => `Step ${i + 1}: ${r}`).join('\n')}

CURRENT STEP: #${step.id} — ${step.action}: ${step.description}

Execute this step by calling the appropriate tools. Be thorough and specific.`;

    // Call Groq with tools
    let messages: any[] = [
        { role: 'system', content: AGENT_SYSTEM_PROMPT },
        { role: 'user', content: contextMessage },
    ];

    let iterations = 5;
    let lastResult = '';

    while (iterations-- > 0) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages,
                tools: JARVIS_TOOLS,
                tool_choice: 'auto',
                temperature: 0.2,
                max_tokens: 2000,
            }),
        });

        if (!response.ok) {
            return { status: 'FAILED', result: `API error: ${response.status}` };
        }

        const data = await response.json();
        const assistantMsg = data.choices?.[0]?.message;

        if (!assistantMsg?.tool_calls || assistantMsg.tool_calls.length === 0) {
            lastResult = assistantMsg?.content || 'Step completed';
            break;
        }

        messages.push({
            role: 'assistant',
            content: assistantMsg.content || '',
            tool_calls: assistantMsg.tool_calls,
        });

        for (const tc of assistantMsg.tool_calls) {
            let args;
            try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

            let result;
            try {
                result = await executeJarvisTool(tc.function.name, args);
            } catch (err) {
                result = { error: `Tool failed: ${err}` };
            }

            // Format concisely
            let resultStr: string;
            if (Array.isArray(result)) {
                const items = result.slice(0, 10).map((item: any) =>
                    [item.name, item.email, item.location, item.pipeline_stage, item.total_revenue ? '$' + item.total_revenue : null].filter(Boolean).join(' | ')
                );
                resultStr = `${result.length} results:\n${items.join('\n')}${result.length > 10 ? '\n+' + (result.length - 10) + ' more' : ''}`;
            } else {
                resultStr = JSON.stringify(result, null, 2).slice(0, 3000);
            }

            messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: resultStr,
            });
        }
    }

    return { status: 'DONE', result: lastResult };
}

// ── Run the full agent autonomously ─────────────────────────────────────────

// Streaming agent — reserved for future WebSocket implementation
// For now, use runAgentSync below

export async function runAgentSync(goal: string): Promise<{
    plan: AgentStep[];
    results: string[];
    summary: string;
}> {
    // 1. Create plan
    const { plan, estimatedImpact } = await createAgentPlan(goal);

    // 2. Execute each step
    const results: string[] = [];
    const executedPlan = [...plan];

    for (let i = 0; i < executedPlan.length; i++) {
        const step = executedPlan[i]!;
        step.status = 'RUNNING';

        try {
            const { status, result } = await executeAgentStep(goal, step, results);
            step.status = status === 'DONE' ? 'DONE' : 'FAILED';
            step.result = result;
            results.push(`${step.action}: ${result}`);
        } catch (err) {
            step.status = 'FAILED';
            step.result = `Error: ${err}`;
            results.push(`${step.action}: FAILED - ${err}`);
        }
    }

    // 3. Generate summary
    const groqKey = process.env.GROQ_API_KEY!;
    const summaryResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
                { role: 'system', content: 'You are JARVIS. Summarize the agent execution results concisely. Include: what was done, key findings, recommended next actions.' },
                { role: 'user', content: `GOAL: ${goal}\n\nESTIMATED IMPACT: ${estimatedImpact}\n\nRESULTS:\n${results.join('\n\n')}` },
            ],
            temperature: 0.2,
            max_tokens: 1500,
        }),
    });

    const summaryData = await summaryResponse.json();
    const summary = summaryData.choices?.[0]?.message?.content || 'Agent completed.';

    return { plan: executedPlan, results, summary };
}
