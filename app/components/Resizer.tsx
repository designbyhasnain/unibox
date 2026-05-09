'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ResizerProps {
    varName: string;
    storageKey: string;
    min: number;
    max: number;
    defaultVal: number;
    invert?: boolean;
    /** Where the handle sits relative to its containing element. Defaults to
     *  'left' (the inbox-list ↔ thread divider). 'right' pins to the right
     *  edge — used by the sidebar so its right border is the drag handle. */
    edge?: 'left' | 'right';
}

export default function Resizer({ varName, storageKey, min, max, defaultVal, invert, edge = 'left' }: ResizerProps) {
    const [dragging, setDragging] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const saved = parseInt(localStorage.getItem(storageKey) || '', 10);
        const v = Number.isFinite(saved) ? Math.min(max, Math.max(min, saved)) : defaultVal;
        document.documentElement.style.setProperty(varName, v + 'px');
    }, [varName, storageKey, min, max, defaultVal]);

    const onDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const currentW = parseInt(getComputedStyle(document.documentElement).getPropertyValue(varName), 10) || defaultVal;
        setDragging(true);
        document.body.classList.add('col-resizing');

        const move = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            const next = Math.min(max, Math.max(min, currentW + (invert ? -dx : dx)));
            document.documentElement.style.setProperty(varName, next + 'px');
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            setDragging(false);
            document.body.classList.remove('col-resizing');
            const final = parseInt(getComputedStyle(document.documentElement).getPropertyValue(varName), 10);
            try { localStorage.setItem(storageKey, String(final)); } catch {}
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }, [varName, storageKey, min, max, defaultVal, invert]);

    const handleDoubleClick = useCallback(() => {
        document.documentElement.style.setProperty(varName, defaultVal + 'px');
        try { localStorage.setItem(storageKey, String(defaultVal)); } catch {}
    }, [varName, storageKey, defaultVal]);

    return (
        <div
            ref={ref}
            className={`inbox-resizer inbox-resizer--${edge} ${dragging ? 'dragging' : ''}`}
            onPointerDown={onDown}
            onDoubleClick={handleDoubleClick}
            title="Drag to resize · double-click to reset"
        />
    );
}
