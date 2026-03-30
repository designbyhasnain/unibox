require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
    const { data, error } = await supabase.from('contacts').select('id, name, account_manager_id, account_manager:users(name)').not('account_manager_id', 'is', null).limit(1);
    console.log('Result for not null account_manager:', JSON.stringify(data, null, 2));
    console.log('Error:', error);
}
run();
