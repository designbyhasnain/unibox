import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';

// CORS: only echo back chrome-extension:// origins. See add-lead/route.ts.
function corsHeaders(req: NextRequest) {
    const origin = req.headers.get('origin') || '';
    const allowed = origin.startsWith('chrome-extension://') ? origin : 'null';
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Vary': 'Origin',
    };
}

export async function OPTIONS(req: NextRequest) {
    return NextResponse.json({}, { headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req);
  const apiKey = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 401, headers: cors });

  const { data: user } = await supabase.from('users').select('id').eq('extension_api_key', apiKey).single();
  if (!user) return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: cors });

  const { email, phone, domain, scrapedLocation, scrapedPhone, scrapedName } = await req.json();

  // Find contact by email, phone, or domain
  const fields = 'id, name, email, phone, company, location, pipeline_stage, lead_score, relationship_health, created_at, last_email_at, next_followup_at, open_count, reply_speed_hours, total_emails_sent, total_emails_received, days_since_last_contact, notes, source_url, estimated_value';
  let contact: any = null;

  if (email) {
    const { data } = await supabase.from('contacts').select(fields).ilike('email', email).limit(1).single();
    if (data) contact = data;
  }
  if (!contact && phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 7) {
      const { data } = await supabase.from('contacts').select(fields).ilike('phone', `%${digits.slice(-7)}%`).limit(1).single();
      if (data) contact = data;
    }
  }
  if (!contact && domain) {
    const { data } = await supabase.from('contacts').select(fields).ilike('email', `%@${domain}`).limit(1).single();
    if (data) contact = data;
  }

  if (!contact) {
    return NextResponse.json({ found: false }, { headers: cors });
  }

  // Auto-fill: update contact with scraped data if fields are empty
  const autoFill: Record<string, string> = {};
  if (scrapedLocation && !contact.location) autoFill.location = scrapedLocation;
  if (scrapedPhone && !contact.phone) autoFill.phone = scrapedPhone;
  if (scrapedName && (!contact.name || ['Hello', 'Info', 'Contact', 'hello', 'info'].includes(contact.name))) {
    autoFill.name = scrapedName;
  }
  if (Object.keys(autoFill).length > 0) {
    autoFill.updated_at = new Date().toISOString();
    await supabase.from('contacts').update(autoFill).eq('id', contact.id);
    // Merge into response
    Object.assign(contact, autoFill);
  }

  // Get email thread details
  const { data: emails } = await supabase.from('email_messages')
    .select('id, subject, direction, sent_at, is_unread')
    .eq('contact_id', contact.id)
    .order('sent_at', { ascending: false })
    .limit(50);

  const totalSent = emails?.filter((e: any) => e.direction === 'SENT').length || 0;
  const totalReceived = emails?.filter((e: any) => e.direction === 'RECEIVED').length || 0;
  const totalUnread = emails?.filter((e: any) => e.is_unread).length || 0;
  const lastEmailDate = emails?.[0]?.sent_at || null;
  const lastEmailSubject = emails?.[0]?.subject || null;
  const lastEmailDirection = emails?.[0]?.direction || null;
  const firstEmailDate = emails && emails.length > 0 ? emails[emails.length - 1]!.sent_at : null;

  // Calculate relationship duration
  const relationshipDays = firstEmailDate ? Math.round((Date.now() - new Date(firstEmailDate).getTime()) / 86400000) : 0;
  const daysSinceLastEmail = lastEmailDate ? Math.round((Date.now() - new Date(lastEmailDate).getTime()) / 86400000) : null;

  // Get projects for this client
  const { data: projects } = await supabase.from('projects')
    .select('id, project_name, status, paid_status, project_value')
    .eq('client_id', contact.id)
    .limit(10);

  const totalProjects = projects?.length || 0;
  const totalRevenue = projects?.reduce((sum: number, p: any) => sum + (p.project_value || 0), 0) || 0;
  const paidProjects = projects?.filter((p: any) => p.paid_status === 'PAID').length || 0;
  const activeProjects = projects?.filter((p: any) => ['In Progress', 'Editing', 'Review'].includes(p.status)).length || 0;

  // Recent email subjects (last 5)
  const recentEmails = (emails || []).slice(0, 5).map((e: any) => ({
    subject: e.subject?.slice(0, 50),
    direction: e.direction,
    date: e.sent_at,
    daysAgo: Math.round((Date.now() - new Date(e.sent_at).getTime()) / 86400000),
  }));

  // Determine follow-up urgency
  let followUpStatus = 'NONE';
  if (daysSinceLastEmail !== null) {
    if (lastEmailDirection === 'RECEIVED' && daysSinceLastEmail <= 1) followUpStatus = 'REPLY_ASAP';
    else if (lastEmailDirection === 'RECEIVED' && daysSinceLastEmail <= 3) followUpStatus = 'REPLY_SOON';
    else if (lastEmailDirection === 'SENT' && daysSinceLastEmail >= 7) followUpStatus = 'FOLLOW_UP';
    else if (lastEmailDirection === 'SENT' && daysSinceLastEmail >= 14) followUpStatus = 'GOING_COLD';
    else if (daysSinceLastEmail >= 30) followUpStatus = 'DORMANT';
    else followUpStatus = 'ACTIVE';
  }

  // Pricing intelligence from history
  const projectValues = (projects || []).map((p: any) => p.project_value).filter((v: number) => v > 0);
  const avgProjectValue = projectValues.length > 0 ? Math.round(projectValues.reduce((a: number, b: number) => a + b, 0) / projectValues.length) : 0;
  const maxProjectValue = projectValues.length > 0 ? Math.max(...projectValues) : 0;
  const minProjectValue = projectValues.length > 0 ? Math.min(...projectValues) : 0;
  const unpaidAmount = (projects || []).filter((p: any) => p.paid_status !== 'PAID').reduce((s: number, p: any) => s + (p.project_value || 0), 0);

  // Suggest next deal pricing
  let nextDealSuggested = avgProjectValue;
  let pricingAdvice = '';
  if (totalProjects >= 5 && paidProjects >= 3) {
    nextDealSuggested = Math.round(avgProjectValue * 1.1 / 25) * 25; // 10% increase for loyal clients
    pricingAdvice = 'Loyal client (' + totalProjects + ' projects). Safe to increase 10%. Offer package deal.';
  } else if (totalProjects >= 2 && paidProjects >= 1) {
    nextDealSuggested = avgProjectValue;
    pricingAdvice = 'Returning client. Match previous pricing. Bundle for discount.';
  } else if (totalProjects === 1 && paidProjects === 1) {
    nextDealSuggested = Math.round(avgProjectValue * 1.05 / 25) * 25;
    pricingAdvice = 'First project paid. Slight increase OK. Build relationship.';
  } else if (unpaidAmount > 0) {
    pricingAdvice = 'WARNING: $' + unpaidAmount + ' unpaid. Collect before new work.';
  } else {
    pricingAdvice = 'No payment history yet. Start with standard pricing.';
  }

  // Client tier based on lifetime value
  let clientTier = 'NEW';
  if (totalRevenue >= 5000) clientTier = 'VIP';
  else if (totalRevenue >= 2000) clientTier = 'PREMIUM';
  else if (totalRevenue >= 500) clientTier = 'STANDARD';
  else if (totalRevenue > 0) clientTier = 'STARTER';

  const addedDaysAgo = Math.round((Date.now() - new Date(contact.created_at).getTime()) / 86400000);

  return NextResponse.json({
    found: true,
    lead: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
      location: contact.location,
      stage: contact.pipeline_stage,
      leadScore: contact.lead_score || 0,
      health: contact.relationship_health || 'neutral',
      addedDaysAgo,
      estimatedValue: contact.estimated_value,

      // Email intelligence
      emailsSent: totalSent,
      emailsReceived: totalReceived,
      totalEmails: totalSent + totalReceived,
      unreadEmails: totalUnread,
      replyRate: totalSent > 0 ? Math.round((totalReceived / totalSent) * 100) : 0,
      avgReplySpeed: contact.reply_speed_hours ? Math.round(contact.reply_speed_hours) + 'h' : null,
      openCount: contact.open_count || 0,
      relationshipDays,
      daysSinceLastEmail,
      lastEmailSubject,
      lastEmailDirection,
      followUpStatus,
      recentEmails,

      // Project intelligence
      totalProjects,
      totalRevenue,
      paidProjects,
      activeProjects,
      projects: (projects || []).slice(0, 5).map((p: any) => ({
        name: p.project_name,
        status: p.status,
        paid: p.paid_status,
        value: p.project_value,
      })),

      // Pricing intelligence
      avgProjectValue,
      maxProjectValue,
      minProjectValue,
      unpaidAmount,
      nextDealSuggested,
      pricingAdvice,
      clientTier,

      crmUrl: 'https://txb-unibox.vercel.app/clients',
    },
  }, { headers: cors });
}
