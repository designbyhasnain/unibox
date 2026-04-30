'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface ConfirmOptions {
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Red destructive styling on the confirm button. */
    danger?: boolean;
    /** When set, user must type this exact string before confirm enables. Use for permanent / non-recoverable actions. */
    requireType?: string;
}

interface Props extends ConfirmOptions {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Project-styled confirmation modal. Replaces native window.confirm() —
 * matches the design language of ManagePersonaModal (focus trap, Escape
 * closes, body scroll lock, role=dialog, aria-modal).
 *
 * Most call sites use the useConfirm() hook below; this component is also
 * exported directly for cases where state is already wired.
 */
export default function ConfirmModal({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    requireType,
    onConfirm,
    onCancel,
}: Props) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const cancelBtnRef = useRef<HTMLButtonElement>(null);
    const confirmBtnRef = useRef<HTMLButtonElement>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);
    const [typedValue, setTypedValue] = useState('');

    useEffect(() => {
        if (!open) {
            setTypedValue('');
            return;
        }
        previouslyFocused.current = (document.activeElement as HTMLElement) || null;
        // Lock body scroll while modal is mounted.
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // Focus the cancel button by default for destructive ops, confirm otherwise.
        const focusTarget = danger ? cancelBtnRef.current : confirmBtnRef.current;
        focusTarget?.focus();

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
                return;
            }
            if (e.key === 'Tab') {
                // Simple two-button focus trap.
                const focusables = [cancelBtnRef.current, confirmBtnRef.current].filter(Boolean) as HTMLElement[];
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
    }, [open, danger, onCancel]);

    if (!open) return null;

    const typeOk = !requireType || typedValue === requireType;

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div
                ref={dialogRef}
                className="modal-box confirm-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-modal-title"
                aria-describedby="confirm-modal-message"
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-title" id="confirm-modal-title">{title}</div>
                <div className="modal-body" id="confirm-modal-message">{message}</div>

                {requireType && (
                    <div style={{ marginTop: 14 }}>
                        <label style={{ fontSize: 12, color: 'var(--ink-muted)', display: 'block', marginBottom: 6 }}>
                            Type <code style={{ background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{requireType}</code> to confirm
                        </label>
                        <input
                            type="text"
                            value={typedValue}
                            onChange={e => setTypedValue(e.target.value)}
                            autoFocus
                            style={{
                                width: '100%', padding: '8px 10px',
                                border: '1px solid var(--hairline)', borderRadius: 6,
                                background: 'var(--surface)', color: 'var(--ink)', fontSize: 13,
                            }}
                        />
                    </div>
                )}

                <div className="modal-actions" style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                        ref={cancelBtnRef}
                        className="btn-secondary"
                        onClick={onCancel}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmBtnRef}
                        className={danger ? 'btn-danger' : 'btn-primary'}
                        onClick={typeOk ? onConfirm : undefined}
                        disabled={!typeOk}
                        aria-disabled={!typeOk}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
