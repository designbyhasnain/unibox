import 'server-only';
import { cookies } from 'next/headers';
import * as crypto from 'crypto';

const SESSION_COOKIE_NAME = 'unibox_session';

// Authenticated encryption (AES-256-GCM) — provides confidentiality AND integrity.
// Token format: ivHex:authTagHex:cipherHex (matches src/utils/encryption.ts).
// IV is 12 bytes (GCM standard); auth tag is 16 bytes.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getAuthSecret(): string {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret || secret.length < 32) {
        // Fail closed in every environment. The previous "dev-only fallback"
        // string meant any preview/staging deploy that forgot to set the env
        // var would have a publicly-known secret.
        throw new Error('NEXTAUTH_SECRET is required and must be at least 32 characters.');
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

function encryptPayload(payload: UserSession): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getSecretBuffer(), iv);
    let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptPayload(token: string): UserSession {
    // Reject the legacy 2-part CBC format outright so tampered cookies from
    // before the GCM migration are forced through /login (re-encrypt fresh).
    const parts = token.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid token format');
    }
    const [ivHex, authTagHex, encrypted] = parts;
    if (!ivHex || !authTagHex || !encrypted) {
        throw new Error('Invalid token parts');
    }
    if (!/^[0-9a-f]+$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(authTagHex) || !/^[0-9a-f]+$/i.test(encrypted)) {
        throw new Error('Token components must be hex');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    if (iv.length !== IV_LENGTH) {
        throw new Error('Invalid IV length');
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error('Invalid auth tag length');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, getSecretBuffer(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8'); // throws on auth-tag mismatch (tamper)
    return JSON.parse(decrypted);
}

function getSecretBuffer(): Buffer {
    // Derive a 32-byte AES-256 key from the configured secret.
    return crypto.createHash('sha256').update(getAuthSecret()).digest();
}
