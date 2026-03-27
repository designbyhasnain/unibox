const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_STALE_MS = 30_000; // 30 seconds — data is "fresh" for 30s

interface CacheEntry {
    data: any;
    expiresAt: number;
    staleAfter?: number;
    cachedAt?: number;
}

export function saveToLocalCache(key: string, data: any, ttlMs: number = DEFAULT_TTL_MS) {
    if (typeof window === 'undefined') return;
    try {
        const now = Date.now();
        const entry: CacheEntry = {
            data,
            expiresAt: now + ttlMs,
            staleAfter: now + DEFAULT_STALE_MS,
            cachedAt: now,
        };
        localStorage.setItem(`unibox_cache_${key}`, JSON.stringify(entry));
    } catch {
        // Storage full or other error — non-critical
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

        // Legacy format without TTL wrapper - return as-is
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Stale-while-revalidate cache read.
 * Returns the data + whether it's stale (should be refreshed in background).
 */
export function getCacheWithStatus<T = any>(key: string): {
    data: T | null;
    isStale: boolean;
    isMissing: boolean;
} {
    if (typeof window === 'undefined') {
        return { data: null, isStale: false, isMissing: true };
    }
    try {
        const raw = localStorage.getItem(`unibox_cache_${key}`);
        if (!raw) return { data: null, isStale: false, isMissing: true };

        const parsed = JSON.parse(raw);

        if (parsed && typeof parsed === 'object' && 'expiresAt' in parsed) {
            const entry = parsed as CacheEntry;
            const now = Date.now();

            if (now > entry.expiresAt) {
                localStorage.removeItem(`unibox_cache_${key}`);
                return { data: null, isStale: false, isMissing: true };
            }

            const isStale = entry.staleAfter ? now > entry.staleAfter : false;

            return {
                data: entry.data as T,
                isStale,
                isMissing: false,
            };
        }

        // Legacy format
        return { data: parsed as T, isStale: true, isMissing: false };
    } catch {
        return { data: null, isStale: false, isMissing: true };
    }
}
