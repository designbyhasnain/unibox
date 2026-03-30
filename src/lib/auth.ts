import 'server-only';
import { cookies } from 'next/headers';
import * as crypto from 'crypto';

const SESSION_COOKIE_NAME = 'unibox_session';

function getAuthSecret(): string {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('NEXTAUTH_SECRET environment variable is required in production');
        }
        // Only allow fallback in development with a warning
        console.warn('[auth] WARNING: NEXTAUTH_SECRET not set, using insecure fallback. Set NEXTAUTH_SECRET in .env');
        return 'dev-only-insecure-fallback-secret';
    }
    return secret;
}

export interface UserSession {
    userId: string;
    email: string;
    name: string;
    role: string;
    exp: number;
}

/**
 * Creates a signed session token.
 */
export async function createSession(user: { id: string, email: string, name: string, role: string }) {
    const payload: UserSession = {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    };

    const token = encryptPayload(payload);
    
    (await cookies()).set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60
    });

    return payload;
}

export async function getSession(): Promise<UserSession | null> {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    try {
        const payload = decryptPayload(token);
        if (payload.exp < Date.now()) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}

/**
 * Clears the session cookie.
 */
export async function clearSession() {
    (await cookies()).delete(SESSION_COOKIE_NAME);
}

// --- Internal Security Helpers ---

function encryptPayload(payload: any): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', getSecretBuffer(), iv);
    let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

function decryptPayload(token: string): any {
    if (!token.includes(':')) {
        throw new Error('Invalid token format (missing IV)');
    }
    const parts = token.split(':');
    const ivHex = parts[0];
    const encrypted = parts[1];
    
    if (!ivHex || !encrypted) {
        throw new Error('Invalid token parts');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getSecretBuffer(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
}

function getSecretBuffer(): Buffer {
    // Ensure the secret is 32 bytes for aes-256
    return crypto.createHash('sha256').update(getAuthSecret()).digest();
}
