import { createClient } from '@supabase/supabase-js';
import AcceptInviteClient from './AcceptInviteClient';

// Server component — queries DB directly, no server action needed
export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
    const { token, error: urlError } = await searchParams;

    console.log('[invite/accept] Token from URL:', token);
    console.log('[invite/accept] Token length:', token?.length);

    if (!token || token.length !== 64) {
        return <AcceptInviteClient error={urlError || 'No valid invitation token provided'} />;
    }

    // Direct DB query — bypass server action entirely
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data: invitation, error: dbError } = await supabase
        .from('invitations')
        .select('id, email, name, role, status, expires_at, invited_by')
        .eq('token', token)
        .maybeSingle();

    console.log('[invite/accept] DB result:', JSON.stringify(invitation));
    console.log('[invite/accept] DB error:', JSON.stringify(dbError));

    if (dbError || !invitation) {
        return <AcceptInviteClient error="Invitation not found" />;
    }

    if (invitation.status !== 'PENDING') {
        return <AcceptInviteClient error={`Invitation has already been ${invitation.status.toLowerCase()}`} />;
    }

    if (new Date(invitation.expires_at) < new Date()) {
        await supabase.from('invitations').update({ status: 'EXPIRED' }).eq('id', invitation.id);
        return <AcceptInviteClient error="Invitation has expired" />;
    }

    // Get inviter name
    const { data: inviter } = await supabase
        .from('users')
        .select('name')
        .eq('id', invitation.invited_by)
        .maybeSingle();

    console.log('[invite/accept] SUCCESS — valid invitation for', invitation.email);

    const invitationData = {
        ...invitation,
        inviterName: inviter?.name || 'An admin',
    };

    return <AcceptInviteClient invitation={invitationData} token={token} />;
}
