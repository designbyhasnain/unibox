/**
 * Unified bot and proxy detection utilities for tracking routes.
 * Consolidates patterns previously duplicated across:
 *   - app/api/track/route.ts
 *   - app/api/track/click/route.ts
 *   - app/utils/parseUserAgent.ts
 */

/** Returns true if the user-agent belongs to the Google Image Proxy (Gmail pre-fetcher). */
export function isGoogleProxy(userAgent: string): boolean {
    return /GoogleImageProxy|via ggpht\.com/i.test(userAgent);
}

/** Returns true if the user-agent looks like a bot, crawler, or known proxy. */
export function isBot(userAgent: string): boolean {
    return /bot|crawl|spider|GoogleImageProxy|ggpht/i.test(userAgent);
}
