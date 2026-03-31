import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '../../../../src/lib/supabase';
import { createSession } from '../../../../src/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const { email, password, inviteToken } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
        }

        if (password.length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
        }

        // Verify invitation is valid
        if (!inviteToken) {
            return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
        }

        const { data: invitation } = await supabase
            .from('invitations')
            .select('*')
            .eq('token', inviteToken)
            .eq('status', 'PENDING')
            .maybeSingle();

        if (!invitation) {
            return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 400 });
        }

        if (new Date(invitation.expires_at) < new Date()) {
            await supabase.from('invitations').update({ status: 'EXPIRED' }).eq('id', invitation.id);
            return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 });
        }

        // Verify email matches invitation
        if (email.toLowerCase().trim() !== invitation.email.toLowerCase()) {
            return NextResponse.json({ error: 'Email does not match invitation' }, { status: 400 });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Check if user already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', email.toLowerCase().trim())
            .maybeSingle();

        let userId: string;

        if (existingUser) {
            userId = existingUser.id;
            await supabase.from('users').update({
                password: hashedPassword,
                role: invitation.role,
                status: 'ACTIVE',
            }).eq('id', userId);
        } else {
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert({
                    email: email.toLowerCase().trim(),
                    name: invitation.name,
                    password: hashedPassword,
                    role: invitation.role,
                    invited_by: invitation.invited_by,
                    status: 'ACTIVE',
                })
                .select('id')
                .single();

            if (createError || !newUser) {
                console.error('[SetPassword] Failed to create user:', createError);
                return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
            }
            userId = newUser.id;
        }

        // Create Gmail assignments
        if (invitation.assigned_gmail_account_ids?.length > 0) {
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
            email: email.toLowerCase().trim(),
            name: invitation.name,
            role: invitation.role,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[SetPassword] Error:', err);
        return NextResponse.json({ error: 'Failed to set password' }, { status: 500 });
    }
}
