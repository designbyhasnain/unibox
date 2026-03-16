/**
 * Unified email normalization.
 *
 * Handles both plain addresses (`john@example.com`) and RFC 2822 formatted
 * strings (`"John Doe <john@example.com>"`).  All action / service layers
 * should use this instead of inline `.toLowerCase().trim()` calls.
 */

/**
 * Extract and normalize an email address from a raw string.
 *
 * @example
 *   normalizeEmail('"John" <JOHN@Example.COM>') // => 'john@example.com'
 *   normalizeEmail('  JOHN@Example.COM  ')       // => 'john@example.com'
 */
export function normalizeEmail(raw: string): string {
    const match = raw.match(/<([^>]+)>/);
    const email = match?.[1] ?? raw;
    return email.toLowerCase().trim();
}
