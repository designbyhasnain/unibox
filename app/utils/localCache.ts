const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
    data: any;
    expiresAt: number;
}

export function saveToLocalCache(key: string, data: any, ttlMs: number = DEFAULT_TTL_MS) {
    if (typeof window === 'undefined') return;
    try {
        const entry: CacheEntry = {
            data,
            expiresAt: Date.now() + ttlMs,
        };
        localStorage.setItem(`unibox_cache_${key}`, JSON.stringify(entry));
    } catch (e) {
        console.warn('Local cache save failed', e);
    }
}

export function getFromLocalCache(key: string) {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(`unibox_cache_${key}`);
        if (!raw) return null;

        const parsed = JSON.parse(raw);

        // Support legacy entries that don't have expiresAt (treat as valid)
        if (parsed && typeof parsed === 'object' && 'expiresAt' in parsed) {
            const entry = parsed as CacheEntry;
            if (Date.now() > entry.expiresAt) {
                // Expired - remove and return null
                localStorage.removeItem(`unibox_cache_${key}`);
                return null;
            }
            return entry.data;
        }

        // Legacy format without TTL wrapper - return as-is but treat as expired next time
        return parsed;
    } catch (e) {
        console.warn('Local cache read failed', e);
        return null;
    }
}
