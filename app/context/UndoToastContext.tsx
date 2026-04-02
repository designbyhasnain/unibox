'use client';

import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

interface PendingDelete {
    id: string;
    type: string;
    label: string;
    data: any;
    timeoutId: ReturnType<typeof setTimeout>;
    expiresAt: number;
    deleteAction: () => Promise<any>;
    onUndo: () => void;
}

interface UndoToastContextType {
    scheduleDelete: (params: {
        id: string;
        type: string;
        label: string;
        data: any;
        deleteAction: () => Promise<any>;
        onUndo: () => void;
    }) => void;
    undoDelete: (id: string) => void;
    pending: PendingDelete[];
}

const UndoToastContext = createContext<UndoToastContextType | undefined>(undefined);

const UNDO_DELAY = 5000;

export function UndoToastProvider({ children }: { children: ReactNode }) {
    const [pending, setPending] = useState<PendingDelete[]>([]);
    const pendingRef = useRef<PendingDelete[]>([]);

    const removePending = useCallback((id: string) => {
        pendingRef.current = pendingRef.current.filter(p => p.id !== id);
        setPending([...pendingRef.current]);
    }, []);

    const scheduleDelete = useCallback(({ id, type, label, data, deleteAction, onUndo }: {
        id: string; type: string; label: string; data: any;
        deleteAction: () => Promise<any>; onUndo: () => void;
    }) => {
        const timeoutId = setTimeout(async () => {
            try {
                await deleteAction();
            } catch (err) {
                console.error('[UndoToast] Delete failed:', err);
            }
            removePending(id);
        }, UNDO_DELAY);

        const entry: PendingDelete = {
            id, type, label, data, timeoutId,
            expiresAt: Date.now() + UNDO_DELAY,
            deleteAction, onUndo,
        };
        pendingRef.current = [...pendingRef.current, entry];
        setPending([...pendingRef.current]);
    }, [removePending]);

    const undoDelete = useCallback((id: string) => {
        const entry = pendingRef.current.find(p => p.id === id);
        if (entry) {
            clearTimeout(entry.timeoutId);
            entry.onUndo();
            removePending(id);
        }
    }, [removePending]);

    return (
        <UndoToastContext.Provider value={{ scheduleDelete, undoDelete, pending }}>
            {children}
            <UndoToastStack pending={pending} onUndo={undoDelete} />
        </UndoToastContext.Provider>
    );
}

export function useUndoToast() {
    const ctx = useContext(UndoToastContext);
    if (!ctx) throw new Error('useUndoToast must be used within UndoToastProvider');
    return ctx;
}

// ── Toast Stack UI ──────────────────────────────────────────────────────────

function UndoToastStack({ pending, onUndo }: { pending: PendingDelete[]; onUndo: (id: string) => void }) {
    if (pending.length === 0) return null;

    return (
        <div style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 10000,
            display: 'flex', flexDirection: 'column', gap: 8,
        }}>
            {pending.map(p => (
                <UndoToastItem key={p.id} item={p} onUndo={() => onUndo(p.id)} />
            ))}
        </div>
    );
}

function UndoToastItem({ item, onUndo }: { item: PendingDelete; onUndo: () => void }) {
    const [progress, setProgress] = React.useState(100);

    React.useEffect(() => {
        const interval = setInterval(() => {
            const remaining = item.expiresAt - Date.now();
            if (remaining <= 0) {
                setProgress(0);
                clearInterval(interval);
            } else {
                setProgress((remaining / UNDO_DELAY) * 100);
            }
        }, 50);
        return () => clearInterval(interval);
    }, [item.expiresAt]);

    return (
        <div style={{
            background: '#1f2937', color: '#fff', borderRadius: 10,
            padding: '12px 16px', minWidth: 320, maxWidth: 400,
            boxShadow: '0 8px 24px rgba(0,0,0,.25)',
            animation: 'toastIn 0.25s ease',
            overflow: 'hidden', position: 'relative',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>&#x1F5D1;</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                    <strong>{item.label}</strong> deleted
                </span>
                <button onClick={onUndo} style={{
                    background: '#3b82f6', color: '#fff', border: 'none',
                    borderRadius: 6, padding: '5px 14px', fontSize: 12,
                    fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                    Undo
                </button>
            </div>
            <div style={{
                position: 'absolute', bottom: 0, left: 0, height: 3,
                background: '#3b82f6', transition: 'width 0.05s linear',
                width: `${progress}%`, borderRadius: '0 0 10px 10px',
            }} />
        </div>
    );
}
