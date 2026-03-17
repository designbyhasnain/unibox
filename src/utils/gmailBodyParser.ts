import 'server-only';

/**
 * Recursively walks a Gmail message payload to find text/plain or text/html body.
 * Falls back to snippet if no body found.
 * Appends attachment metadata as an HTML comment for backward compatibility.
 */
export function getMessageBody(payload: any): string {
    if (!payload) return '';

    let htmlBody = '';
    let textBody = '';
    const attachments: any[] = [];

    function walk(part: any) {
        if (part.parts) {
            part.parts.forEach(walk);
        }

        if (part.body?.attachmentId) {
            attachments.push({
                id: part.body.attachmentId,
                filename: part.filename,
                mimeType: part.mimeType,
                size: part.body.size
            });
        }

        if (part.mimeType === 'text/html' && part.body?.data) {
            htmlBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/plain' && part.body?.data) {
            textBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
    }

    walk(payload);

    let result = htmlBody || textBody || '';

    // If no body found in parts, check root body
    if (!result && payload.body?.data) {
        result = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    // Append metadata for UI (backward compatibility — kept until migration is complete)
    if (attachments.length > 0) {
        result += `\n<!-- ATTACHMENTS: ${JSON.stringify(attachments)} -->`;
    }

    return result;
}

/**
 * Extract attachment metadata from a Gmail API message payload.
 * Returns a structured array for use by the body fetch API route.
 */
export function extractAttachmentMetadata(payload: any): Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
}> {
    if (!payload) return [];

    const attachments: Array<{ id: string; filename: string; mimeType: string; size: number }> = [];

    function walk(part: any) {
        if (part.parts) {
            part.parts.forEach(walk);
        }

        if (part.body?.attachmentId) {
            attachments.push({
                id: part.body.attachmentId,
                filename: part.filename,
                mimeType: part.mimeType,
                size: part.body.size,
            });
        }
    }

    walk(payload);

    return attachments;
}

/**
 * Strip HTML tags and extract plain text from an email body.
 * Used to derive body_text for search indexing.
 */
export function extractPlainText(html: string, maxLength: number = 2000): string {
    if (!html) return '';
    let text = html;
    // Remove style and script blocks
    text = text.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    // Remove HTML tags
    text = text.replace(/<[^>]*>/g, ' ');
    // Decode common HTML entities
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/gi, "'");
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    // Truncate
    return text.substring(0, maxLength);
}
