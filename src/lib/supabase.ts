import 'server-only';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing required Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).');
    }
    console.warn('WARNING: Supabase environment variables are missing (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY). Check Vercel Settings.');
}

// Server-side client with full access (service role) — never expose to browser
export const supabase = createClient(
    supabaseUrl ?? 'https://placeholder.supabase.co',
    supabaseServiceKey ?? 'placeholder-key',
    {
        auth: {
            persistSession: false,
        },
    }
);
