'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

/**
 * Tiny popover used by table-cell dropdowns (Editor / Progress / Priority).
 *
 * Why this exists: `.ep-cell { overflow: hidden }` is needed for text ellipsis,
 * which clips any `position: absolute` child. We sidestep that by portaling
 * the dropdown to document.body and using `position: fixed` with coords
 * computed from the trigger's bounding rect — the cell's overflow and any
 * ancestor stacking context become irrelevant.
 *
 * Behavior:
 *  - Opens flush below the trigger; flips above if there isn't enough space.
 *  - Right-aligns instead of clipping off the right viewport edge.
 *  - Click-outside (anywhere except trigger or panel) closes.
 *  - Esc closes.
 *  - Reposition on scroll/resize while open so it tracks if the row scrolls.
 */
type Props = {
    open: boolean;
    onClose: () => void;
    /** The trigger element — used for both anchoring and click-outside detection. */
    triggerRef: React.RefObject<HTMLElement | null>;
    /** Minimum/initial popover width — actual width can grow up to maxWidth. */
    minWidth?: number;
    maxWidth?: number;
    /** Optional className applied to the panel. */
    className?: string;
    children: ReactNode;
};

export default function Popover({ open, onClose, triggerRef, minWidth = 160, maxWidth = 360, className, children }: Props) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState<CSSProperties | null>(null);

    // Compute position synchronously after layout so the panel never flickers
    // on the wrong corner. Re-runs on scroll/resize while open.
    const reposition = () => {
        const trigger = triggerRef.current;
        const panel = panelRef.current;
        if (!trigger || !panel) return;
        const t = trigger.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pad = 8;
        // Horizontal: prefer left-aligned with the trigger; flip-right if it would overflow.
        let left = t.left;
        if (left + panelRect.width > vw - pad) left = Math.max(pad, vw - panelRect.width - pad);
        // Vertical: prefer below; flip above if no room.
        let top = t.bottom + 4;
        if (top + panelRect.height > vh - pad && t.top - panelRect.height - 4 > pad) {
            top = t.top - panelRect.height - 4;
        }
        setCoords({ position: 'fixed', top, left, minWidth, maxWidth, zIndex: 10000 });
    };

    useLayoutEffect(() => {
        if (!open) { setCoords(null); return; }
        reposition();
        // Run again next frame in case the panel's natural width changed (e.g., async list load).
        const id = requestAnimationFrame(reposition);
        return () => cancelAnimationFrame(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            const t = e.target as Node;
            if (panelRef.current?.contains(t)) return;
            if (triggerRef.current?.contains(t)) return;
            onClose();
        };
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        const reposition2 = () => reposition();
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleEsc);
        window.addEventListener('scroll', reposition2, true);
        window.addEventListener('resize', reposition2);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleEsc);
            window.removeEventListener('scroll', reposition2, true);
            window.removeEventListener('resize', reposition2);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open || typeof document === 'undefined') return null;

    return createPortal(
        <div
            ref={panelRef}
            className={`ep-popover ${className ?? ''}`}
            style={coords ?? { position: 'fixed', visibility: 'hidden', minWidth, maxWidth, zIndex: 10000 }}
            onClick={e => e.stopPropagation()}
        >
            {children}
        </div>,
        document.body,
    );
}
