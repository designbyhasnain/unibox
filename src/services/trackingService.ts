import { v4 as uuidv4 } from 'uuid';

/**
 * Simple WhatsApp-style tick tracking.
 * Only injects a 1x1 pixel — no link rewriting, no click tracking.
 */

export function generateTrackingId(): string {
    return uuidv4().replace(/-/g, '');
}

function getBaseUrl(): string {
    let url = '';
    if (process.env.NEXT_PUBLIC_APP_URL) {
        url = process.env.NEXT_PUBLIC_APP_URL;
    } else if (process.env.VERCEL_URL) {
        url = `https://${process.env.VERCEL_URL}`;
    } else {
        url = 'http://localhost:3000';
    }
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

function getTrackingPixelHtml(trackingId: string): string {
    const baseUrl = getBaseUrl();
    return `<img src="${baseUrl}/api/track?t=${trackingId}" width="1" height="1" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;" alt="" />`;
}

/**
 * Injects a tracking pixel into the email body.
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

    let trackedBody = body;
    if (trackedBody.includes('</body>')) {
        trackedBody = trackedBody.replace('</body>', pixelHtml + '</body>');
    } else if (trackedBody.includes('</html>')) {
        trackedBody = trackedBody.replace('</html>', pixelHtml + '</html>');
    } else {
        trackedBody += pixelHtml;
    }

    return { body: trackedBody, trackingId };
}
