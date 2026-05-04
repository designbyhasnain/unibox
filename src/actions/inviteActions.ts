'use server';

import * as crypto from 'crypto';
import { Resend } from 'resend';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';

// Lazy: only instantiate when actually sending. Constructing at module load
// throws "Missing API key" if RESEND_API_KEY is unset, which breaks every
// route that imports this module (e.g. /team) — even routes that never send.
let _resend: Resend | null = null;
function getResend(): Resend {
    if (!_resend) {
        if (!process.env.RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY is not set — cannot send invitation email');
        }
        _resend = new Resend(process.env.RESEND_API_KEY);
    }
    return _resend;
}

// Invitation tokens: the URL token is a 64-char hex string. We store only the
// SHA-256 hash in the DB so a stolen DB read can't be replayed against
// /invite/accept. The plaintext token leaves the server exactly twice — in
// the email body, and in the response of sendInvite/resendInvite (which the
// admin UI uses to display "Copy invite link" once at send time).
function hashInviteToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function buildInviteHtml(inviteUrl: string) {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>You're Invited!</h2>
      <p>You have been invited to join Unibox CRM.</p>
      <p>Click the link below to accept your invitation:</p>
      <a href="${inviteUrl}" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
        Accept Invitation
      </a>
      <p>This link expires in 7 days.</p>
    </div>
  `;
}

async function sendInviteViaResend(toEmail: string, inviteUrl: string) {
    console.error('[RESEND] Sending invite to:', toEmail);
    console.error('[RESEND] API key exists:', !!process.env.RESEND_API_KEY);

    const { data, error } = await getResend().emails.send({
        from: 'Unibox <noreply@texasbrains.com>',
        to: [toEmail],
        subject: 'You have been invited to join Unibox',
        html: buildInviteHtml(inviteUrl),
    });

    if (error) {
        console.error('[RESEND FAILED]', JSON.stringify(error));
        throw new Error('Email failed: ' + error.message);
    }

    console.error('[RESEND SUCCESS] id:', data?.id);
}

/**
 * Send an invitation to join the app.
 * ADMIN only.
 */
export async function sendInviteAction(params: {
    email: string;
    name: string;
    role: 'ADMIN' | 'SALES' | 'VIDEO_EDITOR';
    assignedGmailAccountIds: string[];
}) {
    console.error('[INVITE] sendInviteAction called for:', params.email);
    const { userId, role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };

    const { email, name, role: inviteRole, assignedGmailAccountIds } = params;
    if (!email || !name || !inviteRole) {
        return { success: false, error: 'Email, name, and role are required' };
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();

    if (existingUser) {
        return { success: false, error: 'A user with this email already exists' };
    }

    // Check for pending invite
    const { data: existingInvite } = await supabase
        .from('invitations')
        .select('id, status')
        .eq('email', normalizedEmail)
        .maybeSingle();

    if (existingInvite) {
        if (existingInvite.status === 'PENDING') {
            return { success: false, error: 'A pending invitation already exists for this email' };
        }
        // Remove old expired/accepted invitation so we can create a fresh one
        await supabase.from('invitations').delete().eq('id', existingInvite.id);
    }

    // Generate token. The raw token is sent via email + returned to the admin
    // UI for the "copy invite link" affordance; only the SHA-256 hash is
    // persisted so a DB read can't be replayed.
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error } = await supabase
        .from('invitations')
        .insert({
            email: normalizedEmail,
            name,
            role: inviteRole,
            invited_by: userId,
            token: tokenHash,
            assigned_gmail_account_ids: assignedGmailAccountIds,
            expires_at: expiresAt,
            status: 'PENDING',
        })
        .select('id, email, name, role, status, expires_at, created_at, invited_by, assigned_gmail_account_ids')
        .single();

    if (error) {
        console.error('[INVITE] DB insert error:', JSON.stringify(error));
        return { success: false, error: `Failed to create invitation: ${error.message}` };
    }

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/accept?token=${rawToken}`;

    try {
        await sendInviteViaResend(normalizedEmail, inviteUrl);
    } catch (emailErr: any) {
        console.error('[INVITE] Email send failed:', emailErr?.message);
    }

    return { success: true, invitation, inviteUrl };
}

/**
 * List pending + expired invitations. ADMIN only.
 * ACCEPTED invitations are hidden (those users live in the Team Members list).
 */
export async function listInvitesAction() {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, invitations: [], error: 'Admin access required' };

    // SECURITY: Never return the `token` column to the browser — even hashed,
    // the row is still useful for replay attacks if the DB column gets
    // un-hashed in a regression. Explicitly enumerate safe fields.
    const safeSelect = 'id, email, name, role, status, expires_at, accepted_at, created_at, invited_by, assigned_gmail_account_ids';
    const { data, error } = await supabase
        .from('invitations')
        .select(`${safeSelect}, users!invitations_invited_by_fkey(name, email)`)
        .in('status', ['PENDING', 'EXPIRED'])
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[inviteActions] listInvitesAction error:', error);
        const { data: fallbackData } = await supabase
            .from('invitations')
            .select(safeSelect)
            .in('status', ['PENDING', 'EXPIRED'])
            .order('created_at', { ascending: false });
        return { success: true, invitations: fallbackData || [] };
    }

    return { success: true, invitations: data || [] };
}

/**
 * Revoke (delete) an invitation. Works on both PENDING and EXPIRED.
 * ADMIN only. Row is permanently removed so it disappears from the list.
 */
export async function revokeInviteAction(inviteId: string) {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };

    const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', inviteId)
        .in('status', ['PENDING', 'EXPIRED']);

    if (error) {
        console.error('[inviteActions] revokeInviteAction error:', error);
        return { success: false, error: 'Failed to revoke invitation' };
    }

    return { success: true };
}

/**
 * Permanently delete an invitation regardless of status (PENDING / EXPIRED / ACCEPTED).
 * ADMIN only. Use this when an admin wants to fully purge an invite row from the table.
 * `revokeInviteAction` is the status-restricted variant kept for the existing Revoke UX.
 */
export async function deleteInvitationAction(inviteId: string) {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };

    const { error } = await supabase.from('invitations').delete().eq('id', inviteId);
    if (error) {
        console.error('[inviteActions] deleteInvitationAction error:', error);
        return { success: false, error: 'Failed to delete invitation' };
    }

    return { success: true };
}

/**
 * Resend an invitation. Works on both PENDING and EXPIRED — expired invitations
 * are reset to PENDING with a fresh 7-day token. ADMIN only.
 */
export async function resendInviteAction(inviteId: string) {
    console.error('[INVITE] resendInviteAction called for id:', inviteId);
    const { userId, role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };

    const newRawToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = hashInviteToken(newRawToken);
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error } = await supabase
        .from('invitations')
        .update({
            token: newTokenHash,
            expires_at: newExpiry,
            status: 'PENDING',
        })
        .eq('id', inviteId)
        .in('status', ['PENDING', 'EXPIRED'])
        .select('id, email, name, role, status, expires_at')
        .single();

    if (error || !invitation) {
        console.error('[INVITE] resend DB update failed:', JSON.stringify(error));
        return { success: false, error: 'Failed to resend invitation' };
    }

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/accept?token=${newRawToken}`;

    try {
        await sendInviteViaResend(invitation.email, inviteUrl);
    } catch (emailErr: any) {
        console.error('[INVITE] Email resend failed:', emailErr?.message);
    }

    return { success: true, inviteUrl };
}

/**
 * Validate an invite token (public - used by invite accept page).
 */
export async function validateInviteTokenAction(token: string) {
    if (!token || token.length !== 64) {
        return { valid: false, error: 'Invalid token' };
    }

    // Match the SHA-256 hash of the URL token against the stored hash.
    // Legacy fallback: if no row matches the hash, also try the raw token —
    // this lets in-flight invites issued before the hash-at-rest migration
    // continue to work until they expire (max 7 days).
    const tokenHash = hashInviteToken(token);
    let { data: invitation, error } = await supabase
        .from('invitations')
        .select('id, email, name, role, status, expires_at, invited_by')
        .eq('token', tokenHash)
        .maybeSingle();

    if (!invitation) {
        const legacy = await supabase
            .from('invitations')
            .select('id, email, name, role, status, expires_at, invited_by')
            .eq('token', token)
            .maybeSingle();
        invitation = legacy.data;
        error = legacy.error;
    }

    if (error || !invitation) {
        return { valid: false, error: 'Invitation not found' };
    }

    if (invitation.status !== 'PENDING') {
        return { valid: false, error: `Invitation has already been ${invitation.status.toLowerCase()}` };
    }

    if (new Date(invitation.expires_at) < new Date()) {
        await supabase.from('invitations').update({ status: 'EXPIRED' }).eq('id', invitation.id);
        return { valid: false, error: 'Invitation has expired' };
    }

    // Get inviter name
    const { data: inviter } = await supabase
        .from('users')
        .select('name')
        .eq('id', invitation.invited_by)
        .maybeSingle();

    return {
        valid: true,
        invitation: {
            ...invitation,
            inviterName: inviter?.name || 'An admin',
        },
    };
}
