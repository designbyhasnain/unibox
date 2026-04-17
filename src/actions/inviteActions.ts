'use server';

import * as crypto from 'crypto';
import { Resend } from 'resend';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';

const resend = new Resend(process.env.RESEND_API_KEY);

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

    const { data, error } = await resend.emails.send({
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

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error } = await supabase
        .from('invitations')
        .insert({
            email: normalizedEmail,
            name,
            role: inviteRole,
            invited_by: userId,
            token,
            assigned_gmail_account_ids: assignedGmailAccountIds,
            expires_at: expiresAt,
            status: 'PENDING',
        })
        .select()
        .single();

    if (error) {
        console.error('[INVITE] DB insert error:', JSON.stringify(error));
        return { success: false, error: `Failed to create invitation: ${error.message}` };
    }

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/accept?token=${token}`;

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

    const { data, error } = await supabase
        .from('invitations')
        .select('*, users!invitations_invited_by_fkey(name, email)')
        .in('status', ['PENDING', 'EXPIRED'])
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[inviteActions] listInvitesAction error:', error);
        const { data: fallbackData } = await supabase
            .from('invitations')
            .select('*')
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
 * Resend an invitation. Works on both PENDING and EXPIRED — expired invitations
 * are reset to PENDING with a fresh 7-day token. ADMIN only.
 */
export async function resendInviteAction(inviteId: string) {
    console.error('[INVITE] resendInviteAction called for id:', inviteId);
    const { userId, role } = await ensureAuthenticated();
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') return { success: false, error: 'Admin access required' };

    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error } = await supabase
        .from('invitations')
        .update({
            token: newToken,
            expires_at: newExpiry,
            status: 'PENDING',
        })
        .eq('id', inviteId)
        .in('status', ['PENDING', 'EXPIRED'])
        .select()
        .single();

    if (error || !invitation) {
        console.error('[INVITE] resend DB update failed:', JSON.stringify(error));
        return { success: false, error: 'Failed to resend invitation' };
    }

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/accept?token=${newToken}`;

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

    const { data: invitation, error } = await supabase
        .from('invitations')
        .select('id, email, name, role, status, expires_at, invited_by')
        .eq('token', token)
        .maybeSingle();

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
