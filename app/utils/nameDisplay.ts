// Tiny shared helpers for name display.
//
// firstName() and initials() previously lived inline in 7+ places, all of
// them using `.trim().split(/\s+/)[0]`. The synthetic-workflow run found
// that naive split breaks for any name starting with a bracketed prefix
// like "[SYN] Sales Tester" or "(External) Some Person" — the dashboard
// greeting rendered "Good evening, [SYN]" and the contact-detail header
// said "Owner: [SYN]". Real Wedits team uses parens/brackets occasionally
// (e.g. "(Affan) Hashir") so the bug isn't sentinel-only.
//
// Strategy: strip a leading [...] or (...) bracketed prefix before doing
// the split. Falls back to the original full string if everything was a
// bracketed prefix.

const BRACKETED_PREFIX = /^\s*[\[(][^\])]*[\])]\s*/;

/** First word of a display name, ignoring bracketed/parenthesised prefixes. */
export function firstName(full?: string | null): string {
    if (!full) return '';
    const stripped = String(full).replace(BRACKETED_PREFIX, '').trim();
    const candidate = stripped || String(full).trim();
    return candidate.split(/\s+/)[0] || '';
}

/** Up to 2 uppercase initials, ignoring bracketed/parenthesised prefixes. */
export function initials(full?: string | null, fallback = 'U'): string {
    if (!full) return fallback;
    const stripped = String(full).replace(BRACKETED_PREFIX, '').trim();
    const source = stripped || String(full).trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return fallback;
    const letters = parts.map(w => w[0] || '').filter(c => /[A-Za-z]/.test(c));
    return (letters.slice(0, 2).join('') || fallback).toUpperCase();
}
