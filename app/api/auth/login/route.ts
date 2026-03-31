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
            .select('id, email, name, role, password, status')
            .eq('email', email.toLowerCase().trim())
            .maybeSingle();

        if (error || !user) {
            return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }

        if (user.status === 'REVOKED') {
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

        // Create session — same structure as Google login
        await createSession({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role || 'ADMIN',
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Email Login] Error:', err);
        return NextResponse.json({ error: 'Login failed' }, { status: 500 });
    }
}
