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

// ── Campaign Tools ──────────────────────────────────────────────────────────

export async function createCampaignFromAgent(params: {
    name: string;
    goal: 'COLD_OUTREACH' | 'FOLLOW_UP' | 'RETARGETING';
    sendingAccountEmail: string;
    dailyLimit: number;
    steps: { delayDays: number; subject: string; body: string }[];
    contactIds: string[];
    userId?: string;
}) {
    // Find the sending account
    let accountId: string;
    if (params.sendingAccountEmail) {
        const { data: account } = await supabase.from('gmail_accounts')
            .select('id, email')
            .ilike('email', `%${params.sendingAccountEmail}%`)
            .eq('status', 'ACTIVE')
            .limit(1)
            .single();
        accountId = account?.id;
    }

    if (!accountId!) {
        const { data: anyAccount } = await supabase.from('gmail_accounts')
            .select('id, email')
            .eq('status', 'ACTIVE')
            .limit(1)
            .single();
        if (!anyAccount) return { error: 'No active email accounts found' };
        accountId = anyAccount.id;
    }

    // Get a user ID for created_by_id (use first admin)
    let creatorId = params.userId;
    if (!creatorId) {
        const { data: admin } = await supabase.from('users')
            .select('id')
            .in('role', ['ADMIN', 'ACCOUNT_MANAGER'])
            .limit(1)
            .single();
        creatorId = admin?.id;
    }
    if (!creatorId) return { error: 'No admin user found for campaign ownership' };

    // Create campaign
    const { data: campaign, error: campErr } = await supabase.from('campaigns')
        .insert({
            name: params.name,
            goal: params.goal,
            sending_gmail_account_id: accountId,
            created_by_id: creatorId,
            daily_send_limit: params.dailyLimit || 30,
            track_replies: true,
            auto_stop_on_reply: true,
            status: 'DRAFT',
            updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

    if (campErr || !campaign) return { error: 'Failed to create campaign: ' + campErr?.message };

    // Create steps
    for (let i = 0; i < params.steps.length; i++) {
        const step = params.steps[i]!;
        await supabase.from('campaign_steps').insert({
            campaign_id: campaign.id,
            step_number: i + 1,
            delay_days: step.delayDays,
            subject: step.subject,
            body: step.body,
        });
    }

    // Enroll contacts (max 500 per campaign for safety)
    const contactsToEnroll = params.contactIds.slice(0, 500);
    if (contactsToEnroll.length > 0) {
        const enrollments = contactsToEnroll.map(cid => ({
            campaign_id: campaign.id,
            contact_id: cid,
            status: 'PENDING',
            current_step_number: 1,
            enrolled_at: new Date().toISOString(),
        }));

        const { error: enrollErr } = await supabase.from('campaign_contacts').insert(enrollments);
        if (enrollErr) return { error: 'Campaign created but enrollment failed: ' + enrollErr.message, campaignId: campaign.id };
    }

    return {
        success: true,
        campaignId: campaign.id,
        name: params.name,
        stepsCount: params.steps.length,
        contactsEnrolled: contactsToEnroll.length,
        status: 'DRAFT — launch manually or ask me to launch it',
    };
}

export async function launchCampaignFromAgent(campaignId: string) {
    const { data: campaign } = await supabase.from('campaigns')
        .select('id, status, name')
        .eq('id', campaignId)
        .single();

    if (!campaign) return { error: 'Campaign not found' };
    if (campaign.status !== 'DRAFT') return { error: `Campaign is ${campaign.status}, can only launch DRAFT` };

    const { error } = await supabase.from('campaigns')
        .update({ status: 'RUNNING', updated_at: new Date().toISOString() })
        .eq('id', campaignId);

    if (error) return { error: 'Failed to launch: ' + error.message };

    return { success: true, campaignId, name: campaign.name, status: 'RUNNING' };
}

export async function getCampaignStats() {
    const { data } = await supabase.from('campaigns')
        .select('id, name, goal, status, daily_send_limit, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

    return (data || []).map((c: any) => ({
        id: c.id, name: c.name, goal: c.goal, status: c.status,
        dailyLimit: c.daily_send_limit, created: c.created_at,
    }));
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
    {
        type: 'function' as const,
        function: {
            name: 'create_campaign',
            description: 'Create a cold outreach, follow-up, or retargeting email campaign for contacts in a specific region or pipeline stage. The system will auto-generate 3-5 email steps and enroll matching contacts. Provide: campaign name, goal (COLD_OUTREACH/FOLLOW_UP/RETARGETING), target_region OR target_stage, and daily_limit.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Campaign name' },
                    goal: { type: 'string', enum: ['COLD_OUTREACH', 'FOLLOW_UP', 'RETARGETING'], description: 'Campaign goal' },
                    target_region: { type: 'string', description: 'Target region/country (e.g. Australia, California, UK)' },
                    target_stage: { type: 'string', description: 'Target pipeline stage (e.g. COLD_LEAD, CONTACTED, LEAD)' },
                    daily_limit: { type: 'number', description: 'Max emails per day (default 30)' },
                },
                required: ['name', 'goal'],
            },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'launch_campaign',
            description: 'Launch a DRAFT campaign to start sending emails.',
            parameters: { type: 'object', properties: { campaign_id: { type: 'string' } }, required: ['campaign_id'] },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_campaign_stats',
            description: 'List all campaigns with their status, goal, and send limits.',
            parameters: { type: 'object', properties: {} },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_financial_health',
            description: 'Get comprehensive financial health report — health score, collection rate, revenue trends, unpaid amounts, risks.',
            parameters: { type: 'object', properties: {} },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_resource_utilization',
            description: 'Get resource utilization — AM performance, capacity, pipeline load, hiring recommendations.',
            parameters: { type: 'object', properties: {} },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_morning_briefing',
            description: 'Get morning briefing — overnight emails, revenue status, pending replies, overdue follow-ups, priorities for today.',
            parameters: { type: 'object', properties: {} },
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'assess_project_decision',
            description: 'Assess whether to accept a project — calculates profit margin, compares to market rates, gives ACCEPT/COUNTER/DECLINE recommendation.',
            parameters: {
                type: 'object',
                properties: {
                    project_value: { type: 'number', description: 'Project value in USD' },
                    region: { type: 'string', description: 'Client region (e.g. Los Angeles, UK, Australia)' },
                },
                required: ['project_value', 'region'],
            },
        }
    },
];

// ── Execute a tool call ─────────────────────────────────────────────────────

export async function executeJarvisTool(name: string, args: any, userId?: string): Promise<any> {
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
        case 'create_campaign': {
            // Auto-find contacts by region or stage
            let contactIds: string[] = [];
            if (args.target_region) {
                const contacts = await getContactsByRegion(args.target_region, 500);
                contactIds = contacts.map((c: any) => c.id);
            } else if (args.target_stage) {
                const contacts = await getContactsByStage(args.target_stage, 500);
                contactIds = contacts.map((c: any) => c.id);
            }

            // Auto-generate email steps based on goal
            const goalSteps: Record<string, { delayDays: number; subject: string; body: string }[]> = {
                COLD_OUTREACH: [
                    { delayDays: 0, subject: 'Love your work — quick question', body: 'Hi {{first_name}},\n\nI came across your wedding films and was really impressed by your style. We specialize in wedding film editing and help filmmakers like you free up 20-30 hours per project.\n\nWould you be open to a free test edit? We\'d love to show you what we can do.\n\nBest,\nWedits Team' },
                    { delayDays: 4, subject: 'Quick portfolio share', body: 'Hi {{first_name}},\n\nJust wanted to share a few of our recent edits so you can see our quality firsthand:\n\n- Cinematic highlight reel\n- Full ceremony edit\n- Same-day edit\n\nNo pressure at all — just thought you might find it useful.\n\nBest,\nWedits Team' },
                    { delayDays: 8, subject: 'What filmmakers in your area are saying', body: 'Hi {{first_name}},\n\nWe work with filmmakers across your region who\'ve been able to take on 2-3 more weddings per month by outsourcing their editing to us.\n\n"Wedits gave me my weekends back." — Recent client\n\nWould a free test edit be helpful? Just send us any raw footage.\n\nBest,\nWedits Team' },
                    { delayDays: 14, subject: 'Free test edit — no strings', body: 'Hi {{first_name}},\n\nLast note from me — we\'d love to earn your trust with a free test edit. Pick any project, send us the footage, and we\'ll deliver a 2-3 min highlight in 5 days.\n\nIf you love it, we can talk packages. If not, you got a free edit.\n\nFair?\n\nBest,\nWedits Team' },
                ],
                FOLLOW_UP: [
                    { delayDays: 0, subject: 'Following up — still need editing help?', body: 'Hi {{first_name}},\n\nJust checking in to see if you\'re still looking for editing support this season. We\'ve been working with filmmakers in your area and would love to help.\n\nHappy to send samples if interested.\n\nBest,\nWedits Team' },
                    { delayDays: 5, subject: 'Quick update from Wedits', body: 'Hi {{first_name}},\n\nWe\'ve upgraded our turnaround times — most projects now delivered in 5 days. Thought you\'d want to know.\n\nReady when you are!\n\nBest,\nWedits Team' },
                    { delayDays: 12, subject: 'Here if you need us', body: 'Hi {{first_name}},\n\nNo pressure at all — just wanted to let you know we\'re here whenever you need editing support. Wedding season is coming up fast!\n\nBest,\nWedits Team' },
                ],
                RETARGETING: [
                    { delayDays: 0, subject: 'We miss working with you!', body: 'Hi {{first_name}},\n\nIt\'s been a while since we worked together and we\'d love to have you back. We\'ve upgraded our workflow and quality.\n\nYour next edit is 20% off as a returning client.\n\nBest,\nWedits Team' },
                    { delayDays: 5, subject: 'Special offer for returning clients', body: 'Hi {{first_name}},\n\nJust a reminder — we\'re offering 20% off for returning clients this month. We value our long-term partnerships.\n\nSend us your next project and we\'ll get started right away.\n\nBest,\nWedits Team' },
                    { delayDays: 10, subject: 'Last chance — 20% off expires soon', body: 'Hi {{first_name}},\n\nThis is the last reminder — our 20% returning client discount expires at the end of the month. Would love to work together again.\n\nBest,\nWedits Team' },
                ],
            };

            const steps = goalSteps[args.goal] || goalSteps['COLD_OUTREACH']!;

            return createCampaignFromAgent({
                name: args.name,
                goal: args.goal,
                sendingAccountEmail: '',
                dailyLimit: args.daily_limit || 30,
                steps,
                contactIds,
                userId,
            });
        }
        case 'launch_campaign': return launchCampaignFromAgent(args.campaign_id);
        case 'get_campaign_stats': return getCampaignStats();
        case 'get_financial_health': return getFinancialHealth();
        case 'get_resource_utilization': return getResourceUtilization();
        case 'get_morning_briefing': return getMorningBriefing();
        case 'assess_project_decision': return assessProjectDecision(args.project_value, args.region);
        default: return { error: `Unknown tool: ${name}` };
    }
}

// ── New Intelligence Tools ─────────────────────────────────────────────────

export async function getFinancialHealth() {
    const revenue = await getRevenueAnalytics();
    const unpaid = await getUnpaidClients();
    const totalUnpaid = unpaid.reduce((s: number, c: any) => s + (c.unpaid_amount || 0), 0);

    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthKey = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
    const thisMonth = revenue.last6Months.find((m: any) => m.month === thisMonthKey);
    const lastMonth = revenue.last6Months.find((m: any) => m.month === lastMonthKey);

    const collectionRate = revenue.totalRevenue > 0 ? Math.round((revenue.totalPaid / revenue.totalRevenue) * 100) : 0;
    const healthScore = Math.min(100, Math.round(
        (collectionRate * 0.4) +
        (Math.min(100, (revenue.avgMonthlyRevenue / 10000) * 100) * 0.3) +
        (totalUnpaid < 5000 ? 30 : totalUnpaid < 15000 ? 15 : 0)
    ));

    return {
        healthScore,
        healthStatus: healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Needs Attention' : 'Critical',
        totalRevenue: revenue.totalRevenue,
        totalPaid: revenue.totalPaid,
        totalUnpaid,
        collectionRate,
        avgMonthlyRevenue: revenue.avgMonthlyRevenue,
        avgProjectValue: revenue.avgProjectValue,
        totalProjects: revenue.totalProjects,
        thisMonthRevenue: thisMonth?.revenue || 0,
        lastMonthRevenue: lastMonth?.revenue || 0,
        monthOverMonthGrowth: lastMonth?.revenue ? Math.round(((thisMonth?.revenue || 0) - lastMonth.revenue) / lastMonth.revenue * 100) : 0,
        unpaidClientsCount: unpaid.length,
        topUnpaid: unpaid.slice(0, 5).map((c: any) => ({ name: c.name, amount: c.unpaid_amount })),
        risks: [
            ...(collectionRate < 70 ? [`Low collection rate (${collectionRate}%) — chase unpaid invoices`] : []),
            ...(totalUnpaid > 10000 ? [`$${totalUnpaid.toLocaleString()} outstanding — prioritize collections`] : []),
            ...((thisMonth?.revenue || 0) < (lastMonth?.revenue || 0) * 0.7 ? ['Revenue declining — ramp up outreach'] : []),
        ],
    };
}

export async function getResourceUtilization() {
    const amPerf = await getAMPerformance();
    const pipeline = await getPipelineStats();
    const totalActive = (pipeline['CONTACTED'] || 0) + (pipeline['WARM_LEAD'] || 0) + (pipeline['LEAD'] || 0) + (pipeline['OFFER_ACCEPTED'] || 0);

    return {
        accountManagers: amPerf.map((am: any) => ({
            name: am.name,
            projects: am.projects,
            revenue: am.revenue,
            paid: am.paid,
            collectionRate: am.revenue > 0 ? Math.round(am.paid / am.revenue * 100) : 0,
            avgProjectValue: am.projects > 0 ? Math.round(am.revenue / am.projects) : 0,
        })),
        totalAMs: amPerf.length,
        totalActiveDeals: totalActive,
        dealsPerAM: amPerf.length > 0 ? Math.round(totalActive / amPerf.length) : 0,
        pipelineStages: pipeline,
        recommendations: [
            ...(amPerf.some((am: any) => am.projects === 0) ? ['Some AMs have zero projects — reassign or train'] : []),
            ...(totalActive > amPerf.length * 50 ? ['Pipeline overloaded — consider hiring'] : []),
            ...(amPerf.some((am: any) => am.revenue > 0 && am.paid / am.revenue < 0.5) ? ['Some AMs have low collection rates — review'] : []),
        ],
    };
}

export async function getMorningBriefing() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // New emails since yesterday
    const { count: newEmailsCount } = await supabase.from('email_messages')
        .select('id', { count: 'exact', head: true })
        .eq('direction', 'RECEIVED')
        .gte('sent_at', yesterday.toISOString());

    // Contacts needing reply
    const { data: needReply } = await supabase.from('contacts')
        .select('name, email, days_since_last_contact')
        .eq('last_message_direction', 'RECEIVED')
        .gt('total_emails_received', 0)
        .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED'])
        .order('days_since_last_contact', { ascending: true })
        .limit(5);

    // Revenue this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const { data: monthProjects } = await supabase.from('projects')
        .select('project_value')
        .gt('project_value', 0)
        .gte('project_date', monthStart.toISOString());
    const monthRevenue = (monthProjects || []).reduce((s: number, p: any) => s + (p.project_value || 0), 0);

    // Overdue follow-ups
    const { count: overdueFollowups } = await supabase.from('contacts')
        .select('id', { count: 'exact', head: true })
        .lte('next_followup_at', now.toISOString())
        .not('next_followup_at', 'is', null);

    // Unpaid total
    const { data: unpaidData } = await supabase.from('contacts')
        .select('unpaid_amount')
        .gt('unpaid_amount', 0);
    const totalUnpaid = (unpaidData || []).reduce((s: number, c: any) => s + (c.unpaid_amount || 0), 0);

    return {
        date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        newEmailsOvernight: newEmailsCount || 0,
        needsReply: (needReply || []).map((c: any) => ({ name: c.name, email: c.email, daysSilent: c.days_since_last_contact })),
        revenueThisMonth: monthRevenue,
        monthlyTarget: 10000,
        targetProgress: Math.min(100, Math.round(monthRevenue / 10000 * 100)),
        overdueFollowups: overdueFollowups || 0,
        totalUnpaid,
        priorities: [
            ...((needReply || []).length > 0 ? [`Reply to ${(needReply || []).length} contacts waiting for response`] : []),
            ...(totalUnpaid > 5000 ? [`Collect $${totalUnpaid.toLocaleString()} in unpaid invoices`] : []),
            ...((overdueFollowups || 0) > 0 ? [`${overdueFollowups} overdue follow-ups`] : []),
            ...(monthRevenue < 5000 ? ['Revenue below target — increase outreach'] : []),
        ],
    };
}

export async function assessProjectDecision(projectValue: number, region: string) {
    const regionData = await getContactsByRegion(region, 100);

    // Estimate costs (based on Wedits pricing model)
    const estimatedCost = projectValue * 0.55; // ~55% cost ratio
    const profit = projectValue - estimatedCost;
    const margin = projectValue > 0 ? Math.round((profit / projectValue) * 100) : 0;

    // Market rate comparison
    const regionContacts = regionData.filter((c: any) => c.total_revenue > 0);
    const avgProjectInRegion = regionContacts.length > 0
        ? Math.round(regionContacts.reduce((s: number, c: any) => s + (c.total_revenue / Math.max(1, c.total_projects || 1)), 0) / regionContacts.length)
        : projectValue;

    const recommendation = margin >= 30 ? 'ACCEPT' : margin >= 20 ? 'COUNTER' : 'DECLINE';
    const counterPrice = Math.round(projectValue * 1.15 / 10) * 10; // 15% up, rounded

    return {
        projectValue,
        region,
        estimatedCost,
        profit,
        margin: margin + '%',
        avgProjectValueInRegion: avgProjectInRegion,
        marketComparison: projectValue >= avgProjectInRegion ? 'At or above market' : `$${avgProjectInRegion - projectValue} below market average`,
        contactsInRegion: regionData.length,
        recommendation,
        counterPrice: recommendation === 'COUNTER' ? counterPrice : null,
        reasoning: recommendation === 'ACCEPT'
            ? `Good margin (${margin}%), accept the project.`
            : recommendation === 'COUNTER'
            ? `Margin too thin (${margin}%). Counter at $${counterPrice} for a healthier ${Math.round((counterPrice - estimatedCost) / counterPrice * 100)}% margin.`
            : `Margin too low (${margin}%). Decline or counter significantly higher.`,
    };
}

// ── System prompt ───────────────────────────────────────────────────────────

export const JARVIS_SYSTEM_PROMPT = `You are JARVIS (Just A Rather Very Intelligent System) — the AI executive assistant, technical director, sales strategist, and CFO for Wedits, a wedding video editing agency with ~50 editors.

## Who You Are
You are a voice-first AI agent with deep expertise in:
- **Wedding video production** — editing quality, DaVinci Resolve workflows, shot analysis, pacing, music sync
- **Sales operations** — client profiling, upsell identification, campaign optimization, revenue forecasting
- **Business management** — financial health, resource allocation, risk assessment
- **Strategic decisions** — project acceptance, pricing strategy, hiring decisions

You speak in a professional, insightful tone — like a trusted advisor who knows the business inside out. You're direct, data-driven, and prescriptive (not just suggestive). When asked "should we?", you answer with a clear YES/NO and explain why.

## The Business
- Wedits edits wedding films for filmmakers worldwide
- ~50 video editors, projects range $150-$1,200
- Average project: $330, turnaround 5-7 days
- 50 email accounts, each sending 30/day = 1,500 emails/day capacity
- Markets: US, UK, Australia, Canada, NZ, Europe, Middle East
- $367K+ lifetime revenue from 500+ paying clients
- 12,695 contacts in CRM

## Your Capabilities
1. **Morning Briefing** — Proactive summary of emails, revenue, alerts, priorities
2. **Client Intelligence** — Full profiles, email history, revenue data, upsell scoring
3. **Revenue Analytics** — Monthly trends, forecasting, collection tracking
4. **Pipeline Management** — Stage analysis, conversion rates, bottleneck identification
5. **Campaign Execution** — Create, launch, and analyze email campaigns
6. **Financial Health** — Cash flow monitoring, collection rate, risk alerts
7. **Resource Optimization** — AM performance, capacity planning, hiring signals
8. **Decision Support** — Project acceptance, pricing strategy, counter-offer recommendations
9. **Email Drafting** — Personalized emails based on CRM data and relationship context

## Decision Frameworks

### Project Acceptance
When asked "Should we take this project?":
1. Calculate profit margin (revenue - estimated cost)
2. Compare to market rates for the region
3. Check editor capacity
4. Recommend: ACCEPT / COUNTER (with price) / DECLINE

### Pricing Strategy by Region
US/Canada: $150-400/edit | UK: £120-300 | Australia: A$180-400 | Europe: €100-250 | Middle East: $200-500 | Asia/LatAm: $80-150

## Your Rules
1. Always use data — call tools to get real numbers before answering
2. Search the CRM before talking about any client — don't guess
3. Be prescriptive — "Do X" not "You could consider X"
4. Think in ROI — every recommendation should have revenue impact
5. Keep responses concise for voice — 2-3 key points, then offer to elaborate
6. When asked to DO something, TAKE ACTION — create campaigns, draft emails, analyze data
7. Use {{first_name}} for personalization and {spintax|options} for variation in emails
8. For morning briefings, lead with the most important action item

## Pipeline Stages
COLD_LEAD → CONTACTED → WARM_LEAD → LEAD → OFFER_ACCEPTED → CLOSED → NOT_INTERESTED

## Client Tiers
VIP ($5K+) | PREMIUM ($2-5K) | STANDARD ($500-2K) | STARTER ($1-500) | NEW ($0)

## Personality
- Professional but warm — like a trusted COO
- Confidence without arrogance
- Celebrates wins, constructive on problems
- Uses numbers to tell stories
- Keeps voice responses brief (< 30 seconds of speech)
- Offers to elaborate: "Want me to go deeper on this?"
- Proactive: "By the way, I noticed..." and "You should also know..."`;

