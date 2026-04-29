'use server';

import { getSession, clearSession } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';

export async function getCurrentUserAction() {
    const session = await getSession();
    if (!session) return null;

    // Always fetch fresh role + profile from DB (the cookie has stale name/avatar
    // when the user updates their settings).
    const { data: user } = await supabase
        .from('users')
        .select('role, name, avatar_url')
        .eq('id', session.userId)
        .maybeSingle();

    if (!user) return null;

    return {
        ...session,
        role: user.role,
        name: user.name || session.name,
        avatarUrl: user.avatar_url || null,
    };
}

export async function logoutAction() {
    await clearSession();
    revalidatePath('/');
    redirect('/login');
}

/**
 * Update the currently logged-in user's display name. Returns the new name.
 * Anyone can update their own name; no role check needed.
 */
export async function updateOwnNameAction(newName: string) {
    const session = await getSession();
    if (!session) return { success: false as const, error: 'Not authenticated' };

    const trimmed = newName.trim();
    if (trimmed.length < 1 || trimmed.length > 80) {
        return { success: false as const, error: 'Name must be 1-80 characters' };
    }

    const { error } = await supabase
        .from('users')
        .update({ name: trimmed })
        .eq('id', session.userId);

    if (error) {
        console.error('[updateOwnNameAction]', error);
        return { success: false as const, error: 'Failed to update name' };
    }
    return { success: true as const, name: trimmed };
}

/**
 * Change the currently logged-in user's password. Requires the current
 * password to authenticate the change (defense-in-depth — even if a session
 * is hijacked, the attacker still can't lock the legitimate user out).
 */
export async function changeOwnPasswordAction(currentPassword: string, newPassword: string) {
    const session = await getSession();
    if (!session) return { success: false as const, error: 'Not authenticated' };

    if (!newPassword || newPassword.length < 8) {
        return { success: false as const, error: 'New password must be at least 8 characters' };
    }

    const { data: user } = await supabase
        .from('users')
        .select('password')
        .eq('id', session.userId)
        .maybeSingle();

    if (!user) return { success: false as const, error: 'User not found' };

    // If the user has a current password set, verify it. Users who signed up
    // via Google OAuth without ever setting a password skip this check (they
    // can set one for the first time without proving the old one).
    if (user.password) {
        const ok = await bcrypt.compare(currentPassword, user.password);
        if (!ok) return { success: false as const, error: 'Current password is incorrect' };
    }

    const hash = await bcrypt.hash(newPassword, 12);
    const { error } = await supabase
        .from('users')
        .update({ password: hash })
        .eq('id', session.userId);

    if (error) {
        console.error('[changeOwnPasswordAction]', error);
        return { success: false as const, error: 'Failed to change password' };
    }
    return { success: true as const };
}
