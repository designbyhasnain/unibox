import { NextRequest, NextResponse } from 'next/server';
import { authenticateExtension } from '../../../../src/lib/extensionAuth';

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
  const auth = await authenticateExtension(req);
  if (!auth) return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: cors });
  return NextResponse.json({ ok: true, user: auth.user.name }, { headers: cors });
}
