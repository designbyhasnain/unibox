import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys, createStore } from 'idb-keyval';

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_STALE_MS = 30_000; // 30 seconds — data is "fresh" for 30s

interface CacheEntry {
    data: any;
    expiresAt: number;
    staleAfter?: number;
    cachedAt?: number;
}

/**
 * Phase-2 cache backend — IndexedDB with an in-memory mirror.
 *
 * Why: localStorage is synchronous (every JSON.stringify of an inbox-list
 * blocks the main thread for 5-15 ms) and capped at ~5 MB. IDB is async,
 * roomy (50+ MB), and lets us cache a much larger inbox mirror.
 *
 * Public API stays synchronous so the dozens of existing callers keep
 * working unchanged. We achieve that by:
 *   1. Hydrating the entire cache namespace from IDB into an in-memory
 *      Map at module-load (best-effort — usually <50 ms).
 *   2. Reads return from the Map (sync).
 *   3. Writes update the Map sync, then fire-and-forget to IDB.
 *
 * Backwards compatibility: on the very first run after this lands the
 * Map is empty, so reads fall back to the legacy localStorage path
 * which we ALSO use to migrate existing entries into IDB. After that
 * first warm-up, localStorage writes stop entirely.
 */

const KEY_PREFIX = 'unibox_cache_';

// Dedicated IDB store keeps us out of the global namespace and lets us
// later wipe the whole cache with a single `clear()`.
const idbStore =
    typeof window !== 'undefined'
        ? createStore('unibox-cache', 'kv')
        : (null as unknown as ReturnType<typeof createStore>);

/** Sync read source. Hydrated from IDB at boot; updated on every write. */
const memoryMirror = new Map<string, CacheEntry>();

/** Set true once the IDB → mirror hydration has completed. */
let hydrated = false;

/**
 * Best-effort hydration. Runs once at module import (browser only).
 * Also performs a one-shot migration of any `unibox_cache_*` keys still
 * in localStorage — they're copied into IDB + the mirror, then removed.
 */
async function hydrate() {
    if (typeof window === 'undefined') return;
    try {
        // 1. Pull all keys from IDB into the mirror.
        const keys = (await idbKeys(idbStore)) as IDBValidKey[];
        await Promise.all(
            keys.map(async k => {
                if (typeof k !== 'string') return;
                const entry = await idbGet(k, idbStore);
                if (entry && typeof entry === 'object' && 'expiresAt' in entry) {
                    memoryMirror.set(k, entry as CacheEntry);
                }
            })
        );
    } catch {
        // IDB unavailable (private window in Safari, etc.) — fall through to
        // localStorage-only path; everything still works, just less roomy.
    }

    // 2. Migrate any leftover localStorage entries into IDB + mirror.
    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const fullKey = localStorage.key(i);
            if (!fullKey || !fullKey.startsWith(KEY_PREFIX)) continue;
            const key = fullKey.slice(KEY_PREFIX.length);
            if (memoryMirror.has(key)) {
                localStorage.removeItem(fullKey);
                continue;
            }
            const raw = localStorage.getItem(fullKey);
            if (!raw) continue;
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && 'expiresAt' in parsed) {
                    const entry = parsed as CacheEntry;
                    if (Date.now() <= entry.expiresAt) {
                        memoryMirror.set(key, entry);
                        idbSet(key, entry, idbStore).catch(() => {});
                    }
                }
            } catch {
                // Malformed legacy entry — drop.
            }
            localStorage.removeItem(fullKey);
        }
    } catch {
        // localStorage unavailable — nothing to migrate.
    }

    hydrated = true;
}
if (typeof window !== 'undefined') {
    hydrate();
}

function readLegacy(key: string): CacheEntry | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(KEY_PREFIX + key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && 'expiresAt' in parsed) {
            return parsed as CacheEntry;
        }
        // Pre-TTL format — wrap as a fresh entry so callers still get data.
        return {
            data: parsed,
            expiresAt: Date.now() + DEFAULT_TTL_MS,
            staleAfter: 0,
            cachedAt: 0,
        };
    } catch {
        return null;
    }
}

function readEntry(key: string): CacheEntry | null {
    const fromMirror = memoryMirror.get(key);
    if (fromMirror) {
        if (Date.now() > fromMirror.expiresAt) {
            memoryMirror.delete(key);
            idbDel(key, idbStore).catch(() => {});
            return null;
        }
        return fromMirror;
    }
    if (hydrated) return null;
    // Pre-hydration cold read — fall back to legacy localStorage so we
    // don't lose data on first reload after this lands.
    const legacy = readLegacy(key);
    if (legacy && Date.now() > legacy.expiresAt) return null;
    return legacy;
}

export function saveToLocalCache(key: string, data: any, ttlMs: number = DEFAULT_TTL_MS) {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    const entry: CacheEntry = {
        data,
        expiresAt: now + ttlMs,
        staleAfter: now + DEFAULT_STALE_MS,
        cachedAt: now,
    };
    memoryMirror.set(key, entry);
    idbSet(key, entry, idbStore).catch(() => {
        // IDB write failed (quota / private mode) — degrade gracefully to
        // localStorage so at least the entry survives a reload. The mirror
        // already holds the in-session truth.
        try {
            localStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
        } catch {
            // Both backends unavailable — non-critical.
        }
    });
}

export function getFromLocalCache(key: string) {
    const entry = readEntry(key);
    return entry ? entry.data : null;
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
    const entry = readEntry(key);
    if (!entry) return { data: null, isStale: false, isMissing: true };
    const isStale = entry.staleAfter ? Date.now() > entry.staleAfter : false;
    return { data: entry.data as T, isStale, isMissing: false };
}
