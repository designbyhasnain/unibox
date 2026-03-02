import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a string using AES-256-GCM
 */
export function encrypt(text: string): string {
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
 * Decrypt a string using AES-256-GCM
 */
export function decrypt(encryptedData: string): string {
    const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
    if (key.length !== 32) {
        throw new Error('Invalid ENCRYPTION_KEY. Must be 32 bytes hex string (64 characters).');
    }

    const [ivHex, authTagHex, encryptedText] = encryptedData.split(':');
    if (!ivHex || !authTagHex || !encryptedText) {
        throw new Error('Invalid encrypted data format.');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
