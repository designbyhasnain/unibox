import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '../../../../src/lib/supabase';
import { createSession } from '../../../../src/lib/auth';

// Simple in-memory rate limiter per IP. The IP whitelist in proxy.ts already
// caps the audience to a small set of trusted Pakistani ISPs, so we don't
// need Redis-backed limits — this only exists to slow down a brute-force
// attempt from a compromised whitelisted IP. Lambda cold starts reset state,
// which is fine because the throttle is "best effort" not "compliance".
const LOGIN_ATTEMPTS = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;          // per IP per window

function getIp(request: NextRequest): string {
    const xff = request.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0]?.trim() || 'unknown';
    return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function rateLimit(ip: string): { ok: boolean; retryInMs?: number } {
    const now = Date.now();
    const entry = LOGIN_ATTEMPTS.get(ip);
    if (!entry || now - entry.firstAt > WINDOW_MS) {
        LOGIN_ATTEMPTS.set(ip, { count: 1, firstAt: now });
        return { ok: true };
    }
    if (entry.count >= MAX_ATTEMPTS) {
        return { ok: false, retryInMs: WINDOW_MS - (now - entry.firstAt) };
    }
    entry.count += 1;
    return { ok: true };
}

function clearLimit(ip: string) {
    LOGIN_ATTEMPTS.delete(ip);
}

export async function POST(request: NextRequest) {
    try {
        const ip = getIp(request);
        const limit = rateLimit(ip);
        if (!limit.ok) {
            const retrySec = Math.ceil((limit.retryInMs || WINDOW_MS) / 1000);
            return NextResponse.json(
                { error: `Too many login attempts. Try again in ${Math.ceil(retrySec / 60)} minutes.` },
                { status: 429, headers: { 'Retry-After': String(retrySec) } }
            );
        }

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

        // Reset the rate-limit counter on a successful login so a legitimate
        // user who fat-fingered their password 5 times doesn't stay throttled.
        clearLimit(ip);

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Email Login] Error:', err);
        return NextResponse.json({ error: 'Login failed' }, { status: 500 });
    }
}
