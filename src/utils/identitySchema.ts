/**
 * Phase 15 — sender-identity metadata injection.
 *
 * Builds a Schema.org Person / Organization JSON-LD block + the matching
 * RFC 8058 List-Unsubscribe headers. Used by both Gmail (OAuth) and SMTP
 * (manual) senders.
 *
 * What this DOES:
 *   - Adds <script type="application/ld+json"> Person markup at the bottom
 *     of the HTML body. Apple Mail, Outlook, and some webmail clients
 *     read this and may use it for display.
 *   - Adds Organization markup with the "wedits" brand for B2B trust signals.
 *   - Builds correctly-formatted List-Unsubscribe + List-Unsubscribe-Post
 *     headers per RFC 8058. Gmail bumps sender reputation when these are
 *     present and one-click compliant — improves inbox placement, which
 *     matters more than avatar.
 *
 * What this DOES NOT do (be honest):
 *   - Make Gmail show the avatar circle. Gmail's Email Markup program
 *     requires sender whitelisting via Google's partner enrollment. Until
 *     a domain is enrolled, JSON-LD is silently ignored by Gmail (but
 *     parsed by Apple Mail / Outlook on the web).
 *   - Replace the BIMI requirement for forced Gmail avatars. BIMI still
 *     needs a $1500/yr VMC certificate.
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
