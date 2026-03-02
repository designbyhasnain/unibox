/**
 * Shared utility functions used across multiple components.
 * Consolidates duplicate helpers to follow the DRY principle.
 */

/** Generates a deterministic avatar color from a seed string */
export function avatarColor(seed: string): string {
    const colors = ['#4f8cff', '#a78bfa', '#ec4899', '#22c55e', '#f59e0b', '#06b6d4', '#ef4444'];
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffff;
    return colors[Math.abs(h) % colors.length] ?? '#4f8cff';
}

/** Returns 1 or 2 character initials from a name string */
export function initials(name: string): string {
    const cleanName = (name || '').replace(/<[^>]+>/g, '').trim();
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        const fallback = (name || '').trim().charAt(0) || '?';
        return fallback.toUpperCase();
    }
    const first = parts[0]?.charAt(0) ?? '?';
    if (parts.length === 1) return first.toUpperCase();
    const last = parts[parts.length - 1]?.charAt(0) ?? '';
    return (first + last).toUpperCase();
}

/** Formats a date string into a user-friendly relative format */
export function formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Strips HTML tags from an email body for safe text-only preview */
export function cleanBody(html: string): string {
    if (!html) return '';
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/** Extracts a clean preview from an email snippet or body */
export function cleanPreview(snippet: string): string {
    return (snippet || '')
        // Strip style/script blocks
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        // Strip HTML comments and conditional comments (Outlook)
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<!\[[\s\S]*?\]>/g, '')
        // Strip remaining HTML tags
        .replace(/<[^>]+>/g, ' ')
        // Strip CSS blocks: anything with { ... } including multi-line
        .replace(/[^{}]*\{[^}]*\}/g, ' ')
        // Strip remaining orphan braces
        .replace(/[{}]/g, ' ')
        // Strip URLs
        .replace(/https?:\/\/\S+/g, '')
        // Strip DOCTYPE and xml declarations
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<\?xml[^>]*>/gi, '')
        // Strip HTML entities
        .replace(/&#\d+;/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        // Strip CSS/code fragments (property: value;)
        .replace(/[\w-]+\s*:\s*[\w#\-().,!%]+\s*;?/g, ' ')
        // Strip MS/Outlook specific patterns
        .replace(/-webkit-[\w-]+/g, '')
        .replace(/-ms-[\w-]+/g, '')
        .replace(/-moz-[\w-]+/g, '')
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\d+\s*/, '')
        .substring(0, 110) || 'No preview';
}
