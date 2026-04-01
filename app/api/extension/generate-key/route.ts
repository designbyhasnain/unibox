import { NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { getSession } from '../../../../src/lib/auth';
import { supabase } from '../../../../src/lib/supabase';

export async function POST() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = `unibox_ext_${crypto.randomBytes(32).toString('hex')}`;

    const { error } = await supabase
        .from('users')
        .update({ extension_api_key: apiKey })
        .eq('id', session.userId);

    if (error) {
        console.error('[extension/generate-key]', error);
        return NextResponse.json({ error: 'Failed to generate key' }, { status: 500 });
    }

    return NextResponse.json({ apiKey });
}
