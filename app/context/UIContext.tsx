'use client';

import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface UIContextType {
    isComposeOpen: boolean;
    setComposeOpen: (open: boolean) => void;
    composeDefaultTo: string;
    setComposeDefaultTo: (to: string) => void;
    composeDefaultSubject: string;
    setComposeDefaultSubject: (subject: string) => void;
    composeDefaultBody: string;
    setComposeDefaultBody: (body: string) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
    const [isComposeOpen, setComposeOpen] = useState(false);
    const [composeDefaultTo, setComposeDefaultTo] = useState('');
    const [composeDefaultSubject, setComposeDefaultSubject] = useState('');
    const [composeDefaultBody, setComposeDefaultBody] = useState('');

    return (
        <UIContext.Provider value={{
            isComposeOpen,
            setComposeOpen,
            composeDefaultTo,
            setComposeDefaultTo,
            composeDefaultSubject,
            setComposeDefaultSubject,
            composeDefaultBody,
            setComposeDefaultBody,
        }}>
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
