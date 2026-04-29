'use client';

/**
 * Stale-While-Revalidate Cache
 *
 * Every page shows cached data INSTANTLY (<10ms from localStorage),
 * then refreshes from server in the background.
 * User sees content in <100ms, fresh data replaces it silently.
 */

const CACHE_PREFIX = 'swr_';

export function getCachedData<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;
        const { data, ts } = JSON.parse(raw);
        // Cache valid for 30 minutes max
        if (Date.now() - ts > 30 * 60 * 1000) return null;
        return data as T;
    } catch { return null; }
}

export function setCachedData<T>(key: string, data: T): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
    } catch {
        // localStorage full — clear old SWR entries
        const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
        keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
    }
}

/**
 * Hook: useSWRData
 * Returns cached data instantly, then fetches fresh data in background.
 *
 * Usage:
 *   const { data, isLoading, isStale } = useSWRData('clients', () => getClientsAction(...));
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export function useSWRData<T>(
    key: string,
    fetcher: () => Promise<T>,
    deps: any[] = []
): { data: T | null; isLoading: boolean; isStale: boolean; refresh: () => void } {
    const [data, setData] = useState<T | null>(() => getCachedData<T>(key));
    const [isLoading, setIsLoading] = useState(!getCachedData(key));
    const [isStale, setIsStale] = useState(!!getCachedData(key));
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    const refresh = useCallback(async () => {
        try {
            const fresh = await fetcherRef.current();
            setData(fresh);
            setIsStale(false);
            setIsLoading(false);
            setCachedData(key, fresh);
        } catch (err) {
            console.error(`[SWR:${key}] Fetch error:`, err);
            setIsLoading(false);
        }
    }, [key]);

    useEffect(() => {
        // If we have cache, show it immediately and fetch in background
        const cached = getCachedData<T>(key);
        if (cached) {
            setData(cached);
            setIsStale(true);
            setIsLoading(false);
            // Background refresh
            refresh();
        } else {
            setIsLoading(true);
            refresh();
        }
    }, [key, refresh, ...deps]);  

    return { data, isLoading, isStale, refresh };
}
