'use client';

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface FilterContextType {
    selectedAccountId: string; // 'ALL' or a specific ID
    setSelectedAccountId: (id: string) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ children }: { children: ReactNode }) {
    const [selectedAccountId, setSelectedAccountIdState] = useState<string>('ALL');

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('unibox_selected_account_id');
        if (saved) {
            setSelectedAccountIdState(saved);
        }
    }, []);

    const setSelectedAccountId = (id: string) => {
        setSelectedAccountIdState(id);
        localStorage.setItem('unibox_selected_account_id', id);
    };

    return (
        <FilterContext.Provider value={{ selectedAccountId, setSelectedAccountId }}>
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
