import 'server-only';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a string using AES-256-GCM.
 * Handles edge cases: rejects null/undefined, allows empty strings.
 */
export function encrypt(text: string): string {
    if (text === null || text === undefined) {
        throw new Error('Cannot encrypt null or undefined value.');
    }
    if (typeof text !== 'string') {
        throw new Error('encrypt() expects a string argument.');
    }

    const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
    if (key.length !== 32) {
        throw new Error('Invalid ENCRYPTION_KEY. Must be 32 bytes hex string (64 characters).');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a string using AES-256-GCM.
 * Handles edge cases: rejects null/undefined/empty/malformed data with clear errors.
 */
export function decrypt(encryptedData: string): string {
    if (!encryptedData || typeof encryptedData !== 'string') {
        throw new Error('Cannot decrypt: input must be a non-empty string.');
    }

    const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
    if (key.length !== 32) {
        throw new Error('Invalid ENCRYPTION_KEY. Must be 32 bytes hex string (64 characters).');
    }

    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format. Expected format: iv:authTag:ciphertext');
    }

    const [ivHex, authTagHex, encryptedText] = parts;
    if (!ivHex || !authTagHex || !encryptedText) {
        throw new Error('Invalid encrypted data format: missing components.');
    }

    // Validate hex encoding
    if (!/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(authTagHex) || !/^[0-9a-fA-F]+$/.test(encryptedText)) {
        throw new Error('Invalid encrypted data format: components must be hex-encoded.');
    }

    const iv = Buffer.from(ivHex, 'hex');
    if (iv.length !== IV_LENGTH) {
        throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}.`);
    }

    const authTag = Buffer.from(authTagHex, 'hex');
    if (authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}.`);
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
