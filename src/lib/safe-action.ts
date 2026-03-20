'use server';

import { getSession, clearSession } from './auth';
import { redirect } from 'next/navigation';

/**
 * Ensures the user is authenticated and returns their userId and role.
 */
export async function ensureAuthenticated(): Promise<{ userId: string; role: string }> {
    const session = await getSession();
    if (!session) {
        await clearSession();
        redirect('/login');
    }

    return { userId: session.userId, role: session.role };
}

/**
 * Returns the effective userId and role for the current session.
 */
export async function getUserId(): Promise<{ userId: string; role: string } | null> {
    const session = await getSession();
    if (session) return { userId: session.userId, role: session.role };

    return null;
}
