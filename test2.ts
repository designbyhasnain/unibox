import { createClient } from '@supabase/supabase-js';
const dotenv = require('dotenv');
const path = require('path');

// Load env from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('contacts')
        .select(`
            id,
            name,
            account_manager_id,
            users ( name )
        `)
        .limit(20);

    console.log("Without alias users():", data?.map(d => `${d.name}: manager_id=${d.account_manager_id}, users=${JSON.stringify(d.users)}`), error);

    const res2 = await supabase
        .from('contacts')
        .select(`
            id,
            account_manager:users(name)
        `)
        .limit(5);

    console.log("With alias account_manager:users():", res2.data, res2.error?.message);
}

check();
