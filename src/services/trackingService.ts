import { v4 as uuidv4 } from 'uuid';

/**
 * Email tracking: open pixel + click tracking via link rewriting.
 */

export function generateTrackingId(): string {
    return uuidv4().replace(/-/g, '');
}

function getBaseUrl(): string {
    let url = '';
    if (process.env.NEXT_PUBLIC_APP_URL) {
        url = process.env.NEXT_PUBLIC_APP_URL;
    } else if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
        url = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    } else if (process.env.VERCEL_URL) {
        url = `https://${process.env.VERCEL_URL}`;
    } else {
        url = 'http://localhost:3000';
    }
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

function getTrackingPixelHtml(trackingId: string): string {
    const baseUrl = getBaseUrl();
    return `<div style="margin-top:0;border-top:1px solid #f0f0f0;padding-top:0;"><img src="${baseUrl}/api/track?t=${trackingId}" width="600" height="1" style="display:block;width:600px;height:1px;" alt="" /></div>`;
}

/**
 * Rewrites links in HTML to go through click tracking.
 * Skips mailto:, unsubscribe, and anchor (#) links.
 */
function rewriteLinks(html: string, trackingId: string): string {
    const baseUrl = getBaseUrl();
    return html.replace(/<a\s([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi, (match, before, url, after) => {
        // Skip non-trackable links
        if (url.startsWith('mailto:') || url.startsWith('#') || url.startsWith('tel:') ||
            url.includes('unsubscribe') || url.includes('/api/track') ||
            url.startsWith('javascript:')) {
            return match;
        }
        const trackedUrl = `${baseUrl}/api/track/click?t=${trackingId}&url=${encodeURIComponent(url)}`;
        return `<a ${before}href="${trackedUrl}"${after}>`;
    });
}

/**
 * Injects a tracking pixel and rewrites links for click tracking.
 * Returns { body, trackingId }
 */
export function prepareTrackedEmail(body: string, isTrackingEnabled: boolean = true): {
    body: string;
    trackingId: string;
} {
    if (!isTrackingEnabled) {
        return { body, trackingId: '' };
    }

    const trackingId = generateTrackingId();
    const pixelHtml = getTrackingPixelHtml(trackingId);

    // Rewrite links for click tracking
    let trackedBody = rewriteLinks(body, trackingId);

    // Inject open tracking pixel at the top of the body so it loads immediately
    if (trackedBody.includes('<body>')) {
        trackedBody = trackedBody.replace('<body>', '<body>' + pixelHtml);
    } else if (trackedBody.includes('<body ')) {
        trackedBody = trackedBody.replace(/<body[^>]*>/, '$&' + pixelHtml);
    } else {
        trackedBody = pixelHtml + trackedBody;
    }

    return { body: trackedBody, trackingId };
}
