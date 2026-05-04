/**
 * Sender-identity metadata injection.
 *
 * Builds:
 *   - Schema.org Person/Organization JSON-LD block (HTML body)
 *   - RFC 8058 List-Unsubscribe headers (improves Gmail deliverability,
 *     measurable; not avatar-related)
 *   - BIMI-Selector header (per IETF BIMI draft) — pairs with a `default._bimi`
 *     DNS record on the sending domain. Set unconditionally; harmless when no
 *     BIMI record exists.
 *   - Gravatar fallback URL when the persona profile_image is not set
 *
 * Honest scope (verified May 2026):
 *   - **Gmail avatar**: blocked without VMC (~$1500/yr) or CMC (~$500–$1200/yr).
 *     No header trick works. Schema.org JSON-LD is parsed for action chips,
 *     NOT for sender avatar.
 *   - **Yahoo / AOL avatar**: free with self-asserted BIMI — DNS TXT at
 *     `default._bimi.<domain>` + DMARC `quarantine`/`reject` + hosted SVG
 *     Tiny PS. The BIMI-Selector header we set here is what tells the
 *     receiver which selector to look up.
 *   - **Apple Mail (iCloud recipients)**: free via Apple Business Connect
 *     "Branded Mail" — separate enrollment, no VMC required, ~7-day review.
 *     Apple Mail reading Gmail/IMAP does NOT render avatars.
 *   - **Outlook**: doesn't render BIMI anywhere as of April 2026.
 *   - **Gravatar**: native Gmail / Apple Mail / Outlook do not read it.
 *     Useful only for third-party clients (Superhuman, Spark, Mimestream).
 *
 * So: the only thing senders can do header-side to maximize avatar
 * coverage is set BIMI-Selector consistently and rely on the *DNS-side*
 * BIMI record to do the work. The rest is DNS/infra (DMARC enforcement,
 * BIMI TXT, Apple Business Connect enrollment) — not code.
 */

interface IdentityContext {
    senderName: string;
    senderEmail: string;
    profileImageUrl?: string | null;
    /** Brand name (e.g. "Wedits"). Optional. */
    organization?: string;
    /** Public website URL for the brand. Optional. */
    organizationUrl?: string;
}

interface UnsubscribeContext {
    /** The mailto: address to receive unsubscribe. Required by RFC 8058. */
    mailto: string;
    /** A POST endpoint for one-click unsubscribe (e.g. /api/unsubscribe?t=...). Optional but recommended. */
    httpUrl?: string;
}

/**
 * Build a JSON-LD <script> block. Returns the HTML to append at the very
 * end of the email body (after the signature, before </body> if present).
 */
export function buildSenderJsonLd(ctx: IdentityContext): string {
    const person: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: ctx.senderName,
        email: ctx.senderEmail,
    };
    if (ctx.profileImageUrl) {
        person.image = ctx.profileImageUrl;
    }
    if (ctx.organization) {
        person.worksFor = {
            '@type': 'Organization',
            name: ctx.organization,
            ...(ctx.organizationUrl ? { url: ctx.organizationUrl } : {}),
        };
    }

    // The script tag is hidden by every email client (script content is never
    // rendered in MIME bodies), so this adds zero visible noise.
    const json = JSON.stringify(person);
    return `\n<script type="application/ld+json">${json}</script>\n`;
}

/**
 * Build the headers object with List-Unsubscribe + List-Unsubscribe-Post.
 * Returns an empty object when unsubscribe context is missing — campaigns
 * always have the URL, one-off sends do not.
 *
 * Format reference:
 *   List-Unsubscribe:      <mailto:unsub@example.com>, <https://example.com/u>
 *   List-Unsubscribe-Post: List-Unsubscribe=One-Click
 */
export function buildUnsubscribeHeaders(ctx: UnsubscribeContext | undefined): Record<string, string> {
    if (!ctx) return {};
    const parts: string[] = [];
    parts.push(`<mailto:${ctx.mailto}>`);
    if (ctx.httpUrl) parts.push(`<${ctx.httpUrl}>`);
    return {
        'List-Unsubscribe': parts.join(', '),
        // Per RFC 8058, only set this when we DO support one-click POST.
        ...(ctx.httpUrl ? { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {}),
    };
}

/**
 * Helper for the SMTP path — augment an HTML body with the JSON-LD block
 * appended at the bottom.
 */
export function injectIdentitySchema(html: string, ctx: IdentityContext): string {
    const block = buildSenderJsonLd(ctx);
    // If the body has a closing </body>, insert before it. Otherwise append.
    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `${block}</body>`);
    }
    return html + block;
}

import * as crypto from 'node:crypto';

/**
 * Build a Gravatar URL from an email. SHA-256 hash with `d=mp` (mystery
 * person) fallback so the URL is always valid even when no Gravatar is
 * registered. Used as a profile-image fallback when an account has no
 * uploaded persona photo.
 *
 * Honest: native Gmail/Apple/Outlook don't render Gravatar in the avatar
 * circle. This URL is consumed by:
 *   1. Schema.org JSON-LD `image` field (Apple/Outlook web parse it for
 *      some action types but NOT avatar — ignored for that purpose).
 *   2. Third-party clients (Superhuman, Spark, Mimestream, Thunderbird)
 *      that DO render Gravatar.
 *   3. Our own in-app sender row.
 *
 * Setting it costs nothing and gives free avatar coverage in those
 * third-party clients without forcing the sender to upload a photo.
 */
export function gravatarUrl(email: string, size = 200): string {
    const hash = crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
    return `https://gravatar.com/avatar/${hash}?s=${size}&d=mp`;
}

/**
 * Decide which image URL to use for identity metadata. Persona photo
 * (uploaded to Supabase Storage) wins; Gravatar URL is the fallback.
 */
export function resolveSenderImage(
    profileImageUrl: string | null | undefined,
    email: string,
): string {
    if (profileImageUrl) return profileImageUrl;
    return gravatarUrl(email);
}

/**
 * Build the BIMI-Selector header value. Harmless when the domain has no
 * BIMI DNS record — receivers that don't see one just skip lookup.
 *
 * Reference: IETF BIMI draft (draft-brand-indicators-for-message-identification).
 * Receivers (Yahoo/AOL today, more later) use this to pick which
 * `<selector>._bimi.<domain>` TXT to fetch.
 */
export function buildBimiSelectorHeader(selector = 'default'): Record<string, string> {
    return {
        'BIMI-Selector': `v=BIMI1; s=${selector};`,
    };
}
