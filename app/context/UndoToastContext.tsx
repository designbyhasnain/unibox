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

interface ErrorToast {
    id: string;
    message: string;
    onRetry?: () => void | Promise<void>;
    autoDismissMs?: number;
    /** Visual variant — defaults to error; success/info change icon + accent. */
    variant?: 'error' | 'success' | 'info';
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
    /** Show a friendly error toast with an optional Retry button. Returns the toast id. */
    showError: (message: string, opts?: { onRetry?: () => void | Promise<void>; autoDismissMs?: number }) => string;
    /** Show a success toast — auto-dismisses in 3.5s by default. */
    showSuccess: (message: string, opts?: { autoDismissMs?: number }) => string;
    /** Show a neutral info toast — auto-dismisses in 4.5s by default. */
    showInfo: (message: string, opts?: { autoDismissMs?: number }) => string;
    dismissError: (id: string) => void;
    errors: ErrorToast[];
}

const UndoToastContext = createContext<UndoToastContextType | undefined>(undefined);

const UNDO_DELAY = 5000;

export function UndoToastProvider({ children }: { children: ReactNode }) {
    const [pending, setPending] = useState<PendingDelete[]>([]);
    const [errors, setErrors] = useState<ErrorToast[]>([]);
    const pendingRef = useRef<PendingDelete[]>([]);
    const errorsRef = useRef<ErrorToast[]>([]);

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

    const dismissError = useCallback((id: string) => {
        errorsRef.current = errorsRef.current.filter(e => e.id !== id);
        setErrors([...errorsRef.current]);
    }, []);

    const showError = useCallback((message: string, opts?: { onRetry?: () => void | Promise<void>; autoDismissMs?: number }) => {
        const id = `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const toast: ErrorToast = { id, message, onRetry: opts?.onRetry, autoDismissMs: opts?.autoDismissMs, variant: 'error' };
        errorsRef.current = [...errorsRef.current, toast];
        setErrors([...errorsRef.current]);

        // Only auto-dismiss when no retry is available — retryable toasts stick until acknowledged.
        if (!opts?.onRetry) {
            const ms = opts?.autoDismissMs ?? 6000;
            setTimeout(() => dismissError(id), ms);
        }
        return id;
    }, [dismissError]);

    const showSuccess = useCallback((message: string, opts?: { autoDismissMs?: number }) => {
        const id = `ok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const toast: ErrorToast = { id, message, autoDismissMs: opts?.autoDismissMs, variant: 'success' };
        errorsRef.current = [...errorsRef.current, toast];
        setErrors([...errorsRef.current]);
        const ms = opts?.autoDismissMs ?? 3500;
        setTimeout(() => dismissError(id), ms);
        return id;
    }, [dismissError]);

    const showInfo = useCallback((message: string, opts?: { autoDismissMs?: number }) => {
        const id = `info-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const toast: ErrorToast = { id, message, autoDismissMs: opts?.autoDismissMs, variant: 'info' };
        errorsRef.current = [...errorsRef.current, toast];
        setErrors([...errorsRef.current]);
        const ms = opts?.autoDismissMs ?? 4500;
        setTimeout(() => dismissError(id), ms);
        return id;
    }, [dismissError]);

    return (
        <UndoToastContext.Provider value={{ scheduleDelete, undoDelete, pending, showError, showSuccess, showInfo, dismissError, errors }}>
            {children}
            <UndoToastStack pending={pending} onUndo={undoDelete} />
            <ErrorToastStack errors={errors} onDismiss={dismissError} />
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
            background: 'var(--shell)', color: 'var(--ink)', borderRadius: 10,
            padding: '12px 16px', minWidth: 320, maxWidth: 400,
            boxShadow: 'var(--shadow-pop)',
            border: '1px solid var(--hairline)',
            animation: 'toastIn 0.25s ease',
            overflow: 'hidden', position: 'relative',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>&#x1F5D1;</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                    <strong>{item.label}</strong> deleted
                </span>
                <button onClick={onUndo} style={{
                    background: 'var(--accent)', color: '#fff', border: 'none',
                    borderRadius: 6, padding: '5px 14px', fontSize: 12,
                    fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                    Undo
                </button>
            </div>
            <div style={{
                position: 'absolute', bottom: 0, left: 0, height: 3,
                background: 'var(--accent)', transition: 'width 0.05s linear',
                width: `${progress}%`, borderRadius: '0 0 10px 10px',
            }} />
        </div>
    );
}

// ── Error Toast Stack UI ────────────────────────────────────────────────────

function ErrorToastStack({ errors, onDismiss }: { errors: ErrorToast[]; onDismiss: (id: string) => void }) {
    if (errors.length === 0) return null;

    return (
        <div style={{
            position: 'fixed', top: 20, right: 20, zIndex: 10001,
            display: 'flex', flexDirection: 'column', gap: 8,
        }}>
            {errors.map(e => (
                <ErrorToastItem key={e.id} item={e} onDismiss={() => onDismiss(e.id)} />
            ))}
        </div>
    );
}

function ErrorToastItem({ item, onDismiss }: { item: ErrorToast; onDismiss: () => void }) {
    const [retrying, setRetrying] = React.useState(false);
    const handleRetry = async () => {
        if (!item.onRetry || retrying) return;
        setRetrying(true);
        try { await item.onRetry(); }
        finally { setRetrying(false); onDismiss(); }
    };

    const variant = item.variant ?? 'error';
    const icon = variant === 'success' ? '✓' : variant === 'info' ? 'ℹ' : '⚠️';
    const role = variant === 'error' ? 'alert' : 'status';

    return (
        <div className={`error-toast error-toast--${variant}`} role={role}>
            <span aria-hidden="true" style={{ fontSize: 16 }}>{icon}</span>
            <span className="error-toast-msg">{item.message}</span>
            {item.onRetry && (
                <button className="error-toast-retry" onClick={handleRetry} disabled={retrying}>
                    {retrying ? 'Retrying…' : 'Retry'}
                </button>
            )}
            <button className="error-toast-close" onClick={onDismiss} aria-label="Dismiss notification">×</button>
        </div>
    );
}
