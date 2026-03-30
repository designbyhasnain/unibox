'use server';

import { getSession, clearSession } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function getCurrentUserAction() {
    const session = await getSession();
    if (!session) return null;

    // Always fetch fresh role from database
    const { data: user } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.userId)
        .maybeSingle();

    if (!user) return null;

    return { ...session, role: user.role };
}

export async function logoutAction() {
    await clearSession();
    revalidatePath('/');
    redirect('/login');
}
