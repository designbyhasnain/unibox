import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: cors });
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 401, headers: cors });

  const { data: user } = await supabase.from('users').select('id').eq('id', apiKey).single();
  if (!user) return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: cors });

  const { email, phone, domain } = await req.json();

  // Find contact by email, phone, or domain
  const fields = 'id, name, email, phone, company, pipeline_stage, lead_score, relationship_health, created_at, last_email_at, next_followup_at, open_count, reply_speed_hours, total_emails_sent, total_emails_received, days_since_last_contact, notes, source_url, estimated_value';
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
  const firstEmailDate = emails?.length ? emails[emails.length - 1].sent_at : null;

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

  const addedDaysAgo = Math.round((Date.now() - new Date(contact.created_at).getTime()) / 86400000);

  return NextResponse.json({
    found: true,
    lead: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
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

      crmUrl: 'https://txb-unibox.vercel.app/clients',
    },
  }, { headers: cors });
}
