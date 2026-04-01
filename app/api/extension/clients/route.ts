import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';

async function authenticateExtension(request: NextRequest) {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer unibox_ext_')) return null;
    const { data } = await supabase
        .from('users')
        .select('id, name, email, role')
        .eq('extension_api_key', auth.slice(7))
        .maybeSingle();
    return data;
}

export async function GET(request: NextRequest) {
    const user = await authenticateExtension(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const phone = searchParams.get('phone');
    const name = searchParams.get('name');

    let query = supabase.from('contacts').select('id, name, email, phone, company, source, source_url, pipeline_stage, created_at');

    if (email) {
        query = query.eq('email', email.toLowerCase().trim());
    } else if (phone) {
        query = query.eq('phone', phone);
    } else if (name) {
        query = query.ilike('name', `%${name}%`);
    } else {
        return NextResponse.json({ error: 'Provide email, phone, or name' }, { status: 400 });
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
        console.error('[extension/clients GET]', error);
        return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    return NextResponse.json(data ? { exists: true, client: data } : { exists: false });
}

export async function POST(request: NextRequest) {
    const user = await authenticateExtension(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { name, email, phone, company, source, sourceUrl, notes } = body;

    if (!email && !name) {
        return NextResponse.json({ error: 'Name or email required' }, { status: 400 });
    }

    if (email) {
        const { data: existing } = await supabase
            .from('contacts')
            .select('id, name, email')
            .eq('email', email.toLowerCase().trim())
            .maybeSingle();
        if (existing) {
            return NextResponse.json({ exists: true, client: existing }, { status: 409 });
        }
    }

    const insertData: Record<string, any> = {
        name: name || email?.split('@')[0] || 'Unknown',
        email: email?.toLowerCase().trim() || null,
        pipeline_stage: 'LEAD',
        contact_type: 'LEAD',
        is_lead: true,
        account_manager_id: user.id,
        updated_at: new Date().toISOString(),
    };
    if (phone) insertData.phone = phone;
    if (company) insertData.company = company;
    if (source) insertData.source = source;
    if (sourceUrl) insertData.source_url = sourceUrl;
    if (notes) insertData.notes = notes;

    const { data, error } = await supabase
        .from('contacts')
        .insert(insertData)
        .select('id, name, email, phone, company, source, pipeline_stage')
        .single();

    if (error) {
        console.error('[extension/clients POST]', error);
        return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
    }

    return NextResponse.json({ success: true, client: data }, { status: 201 });
}
