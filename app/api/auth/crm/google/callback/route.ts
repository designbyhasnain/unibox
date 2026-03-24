import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateOAuthState } from '../../../../../../src/services/googleAuthService';
import { verifyCrmAuth } from '../../../../../../src/services/crmAuthService';
import { createSession } from '../../../../../../src/lib/auth';
import { supabase } from '../../../../../../src/lib/supabase';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    // Extract invite token from state parameter (format: crm_xxx.invite.TOKEN)
    let inviteToken: string | undefined;
    let baseState = state;
    if (state && state.includes('.invite.')) {
        const parts = state.split('.invite.');
        baseState = parts[0];
        inviteToken = parts[1];
    }

    const cookieStore = await cookies();
    const expectedState = cookieStore.get('crm_oauth_state')?.value;

    // 1. Validate state (compare base state without invite token)
    if (!validateOAuthState(baseState, expectedState || null)) {
        return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
    }

    // Cleanup cookies
    cookieStore.delete('crm_oauth_state');

    if (!code) {
        return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
    }

    try {
        // 2. Verify Google Token
        const googleUser = await verifyCrmAuth(code);
        if (!googleUser || !googleUser.email) {
            return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
        }

        // 3. Handle invite acceptance
        if (inviteToken) {
            // Validate invitation
            const { data: invitation } = await supabase
                .from('invitations')
                .select('*')
                .eq('token', inviteToken)
                .eq('status', 'PENDING')
                .maybeSingle();

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
                    console.error('[CRM Auth] Failed to create user:', createError);
                    return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
                }
                userId = newUser.id;
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
            // Check if ANY users exist — if not, auto-create first user as ADMIN
            const { count } = await supabase.from('users').select('id', { count: 'exact', head: true });
            if (count === 0 || count === null) {
                // First user ever — auto-create as ADMIN
                const { data: newUser, error: createErr } = await supabase
                    .from('users')
                    .insert({
                        email: googleUser.email.toLowerCase(),
                        name: googleUser.name,
                        role: 'ACCOUNT_MANAGER',
                        avatar_url: googleUser.avatar || null,
                        status: 'ACTIVE',
                    })
                    .select('*')
                    .single();

                if (createErr || !newUser) {
                    console.error('[CRM Auth] Failed to auto-create first user:', createErr);
                    return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
                }
                user = newUser;
            } else {
                console.error('[CRM Auth] No invite token, user not found:', googleUser.email, 'inviteToken was:', inviteToken ? 'present' : 'missing');
                return NextResponse.redirect(new URL(`/login?error=no_invite&debug=token_${inviteToken ? 'found' : 'missing'}_email_${encodeURIComponent(googleUser.email)}`, request.url));
            }
        }

        if (user.status === 'REVOKED') {
            return NextResponse.redirect(new URL('/login?error=unauthorized', request.url));
        }

        // Update avatar if changed
        if (googleUser.avatar && googleUser.avatar !== user.avatar_url) {
            await supabase.from('users').update({ avatar_url: googleUser.avatar }).eq('id', user.id);
        }

        // Create session
        await createSession({
            id: user.id,
            email: user.email,
            name: user.name || googleUser.name,
            role: user.role || 'ADMIN',
        });

        return NextResponse.redirect(new URL('/', request.url));
    } catch (error) {
        console.error('[CRM Auth Callback] Error:', error);
        return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
    }
}
