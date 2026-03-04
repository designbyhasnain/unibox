/**
 * Service to handle email tracking injection and event processing.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

export interface TrackingOptions {
    openTracking?: boolean;
    clickTracking?: boolean;
}

/**
 * Injects a tracking pixel and wraps links in the email body.
 */
export function injectTracking(htmlBody: string, providedId?: string, options: TrackingOptions = { openTracking: true, clickTracking: true }) {
    let trackedBody = htmlBody;
    const trackingId = providedId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));

    // 1. Inject Open Tracking Pixel
    if (options.openTracking) {
        const pixelUrl = `${APP_URL}/api/track/open?tid=${trackingId}`;
        const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none !important;" alt="" />`;

        // Append before </body> if exists, otherwise at the end
        if (trackedBody.includes('</body>')) {
            trackedBody = trackedBody.replace('</body>', `${pixelTag}</body>`);
        } else {
            trackedBody += pixelTag;
        }
    }

    // 2. Wrap Links for Click Tracking
    if (options.clickTracking) {
        const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi;
        trackedBody = trackedBody.replace(linkRegex, (match, url, attributes) => {
            // Skip tracking for mailto, tel, or hash links
            if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
                return match;
            }

            // Encode the original URL to pass it through our tracker
            const encodedUrl = Buffer.from(url).toString('base64');
            const trackingUrl = `${APP_URL}/api/track/click?tid=${trackingId}&url=${encodedUrl}`;

            return `<a href="${trackingUrl}"${attributes}>`;
        });
    }

    return { trackedBody, trackingId };
}

/**
 * Extracts the tracking ID from an email body if present.
 */
export function extractTrackingId(htmlBody: string): string | null {
    if (!htmlBody) return null;
    const match = htmlBody.match(/\/api\/track\/open\?tid=([^"&\s]+)/);
    return (match && match[1]) ? match[1] : null;
}
