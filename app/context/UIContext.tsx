'use client';

import React, { createContext, useContext, useState, useMemo, type ReactNode } from 'react';

interface UIContextType {
    isComposeOpen: boolean;
    setComposeOpen: (open: boolean) => void;
    composeDefaultTo: string;
    setComposeDefaultTo: (to: string) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
    const [isComposeOpen, setComposeOpen] = useState(false);
    const [composeDefaultTo, setComposeDefaultTo] = useState('');

    const value = useMemo(() => ({
        isComposeOpen,
        setComposeOpen,
        composeDefaultTo,
        setComposeDefaultTo
    }), [isComposeOpen, composeDefaultTo]);

    return (
        <UIContext.Provider value={value}>
            {children}
        </UIContext.Provider>
    );
}

export function useUI() {
    const context = useContext(UIContext);
    if (context === undefined) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return context;
}
