'use server';

import * as crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';

/**
 * Send an invitation to join the app.
 * ADMIN only.
 */
export async function sendInviteAction(params: {
    email: string;
    name: string;
    role: 'ADMIN' | 'SALES';
    assignedGmailAccountIds: string[];
}) {
    const { userId, role } = await ensureAuthenticated();
    if (role !== 'ADMIN') return { success: false, error: 'Admin access required' };

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
        .eq('status', 'PENDING')
        .maybeSingle();

    if (existingInvite) {
        return { success: false, error: 'A pending invitation already exists for this email' };
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

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
        console.error('[inviteActions] sendInviteAction error:', error);
        return { success: false, error: 'Failed to create invitation' };
    }

    // Try to send invite email via first available OAuth account
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/accept?token=${token}`;

    try {
        await sendInviteEmail(normalizedEmail, name, inviteUrl, userId);
    } catch (emailErr) {
        console.warn('[inviteActions] Could not send invite email, link available in dashboard:', emailErr);
    }

    return { success: true, invitation, inviteUrl };
}

/**
 * List all invitations. ADMIN only.
 */
export async function listInvitesAction() {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN') return { success: false, invitations: [], error: 'Admin access required' };

    const { data, error } = await supabase
        .from('invitations')
        .select('*, users!invitations_invited_by_fkey(name, email)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[inviteActions] listInvitesAction error:', error);
        // Fallback: try without the join
        const { data: fallbackData } = await supabase
            .from('invitations')
            .select('*')
            .order('created_at', { ascending: false });
        return { success: true, invitations: fallbackData || [] };
    }

    return { success: true, invitations: data || [] };
}

/**
 * Revoke a pending invitation. ADMIN only.
 */
export async function revokeInviteAction(inviteId: string) {
    const { role } = await ensureAuthenticated();
    if (role !== 'ADMIN') return { success: false, error: 'Admin access required' };

    const { error } = await supabase
        .from('invitations')
        .update({ status: 'EXPIRED' })
        .eq('id', inviteId)
        .eq('status', 'PENDING');

    if (error) {
        console.error('[inviteActions] revokeInviteAction error:', error);
        return { success: false, error: 'Failed to revoke invitation' };
    }

    return { success: true };
}

/**
 * Resend a pending invitation. ADMIN only.
 */
export async function resendInviteAction(inviteId: string) {
    const { userId, role } = await ensureAuthenticated();
    if (role !== 'ADMIN') return { success: false, error: 'Admin access required' };

    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error } = await supabase
        .from('invitations')
        .update({
            token: newToken,
            expires_at: newExpiry,
        })
        .eq('id', inviteId)
        .eq('status', 'PENDING')
        .select()
        .single();

    if (error || !invitation) {
        return { success: false, error: 'Failed to resend invitation' };
    }

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/accept?token=${newToken}`;

    try {
        await sendInviteEmail(invitation.email, invitation.name, inviteUrl, userId);
    } catch (emailErr) {
        console.warn('[inviteActions] Could not send invite email:', emailErr);
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
        // Auto-expire
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

// ─── Helper: Send invite email ──────────────────────────────────────────────

async function sendInviteEmail(toEmail: string, toName: string, inviteUrl: string, adminUserId: string) {
    // Get admin info
    const { data: admin } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', adminUserId)
        .maybeSingle();

    const adminName = admin?.name || 'Admin';

    // Try to find first active OAuth account to send from
    const { data: senderAccount } = await supabase
        .from('gmail_accounts')
        .select('id, connection_method')
        .eq('status', 'ACTIVE')
        .eq('connection_method', 'OAUTH')
        .limit(1)
        .maybeSingle();

    if (!senderAccount) {
        console.log(`[inviteActions] No sender account available. Invite URL: ${inviteUrl}`);
        return;
    }

    // Use the gmail sender service
    const { sendGmailEmail } = await import('../services/gmailSenderService');

    const emailBody = `
        <div style="font-family: 'Google Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 32px;">
                <div style="display: inline-block; width: 48px; height: 48px; background: #1a73e8; border-radius: 12px; line-height: 48px; text-align: center;">
                    <span style="color: white; font-size: 24px; font-weight: bold;">U</span>
                </div>
                <h1 style="color: #202124; font-size: 24px; margin: 16px 0 4px;">You're invited to Unibox</h1>
                <p style="color: #5f6368; font-size: 14px; margin: 0;">${adminName} has invited you to join the team</p>
            </div>
            <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                <p style="color: #202124; font-size: 14px; margin: 0 0 4px;">Hello <strong>${toName}</strong>,</p>
                <p style="color: #5f6368; font-size: 14px; margin: 0;">Click the button below to accept your invitation and get started.</p>
            </div>
            <div style="text-align: center; margin-bottom: 32px;">
                <a href="${inviteUrl}" style="display: inline-block; background: #1a73e8; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 500;">Accept Invitation</a>
            </div>
            <p style="color: #80868b; font-size: 12px; text-align: center;">This invitation expires in 72 hours. If you didn't expect this, you can ignore this email.</p>
        </div>
    `;

    await sendGmailEmail({
        accountId: senderAccount.id,
        to: toEmail,
        subject: `${adminName} invited you to Unibox`,
        body: emailBody,
    });
}
