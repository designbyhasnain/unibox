const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testRPC() {
    const userId = '1ca1464d-1009-426e-96d5-8c5e8c84faac';

    // 1. Get account IDs
    const { data: accounts } = await supabase
        .from('gmail_accounts')
        .select('id')
        .eq('user_id', userId);

    if (!accounts || accounts.length === 0) {
        console.log('No accounts found for user');
        return;
    }
    const ids = accounts.map(a => a.id);
    console.log('Account IDs:', ids.length);

    // 2. Call RPC
    const { data, error } = await supabase.rpc('get_inbox_threads', {
        p_account_ids: ids,
        p_pipeline_stage: 'COLD_LEAD',
        p_page: 1,
        p_page_size: 25,
        p_is_spam: false
    });

    if (error) {
        console.error('RPC Error:', error);
    } else {
        console.log('RPC Results:', data?.length || 0);
        if (data?.length > 0) {
            console.log('Sample result:', JSON.stringify(data[0]).substring(0, 100));
        }
    }
}

testRPC();
