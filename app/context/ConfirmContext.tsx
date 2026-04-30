'use client';

import React, { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import ConfirmModal, { type ConfirmOptions } from '../components/ConfirmModal';

interface ConfirmContextType {
    /** Returns true if the user confirmed, false if they cancelled or pressed Escape. */
    confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

interface PendingConfirm extends ConfirmOptions {
    resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [pending, setPending] = useState<PendingConfirm | null>(null);

    const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            setPending({ ...opts, resolve });
        });
    }, []);

    const handleConfirm = () => {
        pending?.resolve(true);
        setPending(null);
    };
    const handleCancel = () => {
        pending?.resolve(false);
        setPending(null);
    };

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {pending && (
                <ConfirmModal
                    open
                    title={pending.title}
                    message={pending.message}
                    confirmLabel={pending.confirmLabel}
                    cancelLabel={pending.cancelLabel}
                    danger={pending.danger}
                    requireType={pending.requireType}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                />
            )}
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
    return ctx.confirm;
}
