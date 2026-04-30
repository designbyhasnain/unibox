import { NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { getSession } from '../../../../src/lib/auth';
import { supabase } from '../../../../src/lib/supabase';
import { hashApiKey } from '../../../../src/lib/extensionAuth';

export async function POST() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = `unibox_ext_${crypto.randomBytes(32).toString('hex')}`;
    const hash = hashApiKey(apiKey);

    // Phase 5: persist the hash. The plaintext column is left null going
    // forward — only the just-generated key value is returned to the user
    // (the only moment it's known plaintext). Future logins compare hashes.
    const { error } = await supabase
        .from('users')
        .update({ extension_api_key: null, extension_api_key_hash: hash })
        .eq('id', session.userId);

    if (error) {
        console.error('[extension/generate-key]', error);
        return NextResponse.json({ error: 'Failed to generate key' }, { status: 500 });
    }

    return NextResponse.json({ apiKey });
}
