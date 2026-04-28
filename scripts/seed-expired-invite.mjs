import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const inviterId = process.argv[2];
if (!inviterId) {
    console.error('Usage: node scripts/seed-expired-invite.mjs <inviterUserId>');
    process.exit(1);
}

const row = {
    email: `flicker-test-${Date.now()}@example.com`,
    name: 'Flicker Test',
    role: 'SALES',
    invited_by: inviterId,
    token: crypto.randomBytes(32).toString('hex'),
    assigned_gmail_account_ids: [],
    expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    status: 'EXPIRED',
};

const { data, error } = await sb.from('invitations').insert(row).select('id, email, status').single();
console.log(error ?? data);
