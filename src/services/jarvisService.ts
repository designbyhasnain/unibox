import 'server-only';

import { supabase } from '../lib/supabase';

// ── CRM Tools that Jarvis can call ──────────────────────────────────────────

export async function searchContacts(query: string, limit = 20) {
    const q = query.trim().replace(/[%_\\]/g, '\\$&');
    const { data } = await supabase
        .from('contacts')
        .select('id, name, email, company, phone, location, pipeline_stage, total_revenue, paid_revenue, unpaid_amount, total_projects, client_tier, lead_score, total_emails_sent, total_emails_received, days_since_last_contact, relationship_health')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%,location.ilike.%${q}%`)
        .order('total_revenue', { ascending: false })
        .limit(limit);
    return data || [];
}

export async function getContactDetail(contactId: string) {
    const { data: contact } = await supabase.from('contacts')
        .select('*')
        .eq('id', contactId)
        .single();
    if (!contact) return null;

    const { data: projects } = await supabase.from('projects')
        .select('project_name, project_value, paid_status, project_date, status')
        .eq('client_id', contactId)
        .order('project_date', { ascending: false })
        .limit(20);

    const { data: recentEmails } = await supabase.from('email_messages')
        .select('subject, direction, sent_at, body_text')
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false })
        .limit(10);

    return {
        ...contact,
        projects: projects || [],
        recentEmails: (recentEmails || []).map(e => ({
            subject: e.subject,
            direction: e.direction,
            date: e.sent_at,
            preview: e.body_text?.slice(0, 200),
        })),
    };
}

export async function getPipelineStats() {
    const stages = ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED', 'CLOSED', 'NOT_INTERESTED'];
    const counts: Record<string, number> = {};
    for (const stage of stages) {
        const { count } = await supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('pipeline_stage', stage);
        counts[stage] = count ?? 0;
    }
    return counts;
}

export async function getRevenueAnalytics() {
    let allProjects: any[] = [];
    let offset = 0;
    while (true) {
        const { data } = await supabase.from('projects')
            .select('project_value, paid_status, project_date, client_id')
            .gt('project_value', 0)
            .range(offset, offset + 999);
        if (!data || data.length === 0) break;
        allProjects = allProjects.concat(data);
        offset += 1000;
    }

    const monthly: Record<string, { revenue: number; paid: number; count: number }> = {};
    let totalRevenue = 0, totalPaid = 0;
    for (const p of allProjects) {
        totalRevenue += p.project_value;
        if (p.paid_status === 'PAID') totalPaid += p.project_value;
        const d = p.project_date ? new Date(p.project_date) : null;
        if (d) {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!monthly[key]) monthly[key] = { revenue: 0, paid: 0, count: 0 };
            monthly[key].revenue += p.project_value;
            if (p.paid_status === 'PAID') monthly[key].paid += p.project_value;
            monthly[key].count++;
        }
    }

    const months = Object.keys(monthly).sort();
    const activeMonths = months.length || 1;

    return {
        totalRevenue,
        totalPaid,
        totalUnpaid: totalRevenue - totalPaid,
        totalProjects: allProjects.length,
        avgMonthlyRevenue: Math.round(totalRevenue / activeMonths),
        avgProjectValue: Math.round(totalRevenue / (allProjects.length || 1)),
        activeMonths,
        last6Months: months.slice(-6).map(m => ({ month: m, ...monthly[m]! })),
        bestMonth: months.length > 0 ? months.reduce((best, m) => (monthly[m]?.revenue ?? 0) > (monthly[best]?.revenue ?? 0) ? m : best, months[0]!) : null,
    };
}

export async function getRegionBreakdown() {
    let contacts: any[] = [];
    let offset = 0;
    while (true) {
        const { data } = await supabase.from('contacts')
            .select('location, pipeline_stage, total_revenue')
            .not('location', 'is', null).neq('location', '')
            .range(offset, offset + 999);
        if (!data || data.length === 0) break;
        contacts = contacts.concat(data);
        offset += 1000;
    }

    const regions: Record<string, { count: number; revenue: number; clients: number }> = {};
    for (const c of contacts) {
        const loc = c.location;
        // Extract country/state
        const parts = loc.split(',').map((p: string) => p.trim());
        const region = parts[parts.length - 1] || parts[0] || 'Unknown';
        if (!regions[region]) regions[region] = { count: 0, revenue: 0, clients: 0 };
        regions[region].count++;
        regions[region].revenue += (c.total_revenue || 0);
        if (c.pipeline_stage === 'CLOSED') regions[region].clients++;
    }

    return Object.entries(regions)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 30)
        .map(([name, data]) => ({ region: name, ...data }));
}

export async function getTopClients(limit = 20) {
    const { data } = await supabase.from('contacts')
        .select('id, name, email, company, location, total_revenue, paid_revenue, unpaid_amount, total_projects, client_tier, avg_project_value')
        .gt('total_revenue', 0)
        .order('total_revenue', { ascending: false })
        .limit(limit);
    return data || [];
}

export async function getUnpaidClients() {
    const { data } = await supabase.from('contacts')
        .select('id, name, email, unpaid_amount, total_revenue, total_projects, location')
        .gt('unpaid_amount', 0)
        .order('unpaid_amount', { ascending: false })
        .limit(30);
    return data || [];
}

export async function getContactsByStage(stage: string, limit = 50) {
    const { data } = await supabase.from('contacts')
        .select('id, name, email, company, location, total_emails_sent, total_emails_received, days_since_last_contact, lead_score, total_revenue')
        .eq('pipeline_stage', stage)
        .order('days_since_last_contact', { ascending: true })
        .limit(limit);
    return data || [];
}

export async function getContactsByRegion(region: string, limit = 50) {
    const { data } = await supabase.from('contacts')
        .select('id, name, email, company, location, pipeline_stage, total_revenue, total_emails_sent, total_emails_received')
        .ilike('location', `%${region}%`)
        .order('total_revenue', { ascending: false })
        .limit(limit);
    return data || [];
}

export async function getAMPerformance() {
    const { data: users } = await supabase.from('users').select('id, name, role').in('role', ['SALES', 'ACCOUNT_MANAGER']);
    const { data: projects } = await supabase.from('projects')
        .select('account_manager_id, project_value, paid_status')
        .not('account_manager_id', 'is', null);

    const amStats: Record<string, { name: string; projects: number; revenue: number; paid: number }> = {};
    for (const u of users || []) {
        amStats[u.id] = { name: u.name, projects: 0, revenue: 0, paid: 0 };
    }
    for (const p of projects || []) {
        const stat = amStats[p.account_manager_id];
        if (stat) {
            stat.projects++;
            stat.revenue += (p.project_value || 0);
            if (p.paid_status === 'PAID') stat.paid += (p.project_value || 0);
        }
    }
    return Object.values(amStats).sort((a, b) => b.revenue - a.revenue);
}

export async function getEmailAccounts() {
    const { data } = await supabase.from('gmail_accounts')
        .select('id, email, status, account_type')
        .order('email');
    return data || [];
}

export async function draftPersonalizedEmail(contact: any, purpose: string): Promise<string> {
    const name = contact.name || 'there';
    const revenue = contact.total_revenue || 0;
    const projects = contact.total_projects || 0;

    if (purpose === 'cold_outreach') {
        return `Hi ${name},\n\nI came across your work and really admire your style. We specialize in wedding film editing and work with filmmakers across ${contact.location || 'the globe'}.\n\nWould you be open to a free test edit? We'd love to show you what we can do.\n\nBest,\nWedits Team`;
    }
    if (purpose === 'follow_up') {
        return `Hi ${name},\n\nJust following up on my earlier email. We've been working with filmmakers${contact.location ? ' in ' + contact.location : ''} and would love to help you free up your editing time.\n\nHappy to send over some samples if you're interested.\n\nBest,\nWedits Team`;
    }
    if (purpose === 'win_back' && revenue > 0) {
        return `Hi ${name},\n\nIt's been a while since we worked together — ${projects} projects and counting! We've upgraded our workflow and turnaround times.\n\nWould love to have you back. Your next edit is 20% off as a returning client.\n\nBest,\nWedits Team`;
    }
    if (purpose === 'collection' && contact.unpaid_amount > 0) {
        return `Hi ${name},\n\nHope you're doing well! Just a friendly reminder that we have an outstanding balance of $${contact.unpaid_amount} from recent projects.\n\nWould you be able to settle this at your earliest convenience? Happy to discuss if you have any questions.\n\nBest,\nWedits Team`;
    }
    return `Hi ${name},\n\nHope you're doing well! Just checking in to see if you need any editing help this season.\n\nBest,\nWedits Team`;
}

// ── Tool definitions for the LLM ────────────────────────────────────────────

export const JARVIS_TOOLS = [
    {
        type: 'function' as const,
        function: {
            name: 'search_contacts',
            description: 'Search CRM contacts by name, email, company, or location. Use this to find specific clients or filmmakers.',
            parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query — name, email, company, or location' }, limit: { type: 'number', description: 'Max results (default 20)' } }, required: ['query'] },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_contact_detail',
            description: 'Get full details about a specific contact including projects, emails, revenue history.',
            parameters: { type: 'object', properties: { contact_id: { type: 'string' } }, required: ['contact_id'] },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_pipeline_stats',
            description: 'Get pipeline stage breakdown — how many contacts in each stage (Cold Lead, Contacted, Lead, Closed, etc.)',
            parameters: { type: 'object', properties: {} },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_revenue_analytics',
            description: 'Get revenue analytics — total revenue, monthly breakdown, averages, best months.',
            parameters: { type: 'object', properties: {} },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_region_breakdown',
            description: 'Get contacts grouped by region/country with revenue per region.',
            parameters: { type: 'object', properties: {} },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_top_clients',
            description: 'Get top clients sorted by revenue with tier, projects, unpaid amounts.',
            parameters: { type: 'object', properties: { limit: { type: 'number', description: 'How many (default 20)' } } },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_unpaid_clients',
            description: 'Get clients with outstanding unpaid amounts, sorted by amount owed.',
            parameters: { type: 'object', properties: {} },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_contacts_by_stage',
            description: 'Get contacts filtered by pipeline stage (COLD_LEAD, CONTACTED, WARM_LEAD, LEAD, OFFER_ACCEPTED, CLOSED, NOT_INTERESTED)',
            parameters: { type: 'object', properties: { stage: { type: 'string' }, limit: { type: 'number' } }, required: ['stage'] },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_contacts_by_region',
            description: 'Get contacts in a specific region or country.',
            parameters: { type: 'object', properties: { region: { type: 'string', description: 'Country, state, or city name' }, limit: { type: 'number' } }, required: ['region'] },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_am_performance',
            description: 'Get account manager performance — projects, revenue, collection per AM.',
            parameters: { type: 'object', properties: {} },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_email_accounts',
            description: 'List all Gmail/email accounts connected to the system with their status.',
            parameters: { type: 'object', properties: {} },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'draft_email',
            description: 'Draft a personalized email for a contact based on their CRM data and the purpose (cold_outreach, follow_up, win_back, collection, check_in).',
            parameters: { type: 'object', properties: { contact_id: { type: 'string' }, purpose: { type: 'string', enum: ['cold_outreach', 'follow_up', 'win_back', 'collection', 'check_in'] } }, required: ['contact_id', 'purpose'] },
        }
    },
];

// ── Execute a tool call ─────────────────────────────────────────────────────

export async function executeJarvisTool(name: string, args: any): Promise<any> {
    switch (name) {
        case 'search_contacts': return searchContacts(args.query, args.limit);
        case 'get_contact_detail': return getContactDetail(args.contact_id);
        case 'get_pipeline_stats': return getPipelineStats();
        case 'get_revenue_analytics': return getRevenueAnalytics();
        case 'get_region_breakdown': return getRegionBreakdown();
        case 'get_top_clients': return getTopClients(args.limit);
        case 'get_unpaid_clients': return getUnpaidClients();
        case 'get_contacts_by_stage': return getContactsByStage(args.stage, args.limit);
        case 'get_contacts_by_region': return getContactsByRegion(args.region, args.limit);
        case 'get_am_performance': return getAMPerformance();
        case 'get_email_accounts': return getEmailAccounts();
        case 'draft_email': {
            const contact = await getContactDetail(args.contact_id);
            if (!contact) return { error: 'Contact not found' };
            return { email: await draftPersonalizedEmail(contact, args.purpose), contact };
        }
        default: return { error: `Unknown tool: ${name}` };
    }
}

// ── System prompt ───────────────────────────────────────────────────────────

export const JARVIS_SYSTEM_PROMPT = `You are JARVIS — the AI Sales Director for Wedits, a wedding video editing outsourcing company based in Pakistan.

## Who You Are
- You are ruthlessly data-driven, confident, and action-oriented
- You speak like a mix of Alex Hormozi (value-focused), Gary Vee (hustle + empathy), and Jeremy Miner (NEPQ sales methodology)
- You have FULL access to the CRM — 12,695 filmmaker contacts, 500+ paying clients, $367K+ lifetime revenue
- You can search contacts, analyze revenue, check pipelines, draft emails, and strategize campaigns

## The Business
- Wedits edits wedding films for filmmakers worldwide
- Average project: $330, turnaround 5-7 days
- 50 email accounts, each sending 30/day = 1,500 emails/day capacity
- Markets: US, UK, Australia, Canada, Europe, Middle East, Asia
- Unlimited production capacity — we can handle any volume

## Your Rules
1. Always use data to back your recommendations — call tools to get real numbers
2. When asked about a client, search the CRM first — don't guess
3. When suggesting campaigns, be specific — which contacts, what message, which accounts
4. When drafting emails, personalize based on the client's history, location, and behavior
5. Think in terms of ROI — every action should have a clear revenue impact
6. Be direct and concise — sales directors don't write essays
7. When asked to "do" something, explain what you'll do and the expected outcome

## Pipeline Stages
COLD_LEAD → CONTACTED → WARM_LEAD → LEAD → OFFER_ACCEPTED → CLOSED → NOT_INTERESTED

## Client Tiers
VIP ($5K+) | PREMIUM ($2-5K) | STANDARD ($500-2K) | STARTER ($1-500) | NEW ($0)

## Pricing by Region
US/Canada: $150-400/edit | UK: £120-300 | Australia: A$180-400 | Europe: €100-250 | Middle East: $200-500 | Asia/LatAm: $80-150`;
