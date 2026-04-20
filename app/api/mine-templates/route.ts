import { getSession } from '../../../src/lib/auth';
import { supabase } from '../../../src/lib/supabase';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function callClaude(systemPrompt: string, userPrompt: string, temp = 0.3): Promise<string | null> {
    if (!ANTHROPIC_API_KEY) return null;
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4000,
                temperature: temp,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            }),
        });
        if (res.ok) {
            const data = await res.json();
            return data?.content?.[0]?.text || null;
        }
        console.error('[MineTemplates:Claude] Status:', res.status, await res.text().catch(() => ''));
    } catch (e: any) {
        console.error('[MineTemplates:Claude] Error:', e.message);
    }
    return null;
}

async function callGemini(systemPrompt: string, userPrompt: string, temp = 0.3): Promise<string | null> {
    if (!GEMINI_API_KEY) return null;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
                generationConfig: { temperature: temp, maxOutputTokens: 4000 },
            }),
        });
        if (res.ok) {
            const data = await res.json();
            return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
        }
        console.error('[MineTemplates:Gemini] Status:', res.status);
    } catch (e: any) {
        console.error('[MineTemplates:Gemini] Error:', e.message);
    }
    return null;
}

async function callGroq(systemPrompt: string, userPrompt: string, temp = 0.3): Promise<string | null> {
    if (!GROQ_API_KEY) return null;
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                max_tokens: 4000, temperature: temp,
            }),
        });
        if (res.ok) {
            const data = await res.json();
            return data?.choices?.[0]?.message?.content || null;
        }
        console.error('[MineTemplates:Groq] Status:', res.status);
    } catch (e: any) {
        console.error('[MineTemplates:Groq] Error:', e.message);
    }
    return null;
}

async function callAI(systemPrompt: string, userPrompt: string, temp = 0.3): Promise<string | null> {
    return await callClaude(systemPrompt, userPrompt, temp) || await callGroq(systemPrompt, userPrompt, temp) || await callGemini(systemPrompt, userPrompt, temp);
}

const SYSTEM = `You are a sales email template extraction expert for a wedding video editing agency (Unibox). Convert real sent emails into reusable templates.

RULES:
- PRESERVE the exact tone, structure, and persuasion techniques
- REPLACE recipient-specific details with {{placeholders}}
- KEEP emotional hooks and NEPQ questions intact
- DO NOT add filler or change length
- Match the original register exactly

AVAILABLE PLACEHOLDERS: {{first_name}}, {{last_name}}, {{company}}, {{location}}, {{project_name}}, {{quote_amount}}, {{sample_link}}, {{portfolio_link}}, {{meeting_date}}, {{season}}, {{deliverable}}, {{timeline}}, {{style}}

Always respond with valid JSON only — no markdown fences.`;

export async function GET(request: Request) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${CRON_SECRET}`) {
        const session = await getSession();
        if (!session || (session.role !== 'ADMIN' && session.role !== 'ACCOUNT_MANAGER')) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        // 1. Fetch recent sent emails with decent body length
        const { data: sentEmails, error } = await supabase
            .from('email_messages')
            .select('id, subject, body, email_type, from_email, to_email, contact_id, opened_at, thread_id, sent_at')
            .eq('direction', 'SENT')
            .not('body', 'is', null)
            .not('subject', 'ilike', '%delivery status%')
            .not('subject', 'ilike', '%undeliverable%')
            .not('subject', 'ilike', '%out of office%')
            .not('from_email', 'ilike', '%noreply%')
            .order('sent_at', { ascending: false })
            .limit(300);

        if (error || !sentEmails?.length) {
            return Response.json({ success: false, error: 'No sent emails found', detail: error?.message });
        }

        // 2. Filter: body > 80 chars, dedupe by subject
        const seenSubjects = new Set<string>();
        const qualified = sentEmails.filter(e => {
            const clean = stripHtml(e.body || '');
            if (clean.length < 80) return false;
            const subKey = (e.subject || '').toLowerCase().replace(/^(re:|fwd:)\s*/gi, '').trim();
            if (seenSubjects.has(subKey)) return false;
            seenSubjects.add(subKey);
            return true;
        });

        if (qualified.length === 0) {
            return Response.json({ success: false, error: 'No qualifying emails (need body > 80 chars)' });
        }

        // 3. Check which threads got replies
        const threadIds = [...new Set(qualified.map(e => e.thread_id).filter(Boolean))];
        const repliedThreads = new Set<string>();
        if (threadIds.length > 0) {
            const { data: replies } = await supabase
                .from('email_messages')
                .select('thread_id')
                .eq('direction', 'RECEIVED')
                .in('thread_id', threadIds.slice(0, 500))
                .limit(5000);
            (replies || []).forEach(r => repliedThreads.add(r.thread_id));
        }

        // 4. Score and rank emails
        const scored = qualified.map(e => ({
            ...e,
            score: (repliedThreads.has(e.thread_id) ? 10 : 0) + (e.opened_at ? 3 : 0) + (e.email_type === 'OUTREACH_FIRST' ? 2 : 0),
            gotReply: repliedThreads.has(e.thread_id),
        })).sort((a, b) => b.score - a.score);

        // Take top 25
        const top = scored.slice(0, 25);

        // 5. Send to AI for clustering
        const topSlice = top.slice(0, 15);
        const summaries = topSlice.map((e, i) =>
            `[${i}] Subject: ${(e.subject || '').substring(0, 80)}\nPreview: ${stripHtml(e.body || '').substring(0, 150)}`
        ).join('\n---\n');

        const clusterPrompt = `Pick the 5-8 BEST emails below to convert into reusable sales templates for a wedding video editing agency. Group by purpose, pick ONE per group.

EMAILS:
${summaries}

JSON array response:
[{"email_index": 0, "template_name": "short name", "category": "COLD_OUTREACH|FOLLOW_UP|RETARGETING|PROJECT_UPDATE|GENERAL"}]`;

        const clusterResult = await callAI(SYSTEM, clusterPrompt);
        if (!clusterResult) {
            return Response.json({ success: false, error: 'AI clustering failed — all providers returned null', debug: { hasClaude: !!ANTHROPIC_API_KEY, hasGroq: !!GROQ_API_KEY, hasGemini: !!GEMINI_API_KEY, emailCount: topSlice.length } });
        }

        let clusters: Array<{ email_index: number; template_name: string; category: string }>;
        try {
            const cleaned = clusterResult.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            clusters = JSON.parse(cleaned);
        } catch {
            return Response.json({ success: false, error: 'AI returned invalid JSON for clustering', raw: clusterResult.substring(0, 500) });
        }

        // 6. Batch-extract all selected emails in ONE AI call to avoid rate limits
        const existing = await supabase.from('email_templates').select('name').limit(200);
        const existingNames = new Set((existing.data || []).map((t: any) => t.name.toLowerCase()));

        const validClusters = clusters.filter(c => {
            const email = top[c.email_index];
            return email && !existingNames.has(c.template_name.toLowerCase());
        });

        // Build batch extraction prompt
        const batchEntries = await Promise.all(validClusters.map(async (cluster) => {
            const email = top[cluster.email_index]!;
            let contact: any = null;
            if (email.contact_id) {
                const { data: c } = await supabase
                    .from('contacts')
                    .select('name, email, company, location')
                    .eq('id', email.contact_id)
                    .single();
                contact = c;
            }
            return {
                cluster,
                email,
                contactInfo: `Name=${contact?.name || 'Unknown'}, Company=${contact?.company || 'Unknown'}, Location=${contact?.location || 'Unknown'}`,
            };
        }));

        const batchPrompt = `Convert each of these ${batchEntries.length} emails into reusable templates. Replace specific names/companies/dates with {{placeholders}}.

${batchEntries.map((entry, i) => `--- EMAIL ${i} ---
Template name: ${entry.cluster.template_name}
Category: ${entry.cluster.category}
Contact: ${entry.contactInfo}
Subject: ${entry.email.subject}
Body: ${stripHtml(entry.email.body || '').substring(0, 800)}`).join('\n\n')}

Respond with a JSON array (one per email):
[{"index": 0, "subject": "templatized subject", "body": "templatized body with {{placeholders}}", "variables_used": ["first_name"]}]`;

        // Wait 2s to avoid Groq rate limit after clustering call
        await new Promise(r => setTimeout(r, 2000));

        const batchResult = await callAI(SYSTEM, batchPrompt);
        let created = 0;
        const results: Array<{ name: string; category: string; variables: string[] }> = [];

        if (batchResult) {
            try {
                const cleaned = batchResult.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const parsed: Array<{ index: number; subject: string; body: string; variables_used?: string[] }> = JSON.parse(cleaned);

                const session = await getSession();
                const userId = session?.userId || '';

                for (const item of parsed) {
                    const entry = batchEntries[item.index];
                    if (!entry) continue;

                    const { error: insertError } = await supabase.from('email_templates').insert({
                        name: entry.cluster.template_name,
                        subject: item.subject || entry.email.subject,
                        body: item.body || stripHtml(entry.email.body || ''),
                        category: entry.cluster.category || 'GENERAL',
                        is_shared: true,
                        created_by_id: userId,
                        usage_count: 0,
                        updated_at: new Date().toISOString(),
                    });

                    if (!insertError) {
                        created++;
                        results.push({
                            name: entry.cluster.template_name,
                            category: entry.cluster.category,
                            variables: item.variables_used || [],
                        });
                    }
                }
            } catch (parseErr: any) {
                console.error('[MineTemplates] Batch parse error:', parseErr.message);
            }
        }

        return Response.json({
            success: true,
            analyzed: sentEmails.length,
            qualified: qualified.length,
            withReplies: scored.filter(e => e.gotReply).length,
            clustered: clusters.length,
            created,
            templates: results,
        });
    } catch (e: any) {
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}

// POST for cron/QStash
export async function POST(request: Request) {
    return GET(request);
}
