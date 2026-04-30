import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';
import { authenticateExtension, applyContactScope } from '../../../../src/lib/extensionAuth';

export async function GET(request: NextRequest) {
    const auth = await authenticateExtension(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

    // Phase 5 RBAC: scope contacts to the caller's accessible set so a SALES
    // user with one Gmail inbox can no longer dump every contact in the org.
    const scoped = applyContactScope(query, auth);
    if (!scoped) return NextResponse.json({ exists: false });

    const { data, error } = await scoped.maybeSingle();
    if (error) {
        console.error('[extension/clients GET]', error);
        return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    return NextResponse.json(data ? { exists: true, client: data } : { exists: false });
}

export async function POST(request: NextRequest) {
    const auth = await authenticateExtension(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = auth.user;
    // Editors cannot create contacts via the extension.
    if (user.role === 'VIDEO_EDITOR') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
