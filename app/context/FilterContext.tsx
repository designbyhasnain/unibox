'use client';

import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { flushAllMailboxCaches } from '../hooks/useMailbox';

interface FilterContextType {
    selectedAccountId: string; // 'ALL' or a specific ID
    setSelectedAccountId: (id: string) => void;
    startDate: string; // YYYY-MM-DD
    setStartDate: (date: string) => void;
    endDate: string; // YYYY-MM-DD
    setEndDate: (date: string) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ children }: { children: ReactNode }) {
    // Initialize directly from localStorage to eliminate double-render on mount
    const [selectedAccountId, setSelectedAccountIdState] = useState<string>(() => {
        if (typeof window === 'undefined') return 'ALL';
        try {
            const saved = localStorage.getItem('unibox_selected_account_id');
            return (saved && saved !== 'ALL') ? saved : 'ALL';
        } catch {
            return 'ALL';
        }
    });

    // Date range filter
    const [startDate, setStartDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0] as string;
    });
    const [endDate, setEndDate] = useState<string>(() => {
        return new Date().toISOString().split('T')[0] as string;
    });

    const setSelectedAccountId = (id: string) => {
        // Flush ALL mailbox caches BEFORE updating state — no stale data survives
        flushAllMailboxCaches();
        setSelectedAccountIdState(id);
        localStorage.setItem('unibox_selected_account_id', id);
    };

    return (
        <FilterContext.Provider value={{ 
            selectedAccountId, 
            setSelectedAccountId,
            startDate,
            setStartDate,
            endDate,
            setEndDate
        }}>
            {children}
        </FilterContext.Provider>
    );
}

export function useGlobalFilter() {
    const context = useContext(FilterContext);
    if (context === undefined) {
        throw new Error('useGlobalFilter must be used within a FilterProvider');
    }
    return context;
}
