'use client';

import { useEffect } from 'react';

/**
 * Phase-2.3 — register `/sw.js` on the client. Only in production:
 * Turbopack dev + service workers fight over chunk caching and produce
 * "module factory not available" / blank-page bugs. The SW also waits
 * for the `load` event so it doesn't compete with first paint.
 */
export default function ServiceWorkerRegister() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (process.env.NODE_ENV !== 'production') return;
        if (!('serviceWorker' in navigator)) return;

        const onLoad = () => {
            navigator.serviceWorker
                .register('/sw.js', { scope: '/' })
                .catch(err => {
                    // Registration failures are non-critical — the site works
                    // without a SW; just no offline cache + no install prompt.
                    console.warn('[sw] registration failed:', err);
                });
        };

        if (document.readyState === 'complete') onLoad();
        else window.addEventListener('load', onLoad, { once: true });

        return () => window.removeEventListener('load', onLoad);
    }, []);

    return null;
}
