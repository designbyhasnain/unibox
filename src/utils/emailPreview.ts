/**
 * Extract the actual reply content from an email body, stripping quoted
 * previous messages that email clients auto-append.
 *
 * When someone replies to an email, their client usually includes the prior
 * message as a quote below their new text:
 *
 *   "Frame is perfect!!"                           ← the reply (what we want)
 *   "Sent from iPhone"                             ← signature (keep a bit)
 *   "On Wed, Apr 15, 2026 at 12:20 AM X wrote:"    ← quote header (DROP)
 *   "> That's weird. I sent one..."                ← quoted body (DROP)
 *
 * If we don't strip the quote, a 300-char preview is 90% quoted text and the
 * user can't see what the client actually said.
 */

const QUOTE_SELECTORS = [
    '.gmail_quote_container',
    '.gmail_quote',
    'blockquote',
    'div[class*="quote"]',
    'div[class*="Quote"]',
    'div[class*="OriginalMessage"]',
];

// Plain-text quote markers — anything after these is quoted content
const PLAIN_TEXT_QUOTE_MARKERS = [
    /\n\s*On\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d+\/)/i,
    /\n\s*-{2,}\s*Original Message\s*-{2,}/i,
    /\n\s*From:\s.+(\r?\n|$)\s*Sent:/i,
    /\n\s*>.+/,  // line starting with >
    /\n\s*_{4,}/,  // underline separator
];

/**
 * Strip quoted content from an HTML email body. Falls back to plain-text
 * stripping if no DOM is available (SSR).
 */
function stripHtmlQuotes(html: string): string {
    if (typeof document === 'undefined') {
        // SSR fallback — crude regex
        return html
            .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '')
            .replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*?<\/div>/gi, '');
    }

    const div = document.createElement('div');
    div.innerHTML = html;

    // Remove all known quote containers
    for (const selector of QUOTE_SELECTORS) {
        div.querySelectorAll(selector).forEach(el => el.remove());
    }

    return div.innerHTML;
}

/**
 * Convert HTML to clean plain text, preserving line breaks.
 */
function htmlToText(html: string): string {
    if (typeof document === 'undefined') {
        return html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const div = document.createElement('div');
    div.innerHTML = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
    return (div.textContent || div.innerText || '').trim();
}

/**
 * Strip plain-text quote markers. Takes everything before the first marker.
 */
function stripPlainTextQuotes(text: string): string {
    let earliest = text.length;
    for (const pattern of PLAIN_TEXT_QUOTE_MARKERS) {
        const match = text.match(pattern);
        if (match && match.index !== undefined && match.index < earliest) {
            earliest = match.index;
        }
    }
    return text.substring(0, earliest).trim();
}

/**
 * Main extraction: given an email body (HTML) and optional snippet (plain text),
 * return a clean preview of the new content only, up to `maxLen` characters.
 */
export function extractReplyPreview(
    body: string | null | undefined,
    snippet: string | null | undefined,
    maxLen = 200
): string {
    // Prefer body — we can strip HTML quote containers precisely
    if (body && body.length > 0) {
        const stripped = stripHtmlQuotes(body);
        const text = htmlToText(stripped);
        const cleaned = stripPlainTextQuotes(text).replace(/\s+/g, ' ').trim();
        if (cleaned.length > 0) {
            return cleaned.length > maxLen ? cleaned.substring(0, maxLen) + '…' : cleaned;
        }
    }

    // Fall back to snippet — plain-text stripping only
    if (snippet && snippet.length > 0) {
        const cleaned = stripPlainTextQuotes(snippet).replace(/\s+/g, ' ').trim();
        return cleaned.length > maxLen ? cleaned.substring(0, maxLen) + '…' : cleaned;
    }

    return '';
}
