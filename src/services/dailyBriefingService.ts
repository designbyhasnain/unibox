import 'server-only';
import { supabase } from '../lib/supabase';

/**
 * Jarvis Daily Briefing — role-aware 24h summary.
 *
 * Three code paths (ADMIN, SALES, VIDEO_EDITOR) each gather the data
 * that role can legitimately see, then Groq llama-3.1-8b-instant turns
 * it into 3-4 short bullet points.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SINCE_MS = 24 * 60 * 60 * 1000;
const SYSTEM_PROMPT = `You are Jarvis, the CRM's briefing analyst. Produce a Daily Briefing for the user in 3-4 short bullet points. Each bullet must be:
- one line, starts with "• "
- concrete: mention a number, name, or percentage from the data
- actionable when possible ("reply to X", "send a follow-up to Y", "deadline on Z")
No preamble, no markdown, no headers — just the bullets.`;

export type DailyBriefing = {
    role: 'ADMIN' | 'SALES' | 'VIDEO_EDITOR';
    summary: string | null;
    generatedAt: string;
    stats: Record<string, number | string | null>;
    error?: string;
};

async function callGroq(userPrompt: string, signal?: AbortSignal): Promise<string | null> {
    if (!GROQ_API_KEY) return null;
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            signal,
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: 300,
                temperature: 0.5,
            }),
        });
        if (!res.ok) { console.error('[dailyBriefing] Groq', res.status, await res.text()); return null; }
        const data = await res.json();
        return (data?.choices?.[0]?.message?.content || '').trim() || null;
    } catch (e: any) {
        if (e?.name !== 'AbortError') console.error('[dailyBriefing] Groq failed:', e?.message);
        return null;
    }
}

function withTimeout<T>(p: Promise<T>, ms = 12_000): Promise<T> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    return p.finally(() => clearTimeout(t));
}

// ── ADMIN ────────────────────────────────────────────────────────────────────
async function adminBriefing(): Promise<DailyBriefing> {
    const since = new Date(Date.now() - SINCE_MS).toISOString();
    const now = new Date();
    const generatedAt = now.toISOString();

    const [sentRes, recvRes, newLeadsRes, closedRes, healthRes] = await Promise.all([
        supabase.from('email_messages').select('id', { count: 'exact', head: true })
            .eq('direction', 'SENT').gte('sent_at', since),
        supabase.from('email_messages').select('id', { count: 'exact', head: true })
            .eq('direction', 'RECEIVED').eq('is_spam', false).gte('sent_at', since),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('projects').select('project_value')
            .eq('paid_status', 'PAID').gte('project_date', since).limit(200),
        supabase.from('gmail_accounts').select('status, sync_fail_count'),
    ]);

    const sent = sentRes.count || 0;
    const replies = recvRes.count || 0;
    const newLeads = newLeadsRes.count || 0;
    const deals = (closedRes.data || []).length;
    const revenue = (closedRes.data || []).reduce((s: number, p: any) => s + (p.project_value || 0), 0);
    const accounts = healthRes.data || [];
    const accError = accounts.filter((a: any) => a.status === 'ERROR').length;
    const accActive = accounts.filter((a: any) => a.status === 'ACTIVE').length;

    const stats = {
        emailsSent: sent,
        repliesReceived: replies,
        replyRatePct: sent > 0 ? Math.round((replies / sent) * 1000) / 10 : 0,
        newLeads,
        dealsClosed: deals,
        revenueClosed: Math.round(revenue),
        activeAccounts: accActive,
        errorAccounts: accError,
    };

    const userPrompt = `Role: ADMIN
Scope: full workspace (${accounts.length} Gmail accounts total).

Last 24 hours:
- Emails sent: ${sent}
- Replies received: ${replies}
- Reply rate: ${stats.replyRatePct}%
- New leads added: ${newLeads}
- Deals closed: ${deals}
- Revenue closed: $${stats.revenueClosed.toLocaleString()}
- Gmail accounts: ${accActive} active, ${accError} in error

Write the briefing now (3-4 bullets):`;

    const summary = await withTimeout(callGroq(userPrompt));
    return { role: 'ADMIN', summary, generatedAt, stats };
}

// ── SALES ────────────────────────────────────────────────────────────────────
async function salesBriefing(userId: string): Promise<DailyBriefing> {
    const since = new Date(Date.now() - SINCE_MS).toISOString();
    const generatedAt = new Date().toISOString();

    // Resolve the SALES user's assigned Gmail accounts
    const { data: assignments } = await supabase
        .from('user_gmail_assignments')
        .select('gmail_account_id')
        .eq('user_id', userId);
    const accountIds = (assignments || []).map((a: any) => a.gmail_account_id);

    // Don't query with an empty IN clause.
    const hasAccounts = accountIds.length > 0;

    const [sentRes, recvRes, newLeadsRes, dueFollowupsRes, waitingRes] = await Promise.all([
        hasAccounts
            ? supabase.from('email_messages').select('id', { count: 'exact', head: true })
                .eq('direction', 'SENT').gte('sent_at', since).in('gmail_account_id', accountIds)
            : Promise.resolve({ count: 0 } as any),
        hasAccounts
            ? supabase.from('email_messages').select('id', { count: 'exact', head: true })
                .eq('direction', 'RECEIVED').eq('is_spam', false)
                .gte('sent_at', since).in('gmail_account_id', accountIds)
            : Promise.resolve({ count: 0 } as any),
        supabase.from('contacts').select('id', { count: 'exact', head: true })
            .gte('created_at', since).eq('account_manager_id', userId),
        supabase.from('contacts').select('id', { count: 'exact', head: true })
            .eq('account_manager_id', userId)
            .lte('next_followup_at', new Date(Date.now() + SINCE_MS).toISOString())
            .not('next_followup_at', 'is', null),
        supabase.from('contacts').select('id, name, email', { count: 'exact' })
            .eq('account_manager_id', userId)
            .eq('last_message_direction', 'RECEIVED')
            .gt('total_emails_received', 0)
            .lte('days_since_last_contact', 3)
            .limit(3),
    ]);

    const sent = sentRes.count || 0;
    const replies = recvRes.count || 0;
    const newLeads = newLeadsRes.count || 0;
    const dueFollowups = dueFollowupsRes.count || 0;
    const waitingCount = waitingRes.count || 0;
    const waitingSample = (waitingRes.data || []).map((c: any) => c.name || c.email).filter(Boolean).slice(0, 3);

    const stats = {
        accountsAssigned: accountIds.length,
        emailsSent: sent,
        repliesReceived: replies,
        replyRatePct: sent > 0 ? Math.round((replies / sent) * 1000) / 10 : 0,
        newLeads,
        dueFollowups,
        waitingForReply: waitingCount,
    };

    const userPrompt = `Role: SALES
Scope: only this rep's ${accountIds.length} assigned Gmail account(s) and their own contacts.

Last 24 hours:
- Emails sent: ${sent}
- Replies received: ${replies}
- Reply rate: ${stats.replyRatePct}%
- New leads added: ${newLeads}
- Follow-ups due in the next 24h: ${dueFollowups}
- Replies waiting for this rep right now: ${waitingCount}${waitingSample.length > 0 ? ` (e.g. ${waitingSample.join(', ')})` : ''}

Write the briefing now (3-4 bullets). Address the rep directly ("you").`;

    const summary = await withTimeout(callGroq(userPrompt));
    return { role: 'SALES', summary, generatedAt, stats };
}

// ── VIDEO_EDITOR ─────────────────────────────────────────────────────────────
async function editorBriefing(userId: string): Promise<DailyBriefing> {
    const since = new Date(Date.now() - SINCE_MS).toISOString();
    const next3days = new Date(Date.now() + 3 * SINCE_MS).toISOString();
    const generatedAt = new Date().toISOString();

    // Only EditProject rows assigned to this editor (user_id on edit_projects).
    const [totalRes, dueSoonRes, overdueRes, inProgressRes, newCommentsRes] = await Promise.all([
        supabase.from('edit_projects').select('id', { count: 'exact', head: true })
            .eq('user_id', userId),
        supabase.from('edit_projects').select('id, name, due_date', { count: 'exact' })
            .eq('user_id', userId)
            .gte('due_date', new Date().toISOString())
            .lte('due_date', next3days)
            .order('due_date', { ascending: true })
            .limit(3),
        supabase.from('edit_projects').select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .lt('due_date', new Date().toISOString())
            .neq('progress', 'DONE'),
        supabase.from('edit_projects').select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('progress', ['IN_PROGRESS', 'IN_REVISION']),
        // Comments posted in the last 24h on this editor's projects.
        supabase.from('project_comments')
            .select('id, project:edit_projects!inner(user_id)', { count: 'exact', head: true })
            .eq('project.user_id', userId)
            .gte('created_at', since),
    ]);

    const total = totalRes.count || 0;
    const dueSoonCount = dueSoonRes.count || 0;
    const overdue = overdueRes.count || 0;
    const inProgress = inProgressRes.count || 0;
    const newComments = newCommentsRes.count || 0;
    const dueSoonSample = (dueSoonRes.data || []).map((p: any) => {
        const due = p.due_date ? new Date(p.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        return p.name ? `${p.name} (${due})` : due;
    }).filter(Boolean).slice(0, 3);

    const stats = {
        totalProjects: total,
        inProgress,
        dueSoon: dueSoonCount,
        overdue,
        newComments,
    };

    const userPrompt = `Role: VIDEO_EDITOR
Scope: only this editor's assigned edit projects. No sales/contact data.

Snapshot:
- Projects assigned to you: ${total} (${inProgress} in progress, ${overdue} overdue)
- Deadlines in the next 3 days: ${dueSoonCount}${dueSoonSample.length > 0 ? ` (${dueSoonSample.join('; ')})` : ''}
- New comments on your projects in the last 24h: ${newComments}

Write the briefing now (3-4 bullets). Address the editor directly ("you"). Focus on deliverables and deadlines, not sales.`;

    const summary = await withTimeout(callGroq(userPrompt));
    return { role: 'VIDEO_EDITOR', summary, generatedAt, stats };
}

// ── Router ───────────────────────────────────────────────────────────────────
export async function generateDailyBriefing(userId: string, role: string): Promise<DailyBriefing> {
    const r = (role || '').toUpperCase();
    if (r === 'ADMIN' || r === 'ACCOUNT_MANAGER') return adminBriefing();
    if (r === 'SALES') return salesBriefing(userId);
    if (r === 'VIDEO_EDITOR') return editorBriefing(userId);
    // Unknown role — treat conservatively as SALES (owner-scoped).
    return salesBriefing(userId);
}
