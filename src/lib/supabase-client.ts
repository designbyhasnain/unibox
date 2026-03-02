import { createClient } from '@supabase/supabase-js';

// ✅ Browser-safe client — only uses NEXT_PUBLIC_ keys which are safe to expose
// Use this in all client components ('use client') and hooks
export const supabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
