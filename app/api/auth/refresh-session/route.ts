import { NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';
import { createSession, getSession } from '../../../../src/lib/auth';

/**
 * Re-mint the caller's session cookie using fresh DB state (role / name / email).
 *
 * Useful when an admin changes a user's role: that user's existing cookie still
 * carries the old role until they log out and back in. Hitting this endpoint
 * (with their own valid session) refreshes the cookie in place.
 *
 * Same-user only — the userId comes from the existing session, not the request,
 * so no privilege escalation is possible.
 */
export async function POST() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: user } = await supabase
        .from('users')
        .select('id, email, name, role')
        .eq('id', session.userId)
        .maybeSingle();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await createSession({ id: user.id, email: user.email, name: user.name, role: user.role });
    return NextResponse.json({ success: true, role: user.role });
}
