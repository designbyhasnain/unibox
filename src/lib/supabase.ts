import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('⚠️ Supabase environment variables are missing! Check Vercel Settings.');
}

// Server-side client with full access (service role) — never expose to browser
export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseServiceKey || 'placeholder-key',
    {
        auth: {
            persistSession: false,
        },
    }
);
