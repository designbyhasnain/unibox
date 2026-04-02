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

  const body = await req.json();
  const { name, email, phone, location, website, domain, pricing, suggestedEditPrice, social, prospectScore, source } = body;

  if (!email && !name) {
    return NextResponse.json({ error: 'Name or email required' }, { status: 400, headers: cors });
  }

  // Check for existing contact
  if (email) {
    const { data: existing } = await supabase.from('contacts').select('id').ilike('email', email).limit(1).single();
    if (existing) {
      return NextResponse.json({ error: 'Contact already exists', id: existing.id }, { status: 409, headers: cors });
    }
  }

  const stage = prospectScore >= 75 ? 'LEAD' : prospectScore >= 45 ? 'CONTACTED' : 'COLD_LEAD';

  const { data: contact, error } = await supabase.from('contacts').insert({
    name: name || email?.split('@')[0] || 'Unknown',
    email: email || null,
    phone: phone || null,
    company: name || null,
    source: source || 'extension',
    source_url: website || null,
    pipeline_stage: stage,
    is_lead: true,
    lead_score: prospectScore || 0,
    estimated_value: suggestedEditPrice || null,
    notes: [
      location ? `Location: ${location}` : null,
      domain ? `Website: ${domain}` : null,
      pricing ? `Client pricing: ${pricing.display}` : null,
      suggestedEditPrice ? `Suggested edit price: $${suggestedEditPrice}` : null,
      social?.instagram ? `IG: ${social.instagram}` : null,
      social?.facebook ? `FB: ${social.facebook}` : null,
      social?.youtube ? `YT: ${social.youtube}` : null,
      social?.vimeo ? `Vimeo: ${social.vimeo}` : null,
    ].filter(Boolean).join('\n'),
  }).select('id').single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cors });
  }

  return NextResponse.json({
    id: contact?.id,
    url: `https://txb-unibox.vercel.app/clients`,
  }, { headers: cors });
}
