'use server';

import { getSession, clearSession } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';

/**
 * Phase 10: instant session payload — NO DB hit, NO awaits beyond
 * cookie decryption. Returns email/name/role/userId straight from the
 * signed cookie. Use this for any surface that needs to render
 * IMMEDIATELY (Account Settings modal email field, sidebar persona on
 * cold mount). Pair with `getCurrentUserAction()` for fresh DB-backed
 * data in the background.
 */
export async function getSessionPayloadAction() {
    const session = await getSession();
    if (!session) return null;
    return {
        userId: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
    };
}

export async function getCurrentUserAction() {
    const session = await getSession();
    if (!session) return null;

    // Always try to fetch fresh role + profile from DB. The session cookie
    // can have stale name/avatar after a profile update.
    //
    // Phase 9 fix: when the DB query errors (stale PostgREST schema cache,
    // pooler hiccup, transient timeout), don't return null — fall back to
    // the session data so the consumer (Account Settings modal, Sidebar)
    // can still render email + cookie-baked name.
    //
    // Phase 11: self-healing retry. When PostgREST returns a "schema cache"
    // error (transient, recovers in ~1s after a NOTIFY pgrst reload), wait
    // 500ms and retry once before falling back. Eliminates the user-visible
    // hiccup banner entirely for the common transient case.
    const lookup = async () => supabase
        .from('users')
        .select('role, name, avatar_url')
        .eq('id', session.userId)
        .maybeSingle();

    let { data: user, error } = await lookup();
    if (error && /schema cache|schema mismatch|Could not query/i.test(error.message)) {
        console.warn('[getCurrentUserAction] schema cache miss, retrying in 500ms...');
        await new Promise(r => setTimeout(r, 500));
        const retry = await lookup();
        user = retry.data;
        error = retry.error;
    }

    if (error) {
        console.error('[getCurrentUserAction] users lookup error — falling back to session:', error.message);
        return {
            ...session,
            role: session.role,
            name: session.name,
            avatarUrl: null,
            stale: true as const,
        };
    }

    if (!user) {
        // User row deleted while session still valid — clear session signal
        // is the consumer's call (some screens want to keep the cookie alive
        // for the user to retry, others should logout).
        return null;
    }

    return {
        ...session,
        role: user.role,
        name: user.name || session.name,
        avatarUrl: user.avatar_url || null,
        stale: false as const,
    };
}

/**
 * Instant logout: deletes the unibox_session cookie and returns. No DB hit,
 * no revalidatePath (which would invalidate every cached route in the app
 * tree before responding), no server-side redirect (which forced a full RSC
 * roundtrip). The caller navigates to /login itself via window.location for
 * sub-second perceived speed.
 */
export async function logoutAction() {
    await clearSession();
    return { success: true as const };
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
 * Upload + set the currently logged-in user's avatar. Saves the file to the
 * shared `avatars` Supabase bucket under users/{userId}/... and writes the
 * resulting public URL to users.avatar_url. Returns the new URL on success.
 *
 * Strictly self-service — the userId comes from the authenticated session,
 * not the form. There's no path for one user to overwrite another's avatar.
 */
const AVATARS_BUCKET = 'avatars';
const ALLOWED_AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

async function ensureAvatarsBucketSelfService(): Promise<void> {
    const { data: existing } = await supabase.storage.getBucket(AVATARS_BUCKET);
    if (existing) return;
    const { error } = await supabase.storage.createBucket(AVATARS_BUCKET, {
        public: true,
        fileSizeLimit: MAX_AVATAR_BYTES,
        allowedMimeTypes: ALLOWED_AVATAR_MIME,
    });
    if (error && !/already exists/i.test(error.message)) {
        throw new Error(`Failed to create avatars bucket: ${error.message}`);
    }
}

export async function uploadOwnAvatarAction(
    formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'Not authenticated' };

    const file = formData.get('file');
    if (!(file instanceof File)) return { success: false, error: 'No file uploaded' };
    if (file.size > MAX_AVATAR_BYTES) return { success: false, error: 'Image too large (max 5 MB)' };
    if (!ALLOWED_AVATAR_MIME.includes(file.type)) {
        return { success: false, error: 'Only JPG, PNG, WebP, GIF accepted' };
    }

    try {
        await ensureAvatarsBucketSelfService();

        const ext = (file.name.split('.').pop() || 'img').toLowerCase().replace(/[^a-z0-9]/g, '');
        // Per-user folder so we can rotate images without leaking across accounts.
        const path = `users/${session.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'img'}`;
        const bytes = Buffer.from(await file.arrayBuffer());

        const { error: uploadError } = await supabase.storage
            .from(AVATARS_BUCKET)
            .upload(path, bytes, {
                contentType: file.type,
                cacheControl: '31536000',
                upsert: false,
            });
        if (uploadError) return { success: false, error: uploadError.message };

        const { data: pub } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
        const url = pub.publicUrl;

        const { error: updateError } = await supabase
            .from('users')
            .update({ avatar_url: url })
            .eq('id', session.userId);
        if (updateError) {
            console.error('[uploadOwnAvatarAction] DB update failed', updateError);
            return { success: false, error: 'Uploaded but failed to save URL' };
        }

        // Bust Next's data cache for routes that render this user's avatar
        // server-side. Live components (sidebar pill, etc.) already pick up
        // the change via the unibox:profile-updated CustomEvent + the
        // localStorage write in the modal — this covers everything that
        // doesn't hydrate from those signals.
        try {
            revalidatePath('/team');
            revalidatePath('/dashboard');
            revalidatePath('/');
        } catch (e) {
            // revalidatePath can throw outside a request context; non-fatal.
            console.warn('[uploadOwnAvatarAction] revalidatePath skipped:', (e as Error)?.message);
        }

        return { success: true, url };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Upload failed' };
    }
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
