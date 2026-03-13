'use client';

import { useEffect, useRef } from 'react';

/**
 * Invisible component that registers the CRM user's IP on first load.
 * This IP is then used by the tracking pixel to filter out self-opens.
 * Ultra-lightweight — fires once per session, no UI rendered.
 */
export function OwnerSessionTracker() {
    const registered = useRef(false);

    useEffect(() => {
        if (registered.current) return;
        registered.current = true;

        // Fire-and-forget — don't await, don't block anything
        fetch('/api/track/session', { method: 'POST' }).catch(() => {});
    }, []);

    return null; // No UI — invisible
}
