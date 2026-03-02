import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function getEnvVar(name) {
    if (process.env[name]) return process.env[name];
    try {
        const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
        const match = envContent.match(new RegExp(`${name}=([^\\n\\r]+)`));
        if (match) return match[1].trim();
    } catch (e) { }
    return '';
}

const url = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
const key = getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');

// console.log("Initializing supabase:", url);
const supabase = createClient(url, key);

async function clean() {
    console.log('Fetching all contacts...');
    const { data: contacts, error } = await supabase.from('contacts').select('id, email, name');

    if (error) {
        console.log('Error:', error);
        return;
    }

    if (!contacts) return;
    console.log(`Checking ${contacts.length} contacts for orphans...`);

    let deleted = 0;
    for (const c of contacts) {
        const { count, error: cErr } = await supabase
            .from('email_messages')
            .select('*', { count: 'exact', head: true })
            .eq('contact_id', c.id);

        if (cErr) {
            console.log('Count Error for', c.id, cErr);
            continue;
        }

        if (count === 0) {
            console.log(`Deleting orphaned contact: ${c.email || c.name}`);
            await supabase.from('projects').delete().eq('client_id', c.id);
            await supabase.from('contacts').delete().eq('id', c.id);
            deleted++;
        }
    }
    console.log(`Deleted ${deleted} orphaned contacts.`);
}

clean();
