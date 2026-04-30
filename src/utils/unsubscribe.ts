import * as crypto from 'crypto';

/**
 * Unsubscribe token format
 * ─────────────────────────────────────────────────────────────────────────
 * Phase 5: token is now `base64url(email).base64url(hmac-sha256(email, secret))`
 * — anyone who already has access to the email address can still craft the
 * email half, but the signature half requires the server-side secret. This
 * stops the previous "anyone can unsubscribe anyone" attack where the token
 * was just `base64url(email)`.
 *
 * Backward compatibility: legacy tokens (single-part base64url) are still
 * accepted by `parseUnsubscribeToken` for one transition window. We'll drop
 * legacy support once outstanding emails older than ~90 days are unlikely
 * to be unsubscribed from.
 *
 * The signing secret is `UNSUBSCRIBE_SECRET` (preferred) or falls back to
 * `NEXTAUTH_SECRET` so we don't need to ship a separate env var on day-one.
 *
 * Audit ref: docs/UNIBOX-ULTIMATE-AUDIT.md SEC-3.
 */

function unsubscribeSecret(): string {
    const s = process.env.UNSUBSCRIBE_SECRET || process.env.NEXTAUTH_SECRET;
    if (!s || s.length < 16) {
        throw new Error('UNSUBSCRIBE_SECRET (or NEXTAUTH_SECRET) must be ≥16 chars');
    }
    return s;
}

function sign(email: string): string {
    return crypto.createHmac('sha256', unsubscribeSecret()).update(email).digest('base64url');
}

export function generateUnsubscribeLink(email: string, campaignId: string): string {
    const normalised = email.trim().toLowerCase();
    const emailPart = Buffer.from(normalised).toString('base64url');
    const sigPart = sign(normalised);
    return `${process.env.NEXT_PUBLIC_APP_URL}/api/unsubscribe?t=${emailPart}.${sigPart}&c=${campaignId}`;
}

export function injectUnsubscribeLink(body: string, email: string, campaignId: string): string {
    const link = generateUnsubscribeLink(email, campaignId);
    return body + `<p style="font-size:11px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
    If you no longer wish to receive these emails, <a href="${link}" style="color:#999">unsubscribe here</a>.
  </p>`;
}

/**
 * Verifies and parses an unsubscribe token. Returns the lowercase email if the
 * signature checks out (or the legacy token shape is recognised), null otherwise.
 *
 * - Phase-5 tokens: `<base64url(email)>.<base64url(hmac)>` — verified via
 *   constant-time HMAC compare.
 * - Legacy tokens: single-part `base64url(email)` — accepted with a console
 *   warning so we know when we can drop the legacy path.
 */
export function parseUnsubscribeToken(raw: string): { email: string; legacy: boolean } | null {
    if (!raw) return null;

    if (raw.includes('.')) {
        const [emailPart, sigPart] = raw.split('.', 2);
        if (!emailPart || !sigPart) return null;
        let email: string;
        try {
            email = Buffer.from(emailPart, 'base64url').toString('utf-8').trim().toLowerCase();
        } catch {
            return null;
        }
        if (!email.includes('@')) return null;
        const expected = sign(email);
        // Constant-time compare. Lengths can match (HMAC is fixed) but defensive.
        const a = Buffer.from(expected);
        const b = Buffer.from(sigPart);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
        return { email, legacy: false };
    }

    // Legacy: single-part base64url(email). Accept for transition.
    let email: string;
    try {
        email = Buffer.from(raw, 'base64url').toString('utf-8').trim().toLowerCase();
    } catch {
        return null;
    }
    if (!email.includes('@')) return null;
    console.warn('[unsubscribe] legacy unsigned token accepted for', email);
    return { email, legacy: true };
}
