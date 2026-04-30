'use client';

import { useEffect, useRef } from 'react';

/**
 * Modal hygiene helper: focus trap + body scroll lock + Esc-to-close + restore
 * focus on unmount. Drop into any modal alongside the existing `modal-overlay`
 * markup. Mirrors the pattern in ConfirmModal.tsx.
 *
 *   const { dialogRef } = useDialogShell({ onClose, autoFocus: true });
 *   return (
 *     <div className="modal-overlay" onClick={onClose}>
 *       <div ref={dialogRef} className="modal-container" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
 *         ...
 *       </div>
 *     </div>
 *   );
 */
export function useDialogShell({ onClose, autoFocus = true }: { onClose: () => void; autoFocus?: boolean }) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    useEffect(() => {
        previouslyFocused.current = (document.activeElement as HTMLElement) || null;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // Focus first focusable element on open. Lets users tab right into a
        // form field rather than the close button.
        if (autoFocus && dialogRef.current) {
            const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
                'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            // Skip the close (X) button if it's first — prefer the first form field.
            const target = focusables[0] && focusables[0].getAttribute('aria-label')?.toLowerCase().includes('close')
                ? focusables[1] || focusables[0]
                : focusables[0];
            target?.focus?.();
        }

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
            }
            if (e.key === 'Tab' && dialogRef.current) {
                const focusables = Array.from(
                    dialogRef.current.querySelectorAll<HTMLElement>(
                        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
                    )
                ).filter(el => !el.hasAttribute('aria-hidden'));
                if (focusables.length === 0) return;
                const first = focusables[0]!;
                const last = focusables[focusables.length - 1]!;
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', handleKey);

        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = prevOverflow;
            previouslyFocused.current?.focus?.();
        };
        // We intentionally only run this once on mount — onClose ref churn would re-trigger focus.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { dialogRef };
}
