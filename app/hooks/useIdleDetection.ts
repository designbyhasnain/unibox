'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'pointermove'] as const;

/**
 * Detects user inactivity after 5 minutes of no interaction.
 * Returns `isIdle` (true when idle) and `resume()` to manually wake up.
 *
 * Used to pause all polling/sync when the tab is left open but unused,
 * saving Vercel CPU time.
 */
export function useIdleDetection() {
    const [isIdle, setIsIdle] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resetTimer = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setIsIdle(true), IDLE_TIMEOUT_MS);
    }, []);

    const resume = useCallback(() => {
        setIsIdle(false);
        resetTimer();
    }, [resetTimer]);

    useEffect(() => {
        // Start the idle timer
        resetTimer();

        const onActivity = () => {
            if (isIdle) return; // Don't auto-resume — require explicit click on "Resume Sync"
            resetTimer();
        };

        for (const event of ACTIVITY_EVENTS) {
            document.addEventListener(event, onActivity, { passive: true });
        }

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            for (const event of ACTIVITY_EVENTS) {
                document.removeEventListener(event, onActivity);
            }
        };
    }, [isIdle, resetTimer]);

    return { isIdle, resume };
}
