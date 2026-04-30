import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';

// CORS: only echo back chrome-extension:// origins. See add-lead/route.ts.
function corsHeaders(req: NextRequest) {
    const origin = req.headers.get('origin') || '';
    const allowed = origin.startsWith('chrome-extension://') ? origin : 'null';
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Vary': 'Origin',
    };
}

export async function OPTIONS(req: NextRequest) {
    return NextResponse.json({}, { headers: corsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const cors = corsHeaders(req);
  const apiKey = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 401, headers: cors });

  const { data: user } = await supabase.from('users').select('id, name').eq('extension_api_key', apiKey).single();
  if (!user) return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: cors });

  return NextResponse.json({ ok: true, user: user.name }, { headers: cors });
}
