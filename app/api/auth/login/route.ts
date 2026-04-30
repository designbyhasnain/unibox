import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '../../../../src/lib/supabase';
import { createSession } from '../../../../src/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
        }

        // Find user by email
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, name, role, password, crm_status')
            .eq('email', email.toLowerCase().trim())
            .maybeSingle();

        if (error || !user) {
            return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }

        if (user.crm_status === 'REVOKED') {
            return NextResponse.json({ error: 'Your account has been deactivated. Contact your admin.' }, { status: 401 });
        }

        if (!user.password) {
            return NextResponse.json({ error: 'No password set. Please use Google login or set up your password first.' }, { status: 401 });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }

        // SECURITY: Fail closed when the user row is missing a role. Previously
        // the code defaulted to 'ADMIN' on a null role, which silently
        // promoted any user with a NULL/blank role column to admin.
        const ALLOWED_ROLES = new Set(['ADMIN', 'ACCOUNT_MANAGER', 'SALES', 'VIDEO_EDITOR']);
        if (!user.role || !ALLOWED_ROLES.has(user.role)) {
            console.error('[Email Login] User has no valid role assigned:', user.id);
            return NextResponse.json({ error: 'Account is not configured. Contact your admin.' }, { status: 403 });
        }

        // Create session — same structure as Google login
        await createSession({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Email Login] Error:', err);
        return NextResponse.json({ error: 'Login failed' }, { status: 500 });
    }
}
