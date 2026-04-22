'use client';

import React, { useEffect, useRef, useSyncExternalStore } from 'react';

export interface GlobalSearchConfig {
    placeholder?: string;
    value: string;
    onChange: (val: string) => void;
    onSubmit?: (val: string) => void;
    onClear?: () => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Module-scope store. No React context — pages push into this store and
// subscribers (GlobalTopbar only) re-render via useSyncExternalStore.
//
// Why not context: pages that register a search handler would subscribe to
// the provider's value. When register() bumped state, every page that had
// called useRegisterGlobalSearch re-rendered. Their inline `onClear: () => ...`
// arrows produced fresh identities, which re-triggered the hook's effect,
// which called register() again → infinite loop ("Maximum update depth
// exceeded"). Moving the registry out of React state breaks that loop.
// ────────────────────────────────────────────────────────────────────────────

type Snapshot = {
    config: GlobalSearchConfig | null;
    version: number;
};

const registry = new Map<string, GlobalSearchConfig>();
let activeKey: string | null = null;
let snapshot: Snapshot = { config: null, version: 0 };
const listeners = new Set<() => void>();

function emit() {
    const config = activeKey ? registry.get(activeKey) ?? null : null;
    snapshot = { config, version: snapshot.version + 1 };
    listeners.forEach(l => l());
}

function subscribe(l: () => void) {
    listeners.add(l);
    return () => { listeners.delete(l); };
}

function getSnapshot() { return snapshot; }
// SSR safety: identical snapshot on the server so the first client render
// matches. Since the registry is populated via useEffect (client-only), the
// server always sees null config.
const SERVER_SNAPSHOT: Snapshot = { config: null, version: 0 };
function getServerSnapshot() { return SERVER_SNAPSHOT; }

function registerImpl(key: string, cfg: GlobalSearchConfig) {
    registry.set(key, cfg);
    activeKey = key;
    emit();
}

function unregisterImpl(key: string) {
    registry.delete(key);
    if (activeKey === key) {
        const keys = Array.from(registry.keys());
        activeKey = keys.length ? keys[keys.length - 1]! : null;
    }
    emit();
}

// ── Public hooks ────────────────────────────────────────────────────────────

export function useGlobalSearchSnapshot(): Snapshot {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Register this page's search handler with the global Topbar search bar.
 *
 * `cfg` may be recreated every render (inline object) — the hook keeps the
 * latest callbacks in a ref and only re-pushes to the store when the
 * displayed fields (placeholder, value) actually change, so new function
 * identities never cause re-renders.
 */
export function useRegisterGlobalSearch(key: string, cfg: GlobalSearchConfig | null) {
    // Always keep the freshest cfg in a ref so the wrapper below sees latest handlers.
    const cfgRef = useRef(cfg);
    cfgRef.current = cfg;

    const placeholder = cfg?.placeholder;
    const value = cfg?.value ?? '';
    const active = !!cfg;

    useEffect(() => {
        if (!active) return;
        const wrapper: GlobalSearchConfig = {
            placeholder,
            value,
            onChange: (v) => cfgRef.current?.onChange(v),
            onSubmit: (v) => cfgRef.current?.onSubmit?.(v),
            onClear: () => cfgRef.current?.onClear?.(),
        };
        registerImpl(key, wrapper);
        return () => unregisterImpl(key);
    }, [key, active, placeholder, value]);
}

// Legacy provider export so app/layout.tsx doesn't need to change. It's a
// pass-through now that the store is module-scoped.
export function GlobalSearchProvider({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
