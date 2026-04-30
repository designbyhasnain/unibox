import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as crypto from 'crypto';
import { validateOAuthState } from '../../../../../../src/services/googleAuthService';
import { verifyCrmAuth } from '../../../../../../src/services/crmAuthService';
import { createSession } from '../../../../../../src/lib/auth';
import { supabase } from '../../../../../../src/lib/supabase';

// Phase 1 (commit e9cb263) migrated invitation tokens to SHA-256 at rest.
// Both `validateInviteTokenAction` and this callback must hash the URL
// token before looking it up. Legacy plaintext rows still in the table
// will match via the secondary fallback below until they expire.
function hashInviteToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

const ALLOWED_ROLES = new Set(['ADMIN', 'ACCOUNT_MANAGER', 'SALES', 'VIDEO_EDITOR']);

// Failure-branch logging helper — tail server logs to see exactly which
// branch redirected to /login?error=auth_failed. The user-facing message
// stays generic ("Could not verify your Google account") so we don't leak
// internals in the URL bar.
function fail(reason: string, context: Record<string, unknown> = {}): NextResponse {
    console.error('[CRM OAuth callback] auth_failed —', reason, context);
    return NextResponse.redirect(new URL('/login?error=auth_failed', context.requestUrl as string || '/login'));
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    // Extract invite token from state parameter (format: crm_xxx.invite.TOKEN)
    let inviteToken: string | undefined;
    let baseState: string | null = state;
    if (state && state.includes('.invite.')) {
        const parts = state.split('.invite.');
        baseState = parts[0] ?? null;
        inviteToken = parts[1];
    }

    const cookieStore = await cookies();
    const expectedState = cookieStore.get('crm_oauth_state')?.value;

    // 1. Validate state (compare base state without invite token)
    if (!validateOAuthState(baseState, expectedState || null)) {
        return fail('state mismatch', { requestUrl: request.url, hasState: !!state, hasExpected: !!expectedState });
    }

    // Cleanup cookies
    cookieStore.delete('crm_oauth_state');

    if (!code) {
        return fail('missing code param', { requestUrl: request.url });
    }

    try {
        // 2. Verify Google Token
        const googleUser = await verifyCrmAuth(code);
        if (!googleUser || !googleUser.email) {
            return fail('verifyCrmAuth returned no email', { requestUrl: request.url, hasGoogleUser: !!googleUser });
        }

        // 3. Handle invite acceptance
        if (inviteToken) {
            // Look up invitation by hashed token (Phase 1 migration). Fall back
            // to raw token for any legacy plaintext rows still in the table.
            const tokenHash = hashInviteToken(inviteToken);
            let { data: invitation } = await supabase
                .from('invitations')
                .select('*')
                .eq('token', tokenHash)
                .eq('status', 'PENDING')
                .maybeSingle();
            if (!invitation) {
                const legacy = await supabase
                    .from('invitations')
                    .select('*')
                    .eq('token', inviteToken)
                    .eq('status', 'PENDING')
                    .maybeSingle();
                invitation = legacy.data;
            }

            if (!invitation) {
                return NextResponse.redirect(new URL('/invite/accept?error=Invalid+or+expired+invitation', request.url));
            }

            if (new Date(invitation.expires_at) < new Date()) {
                await supabase.from('invitations').update({ status: 'EXPIRED' }).eq('id', invitation.id);
                return NextResponse.redirect(new URL('/invite/accept?error=Invitation+has+expired', request.url));
            }

            // Verify email matches
            if (googleUser.email.toLowerCase() !== invitation.email.toLowerCase()) {
                return NextResponse.redirect(new URL(`/invite/accept?token=${inviteToken}&error=Please+sign+in+with+${encodeURIComponent(invitation.email)}`, request.url));
            }

            // Check if user already exists
            const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('email', googleUser.email.toLowerCase())
                .maybeSingle();

            let userId: string;

            if (existingUser) {
                userId = existingUser.id;
                // Update role if needed
                await supabase.from('users').update({
                    role: invitation.role,
                    status: 'ACTIVE',
                    avatar_url: googleUser.avatar || null,
                }).eq('id', userId);
            } else {
                // Create new user
                const { data: newUser, error: createError } = await supabase
                    .from('users')
                    .insert({
                        email: googleUser.email.toLowerCase(),
                        name: invitation.name,
                        role: invitation.role,
                        invited_by: invitation.invited_by,
                        avatar_url: googleUser.avatar || null,
                        status: 'ACTIVE',
                    })
                    .select('id')
                    .single();

                if (createError || !newUser) {
                    return fail('failed to create invited user', { requestUrl: request.url, dbError: createError?.message });
                }
                userId = newUser.id;
            }

            // Validate the invitation's role before issuing a session.
            if (!ALLOWED_ROLES.has(invitation.role)) {
                return fail('invitation has unknown role', { requestUrl: request.url, role: invitation.role });
            }

            // Create Gmail assignments
            if (invitation.assigned_gmail_account_ids && invitation.assigned_gmail_account_ids.length > 0) {
                const assignments = invitation.assigned_gmail_account_ids.map((accId: string) => ({
                    user_id: userId,
                    gmail_account_id: accId,
                    assigned_by: invitation.invited_by,
                }));

                await supabase
                    .from('user_gmail_assignments')
                    .upsert(assignments, { onConflict: 'user_id,gmail_account_id' });
            }

            // Mark invitation as accepted
            await supabase
                .from('invitations')
                .update({ status: 'ACCEPTED', accepted_at: new Date().toISOString() })
                .eq('id', invitation.id);

            // Create session
            await createSession({
                id: userId,
                email: googleUser.email,
                name: invitation.name,
                role: invitation.role,
            });

            return NextResponse.redirect(new URL('/', request.url));
        }

        // 4. Regular login - check if user exists
        let { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('email', googleUser.email.toLowerCase())
            .maybeSingle();

        if (!user) {
            // Check if there's a pending invitation for this email (auto-accept)
            const { data: pendingInvite } = await supabase
                .from('invitations')
                .select('*')
                .eq('email', googleUser.email.toLowerCase())
                .eq('status', 'PENDING')
                .maybeSingle();

            if (pendingInvite && new Date(pendingInvite.expires_at) > new Date()) {
                // Auto-accept the invitation
                const { data: newUser, error: createErr } = await supabase
                    .from('users')
                    .insert({
                        email: googleUser.email.toLowerCase(),
                        name: pendingInvite.name,
                        role: pendingInvite.role,
                        invited_by: pendingInvite.invited_by,
                        avatar_url: googleUser.avatar || null,
                    })
                    .select('id')
                    .single();

                if (createErr || !newUser) {
                    return fail('failed to create user from pending invite', { requestUrl: request.url, dbError: createErr?.message });
                }

                // Create Gmail assignments
                if (pendingInvite.assigned_gmail_account_ids?.length > 0) {
                    const assignments = pendingInvite.assigned_gmail_account_ids.map((accId: string) => ({
                        user_id: newUser.id,
                        gmail_account_id: accId,
                        assigned_by: pendingInvite.invited_by,
                    }));
                    await supabase.from('user_gmail_assignments').upsert(assignments, { onConflict: 'user_id,gmail_account_id' });
                }

                // Mark invitation as accepted
                await supabase.from('invitations').update({ status: 'ACCEPTED', accepted_at: new Date().toISOString() }).eq('id', pendingInvite.id);

                await createSession({
                    id: newUser.id,
                    email: googleUser.email,
                    name: pendingInvite.name,
                    role: pendingInvite.role,
                });

                return NextResponse.redirect(new URL('/', request.url));
            }

            // No invitation found — reject. First user must also be invited
            // (seed an admin user via DB or use the invite flow).
            return NextResponse.redirect(new URL('/login?error=no_invite', request.url));
        }

        if (user.status === 'REVOKED') {
            return NextResponse.redirect(new URL('/login?error=unauthorized', request.url));
        }

        // Update avatar if changed
        if (googleUser.avatar && googleUser.avatar !== user.avatar_url) {
            await supabase.from('users').update({ avatar_url: googleUser.avatar }).eq('id', user.id);
        }

        // SECURITY: same null-role fail-closed guard as the email-login route
        // (commit 844506d). The previous default `user.role || 'ADMIN'` would
        // silently promote any DB row with a NULL or unknown role string.
        if (!user.role || !ALLOWED_ROLES.has(user.role)) {
            return fail('user has no valid role assigned', { requestUrl: request.url, userId: user.id, role: user.role });
        }

        // Create session
        await createSession({
            id: user.id,
            email: user.email,
            name: user.name || googleUser.name,
            role: user.role,
        });

        return NextResponse.redirect(new URL('/', request.url));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return fail('uncaught exception in callback', { requestUrl: request.url, message });
    }
}
