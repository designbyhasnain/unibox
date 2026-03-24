'use server';

import { getSession, clearSession } from './auth';
import { supabase } from './supabase';
import { redirect } from 'next/navigation';

/**
 * Fetches fresh role from database for a given userId.
 */
async function getFreshRole(userId: string): Promise<string | null> {
    const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
    return data?.role ?? null;
}

/**
 * Ensures the user is authenticated and returns their userId and role.
 */
export async function ensureAuthenticated(): Promise<{ userId: string; role: string }> {
    const session = await getSession();
    if (!session) {
        await clearSession();
        redirect('/login');
    }

    // Always fetch fresh role from database
    const freshRole = await getFreshRole(session.userId);
    if (!freshRole) {
        await clearSession();
        redirect('/login');
    }

    return { userId: session.userId, role: freshRole };
}

/**
 * Returns the effective userId and role for the current session.
 */
export async function getUserId(): Promise<{ userId: string; role: string } | null> {
    const session = await getSession();
    if (!session) return null;

    // Always fetch fresh role from database
    const freshRole = await getFreshRole(session.userId);
    if (!freshRole) return null;

    return { userId: session.userId, role: freshRole };
}
