import { createClient } from '@supabase/supabase-js';

// Browser-safe client — only uses NEXT_PUBLIC_ keys which are safe to expose
// Use this in all client components ('use client') and hooks
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('WARNING: Supabase client environment variables are missing (NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY).');
}

export const supabaseClient = createClient(
    supabaseUrl ?? 'https://placeholder.supabase.co',
    supabaseAnonKey ?? 'placeholder-key'
);
