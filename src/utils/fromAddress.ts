/**
 * Format a From-header value like `Name <email@x.com>` with RFC 2047 encoding
 * when the display name contains non-ASCII or special chars. Returns the bare
 * address when displayName is missing/empty so we preserve the Gmail-native
 * behaviour for accounts without a custom persona.
 *
 * Used by the manual Gmail MIME build path (gmailSenderService.ts). Nodemailer
 * handles this natively via `from: { name, address }`, so the manual-SMTP path
 * (manualEmailService.ts) passes an object instead of calling this.
 */
export function formatFromHeader(displayName: string | null | undefined, email: string): string {
    const name = (displayName ?? '').trim();
    if (!name) return email;

    // RFC 5322: if name has special chars we must quote or encode.
    const needsEncoding = /[^\x20-\x7e]/.test(name);          // non-ASCII → base64 encode
    const needsQuoting  = /["\\,;:<>@()[\]]/.test(name);       // structural chars → quote

    if (needsEncoding) {
        const b64 = Buffer.from(name, 'utf8').toString('base64');
        return `=?utf-8?B?${b64}?= <${email}>`;
    }
    if (needsQuoting) {
        // Escape internal quotes and backslashes.
        const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `"${escaped}" <${email}>`;
    }
    return `${name} <${email}>`;
}
