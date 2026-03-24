'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { flushAllMailboxCaches } from '../hooks/useMailbox';
import { saveToLocalCache } from '../utils/localCache';
import { getAccountsAction } from '../../src/actions/accountActions';

interface FilterContextType {
    selectedAccountId: string; // 'ALL' or a specific ID
    setSelectedAccountId: (id: string) => void;
    startDate: string; // YYYY-MM-DD
    setStartDate: (date: string) => void;
    endDate: string; // YYYY-MM-DD
    setEndDate: (date: string) => void;
    accounts: any[];
    isLoadingAccounts: boolean;
    refreshAccounts: () => Promise<void>;
    setAccounts: (accounts: any[] | ((prev: any[]) => any[])) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();

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

    // Accounts global state — always start empty to avoid hydration mismatch
    const [accounts, setAccountsInternal] = useState<any[]>([]);
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

    const setAccounts = useCallback((newAccounts: any[] | ((prev: any[]) => any[])) => {
        setAccountsInternal(prev => {
            const next = typeof newAccounts === 'function' ? (newAccounts as any)(prev) : newAccounts;
            saveToLocalCache('accounts_data', next);
            return next;
        });
    }, []);

    const refreshAccounts = useCallback(async () => {
        setIsLoadingAccounts(true);
        try {
            const result = await getAccountsAction();
            if (result.success) {
                setAccounts(result.accounts);
            }
        } catch (err) {
            console.error('Failed to fetch accounts:', err);
        } finally {
            setIsLoadingAccounts(false);
        }
    }, [setAccounts]);

    // Fetch accounts once on mount — skip on login page
    const hasInitialized = React.useRef(false);
    React.useEffect(() => {
        if (pathname === '/login') return;
        if (hasInitialized.current) return;
        hasInitialized.current = true;
        refreshAccounts();
    }, [pathname, refreshAccounts]);

    const setSelectedAccountId = (id: string) => {
        // Flush ALL mailbox caches BEFORE updating state — no stale data survives
        flushAllMailboxCaches();
        setSelectedAccountIdState(id);
        localStorage.setItem('unibox_selected_account_id', id);
    };

    const value = useMemo(() => ({
        selectedAccountId,
        setSelectedAccountId,
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        accounts,
        isLoadingAccounts,
        refreshAccounts,
        setAccounts
    }), [selectedAccountId, startDate, endDate, accounts, isLoadingAccounts, refreshAccounts, setAccounts]);

    return (
        <FilterContext.Provider value={value}>
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
