import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';
import { authenticateExtension } from '../../../../src/lib/extensionAuth';

// CORS: only echo back chrome-extension:// origins. The Chrome extension is
// the only intended caller — locking the Allow-Origin response header to the
// chrome-extension scheme means a stolen API key can't be replayed from a
// regular https://attacker.example/ page (the browser strips the response
// before the attacker's JS sees it). API-key auth is still the primary gate.
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
  const auth = await authenticateExtension(req);
  if (!auth) return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: cors });
  const user = auth.user;
  if (user.role === 'VIDEO_EDITOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors });
  }

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
    location: location || null,
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
