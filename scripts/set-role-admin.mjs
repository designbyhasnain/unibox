import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}
const supabase = createClient(url, key);

const target = process.argv[2];
const role = process.argv[3];
if (!target || !role) {
    console.error('Usage: node scripts/set-role-admin.mjs <email> <ROLE>');
    process.exit(1);
}

const before = await supabase.from('users').select('id, email, role').eq('email', target).maybeSingle();
console.log('BEFORE:', before.data ?? before.error);

const upd = await supabase.from('users').update({ role }).eq('email', target).select('id, email, role').maybeSingle();
console.log('AFTER :', upd.data ?? upd.error);
