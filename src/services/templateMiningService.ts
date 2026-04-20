import 'server-only';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callGroqForTemplates(prompt: string, temperature = 0.3, maxTokens = 4000): Promise<string | null> {
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
                messages: [
                    { role: 'system', content: TEMPLATE_SYSTEM_PROMPT },
                    { role: 'user', content: prompt },
                ],
                max_tokens: maxTokens,
                temperature,
            }),
        });
        if (!res.ok) {
            console.error('[TemplateMining:Groq] Error:', res.status);
            return null;
        }
        const data = await res.json();
        return data?.choices?.[0]?.message?.content || null;
    } catch (e: any) {
        console.error('[TemplateMining:Groq] Failed:', e.message);
        return null;
    }
}

async function callGeminiForTemplates(prompt: string): Promise<string | null> {
    if (!GEMINI_API_KEY) return null;
    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: TEMPLATE_SYSTEM_PROMPT + '\n\n' + prompt }] }],
                    generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
                }),
            }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e: any) {
        console.error('[TemplateMining:Gemini] Failed:', e.message);
        return null;
    }
}

async function callAI(prompt: string): Promise<string | null> {
    return await callGroqForTemplates(prompt) || await callGeminiForTemplates(prompt);
}

const TEMPLATE_SYSTEM_PROMPT = `You are a sales email template extraction expert for a wedding video editing agency. You convert real sent emails into reusable templates with merge variables.

RULES:
- PRESERVE the exact tone, cadence, and persuasion structure
- REPLACE recipient-specific details with {{placeholders}}
- KEEP emotional hooks, pattern interrupts, and persuasion techniques intact
- DO NOT add filler — match the original length exactly
- DO NOT make it more "professional" — match the original register

AVAILABLE PLACEHOLDERS:
{{first_name}}, {{last_name}}, {{company}}, {{location}}, {{project_name}},
{{quote_amount}}, {{sample_link}}, {{portfolio_link}}, {{meeting_date}},
{{season}}, {{deliverable}}, {{timeline}}, {{style}}

Always respond with valid JSON only — no markdown, no code fences.`;

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface TemplateSuggestion {
    name: string;
    subject: string;
    body: string;
    category: string;
    variables: string[];
    sourceEmailId?: string;
    performance?: { replyCount: number; wasOpened: boolean };
}

export async function extractTemplateFromEmail(
    email: { subject: string; body: string; email_type?: string; to_email?: string },
    contact?: { name?: string; company?: string; location?: string; email?: string } | null,
): Promise<TemplateSuggestion | null> {
    const cleanBody = stripHtml(email.body || '');
    if (cleanBody.length < 30) return null;

    const prompt = `Convert this sent email into a reusable template.

CONTACT INFO (for replacement detection):
Name: ${contact?.name || 'Unknown'}
Company: ${contact?.company || 'Unknown'}
Location: ${contact?.location || 'Unknown'}
Email: ${contact?.email || email.to_email || 'Unknown'}

ORIGINAL SUBJECT: ${email.subject || 'No subject'}

ORIGINAL BODY:
${cleanBody.substring(0, 2000)}

Respond in JSON:
{
  "name": "short template name (max 60 chars)",
  "subject": "templatized subject with {{placeholders}}",
  "body": "templatized body with {{placeholders}}",
  "category": "COLD_OUTREACH|FOLLOW_UP|RETARGETING|PROJECT_UPDATE|GENERAL",
  "variables_used": ["first_name", "company"]
}`;

    const result = await callAI(prompt);
    if (!result) return null;

    try {
        const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        const categoryMap: Record<string, string> = {
            'OUTREACH_FIRST': 'COLD_OUTREACH',
            'FOLLOW_UP': 'FOLLOW_UP',
            'CONVERSATIONAL': 'GENERAL',
        };

        return {
            name: parsed.name || 'Untitled Template',
            subject: parsed.subject || email.subject,
            body: parsed.body || cleanBody,
            category: parsed.category || categoryMap[email.email_type || ''] || 'GENERAL',
            variables: parsed.variables_used || [],
        };
    } catch {
        console.error('[TemplateMining] Failed to parse AI response');
        return null;
    }
}

export async function clusterAndExtractTemplates(
    emails: Array<{
        id: string;
        subject: string;
        body: string;
        email_type: string | null;
        reply_count: number;
        was_opened: boolean;
        to_email: string;
        contact_id: string | null;
    }>,
): Promise<TemplateSuggestion[]> {
    if (emails.length === 0) return [];

    const emailSummaries = emails.slice(0, 30).map((e, i) =>
        `[${i}] Type: ${e.email_type || 'UNKNOWN'} | Replies: ${e.reply_count} | Subject: ${e.subject}\nBody preview: ${stripHtml(e.body || '').substring(0, 200)}`
    ).join('\n---\n');

    const clusterPrompt = `Analyze these ${Math.min(emails.length, 30)} winning sent emails (emails that got replies). Group them into 5-8 template categories. For each, pick the SINGLE BEST email by index.

EMAILS:
${emailSummaries}

Respond in JSON array:
[{
  "category_name": "descriptive name",
  "best_email_index": 0,
  "template_name": "short template name",
  "category_code": "COLD_OUTREACH|FOLLOW_UP|RETARGETING|PROJECT_UPDATE|GENERAL"
}]`;

    const clusterResult = await callAI(clusterPrompt);
    if (!clusterResult) return [];

    let clusters: Array<{ best_email_index: number; template_name: string; category_code: string }>;
    try {
        const cleaned = clusterResult.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        clusters = JSON.parse(cleaned);
    } catch {
        console.error('[TemplateMining] Failed to parse cluster response');
        return [];
    }

    const results: TemplateSuggestion[] = [];
    for (const cluster of clusters) {
        const email = emails[cluster.best_email_index];
        if (!email) continue;

        const suggestion = await extractTemplateFromEmail(
            { subject: email.subject, body: email.body, email_type: email.email_type || undefined, to_email: email.to_email },
            null,
        );
        if (suggestion) {
            suggestion.name = cluster.template_name || suggestion.name;
            suggestion.category = cluster.category_code || suggestion.category;
            suggestion.sourceEmailId = email.id;
            suggestion.performance = { replyCount: email.reply_count, wasOpened: email.was_opened };
            results.push(suggestion);
        }
    }

    return results;
}
