'use server';

import { getSession, clearSession } from './auth';
import { redirect } from 'next/navigation';
import { DEFAULT_USER_ID } from '../../app/constants/config';

/**
 * Ensures the user is authenticated and returns their ID.
 * Implements "Shared Dashboard" logic where all authorized team members
 * see the primary workspace's data.
 */
export async function ensureAuthenticated() {
    const session = await getSession();
    if (!session) {
        // Clear the invalid session cookie
        await clearSession();
        // Redirect the user to login
        redirect('/login');
    }
    
    // As per user request: "Same dashboard as Abdur Rehman" for all team members.
    // We return the primary dashboard ID instead of the individual login's ID.
    // This provides a unified workspace for the whole team.
    return DEFAULT_USER_ID;
}

/**
 * Returns the effective userId for the current session.
 * Always falls back to DEFAULT_USER_ID to maintain a unified workspace.
 */
export async function getUserId() {
    const session = await getSession();
    if (session) return DEFAULT_USER_ID;
    
    // Fallback only in development and if explicitly allowed
    if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEFAULT_USER === 'true') {
        return DEFAULT_USER_ID;
    }
    
    return null;
}
