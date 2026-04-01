import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';

export async function GET(request: NextRequest) {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer unibox_ext_')) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const apiKey = auth.slice(7);
    const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role')
        .eq('extension_api_key', apiKey)
        .maybeSingle();

    if (error || !data) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    return NextResponse.json(data);
}
