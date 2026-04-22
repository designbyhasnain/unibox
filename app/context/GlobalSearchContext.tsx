'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export interface GlobalSearchConfig {
    placeholder?: string;
    value: string;
    onChange: (val: string) => void;
    onSubmit?: (val: string) => void;
    onClear?: () => void;
}

interface GlobalSearchContextValue {
    config: GlobalSearchConfig | null;
    register: (key: string, config: GlobalSearchConfig) => void;
    unregister: (key: string) => void;
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

export function GlobalSearchProvider({ children }: { children: React.ReactNode }) {
    // Keyed registry lets the latest page registration win; last-in is active.
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const registryRef = useRef<Map<string, GlobalSearchConfig>>(new Map());
    const [, force] = useState(0);
    const bump = useCallback(() => force(n => n + 1), []);

    const register = useCallback((key: string, cfg: GlobalSearchConfig) => {
        registryRef.current.set(key, cfg);
        setActiveKey(key);
        bump();
    }, [bump]);

    const unregister = useCallback((key: string) => {
        registryRef.current.delete(key);
        setActiveKey(prev => {
            if (prev !== key) return prev;
            const keys = Array.from(registryRef.current.keys());
            return keys.length ? keys[keys.length - 1]! : null;
        });
        bump();
    }, [bump]);

    const config = activeKey ? registryRef.current.get(activeKey) ?? null : null;

    const value = useMemo<GlobalSearchContextValue>(() => ({ config, register, unregister }), [config, register, unregister]);

    return <GlobalSearchContext.Provider value={value}>{children}</GlobalSearchContext.Provider>;
}

export function useGlobalSearch(): GlobalSearchContextValue {
    const ctx = useContext(GlobalSearchContext);
    if (!ctx) throw new Error('useGlobalSearch must be used within GlobalSearchProvider');
    return ctx;
}

/**
 * Register this page's search handler with the global Topbar search bar.
 * Pass a stable key (e.g. the route path) so re-renders don't thrash.
 */
export function useRegisterGlobalSearch(key: string, cfg: GlobalSearchConfig | null) {
    const { register, unregister } = useGlobalSearch();
    // Re-register every time any part of cfg changes (value, handlers, placeholder).
    useEffect(() => {
        if (!cfg) return;
        register(key, cfg);
        return () => unregister(key);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, cfg?.placeholder, cfg?.value, cfg?.onChange, cfg?.onSubmit, cfg?.onClear]);
}
