import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a unique tracking ID for an email.
 */
export function generateTrackingId(): string {
    return uuidv4().replace(/-/g, '');
}

/**
 * Returns the base URL for tracking APIs.
 * In production, this will be the Vercel domain.
 * In development, this is localhost.
 */
function getBaseUrl(): string {
    let url = '';
    if (process.env.NEXT_PUBLIC_APP_URL) {
        url = process.env.NEXT_PUBLIC_APP_URL;
    } else if (process.env.VERCEL_URL) {
        url = `https://${process.env.VERCEL_URL}`;
    } else {
        url = 'http://localhost:3000';
    }
    
    // Remove trailing slash if present
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Generates the tracking pixel <img> tag to inject at the end of email body.
 */
export function getTrackingPixelHtml(trackingId: string): string {
    const baseUrl = getBaseUrl();
    return `<img src="${baseUrl}/api/track?t=${trackingId}" width="1" height="1" style="display:none;width:1px;height:1px;opacity:0;" alt="" />`;
}

/**
 * Wraps all links in the email body with tracking redirect URLs.
 * Only wraps http/https links, skips mailto: and anchor links.
 */
export function wrapLinksForTracking(htmlBody: string, trackingId: string): string {
    const baseUrl = getBaseUrl();

    // Match href="..." in anchor tags
    return htmlBody.replace(
        /href="(https?:\/\/[^"]+)"/gi,
        (match, url) => {
            // Don't track our own tracking URLs to avoid recursion
            if (url.includes('/api/track')) return match;

            const trackedUrl = `${baseUrl}/api/track/click?t=${trackingId}&url=${encodeURIComponent(url)}`;
            return `href="${trackedUrl}"`;
        }
    );
}

/**
 * Injects tracking pixel and wraps links in the email body.
 * Returns { body, trackingId }
 */
export function prepareTrackedEmail(body: string, isTrackingEnabled: boolean = true): {
    body: string;
    trackingId: string;
} {
    const trackingId = generateTrackingId();

    if (!isTrackingEnabled) {
        return { body, trackingId };
    }

    let trackedBody = body;

    // 1. Wrap links for click tracking
    trackedBody = wrapLinksForTracking(trackedBody, trackingId);

    // 2. Append tracking pixel
    trackedBody += getTrackingPixelHtml(trackingId);

    return { body: trackedBody, trackingId };
}
