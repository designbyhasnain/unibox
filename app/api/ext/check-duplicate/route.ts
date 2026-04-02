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

  let contact = null;

  if (email) {
    const { data } = await supabase.from('contacts').select('id, name, email, pipeline_stage, created_at, last_email_at, next_followup_at')
      .ilike('email', email).limit(1).single();
    if (data) contact = data;
  }

  if (!contact && phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 7) {
      const { data } = await supabase.from('contacts').select('id, name, email, pipeline_stage, created_at, last_email_at, next_followup_at')
        .ilike('phone', `%${digits.slice(-7)}%`).limit(1).single();
      if (data) contact = data;
    }
  }

  if (!contact && domain) {
    const { data } = await supabase.from('contacts').select('id, name, email, pipeline_stage, created_at, last_email_at, next_followup_at')
      .ilike('email', `%@${domain}`).limit(1).single();
    if (data) contact = data;
  }

  if (!contact) {
    return NextResponse.json({ found: false }, { headers: cors });
  }

  const addedDaysAgo = Math.round((Date.now() - new Date(contact.created_at).getTime()) / 86400000);
  const lastAction = contact.last_email_at ? 'EMAIL_DISPATCH' : 'CREATED';
  const nextFollowUp = contact.next_followup_at
    ? `T+${Math.max(0, Math.round((new Date(contact.next_followup_at).getTime() - Date.now()) / 3600000))}H`
    : null;

  return NextResponse.json({
    found: true,
    lead: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      stage: contact.pipeline_stage,
      addedDaysAgo,
      lastAction,
      nextFollowUp,
      crmUrl: `https://txb-unibox.vercel.app/clients`,
    },
  }, { headers: cors });
}
