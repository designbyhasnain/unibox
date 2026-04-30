import { NextRequest, NextResponse } from 'next/server';
import { authenticateExtension } from '../../../../src/lib/extensionAuth';

export async function GET(request: NextRequest) {
    const auth = await authenticateExtension(request);
    if (!auth) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    return NextResponse.json(auth.user);
}
