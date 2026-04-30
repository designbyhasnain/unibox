'use client';

import { useEffect } from 'react';

/**
 * Reports a single page-load timing sample to /api/perf/log when the page
 * has finished its initial paint. Uses Performance API entries when
 * available; falls back to a wall-clock measure rooted at navigationStart.
 *
 * Pass the canonical route path (e.g. '/dashboard' rather than the full
 * URL) so samples bucket cleanly server-side.
 */
export function usePerfMonitor(route: string) {
    useEffect(() => {
        // Only run client-side.
        if (typeof window === 'undefined' || typeof performance === 'undefined') return;

        let posted = false;

        const submit = (totalMs: number, ttfbMs?: number, lcpMs?: number) => {
            if (posted) return;
            posted = true;
            // sendBeacon is more reliable on tab close, but fetch keepalive
            // is good enough and gives us better error visibility in dev.
            fetch('/api/perf/log', {
                method: 'POST',
                keepalive: true,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ route, totalMs, ttfbMs, lcpMs }),
            }).catch(() => { /* swallow — never break a page over telemetry */ });
        };

        // Capture LCP via PerformanceObserver if supported. We fire after the
        // first LCP entry since SPA navigations don't always replay them.
        let lcpMs: number | undefined;
        let observer: PerformanceObserver | undefined;
        try {
            observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'largest-contentful-paint') {
                        lcpMs = entry.startTime;
                    }
                }
            });
            observer.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch { /* unsupported */ }

        const fire = () => {
            const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
            const ttfbMs = nav ? nav.responseStart - nav.requestStart : undefined;
            const totalMs = nav
                ? Math.max(0, (nav.domContentLoadedEventEnd || nav.responseEnd) - nav.startTime)
                : performance.now();
            submit(totalMs, ttfbMs, lcpMs);
            observer?.disconnect();
        };

        // Wait for the next idle/animation-frame so DOMContentLoaded has
        // landed even when the hook mounts very early.
        const timer = window.setTimeout(fire, 0);

        // Also fire on visibility change — captures tabs that get backgrounded
        // before idle.
        const onVis = () => { if (document.visibilityState === 'hidden') fire(); };
        document.addEventListener('visibilitychange', onVis);

        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVis);
            observer?.disconnect();
        };
    }, [route]);
}
