'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useGlobalSearchSnapshot } from '../context/GlobalSearchContext';

const HISTORY_PREFIX = 'unibox_search_history';
const LEGACY_HISTORY_KEY = 'unibox_search_history';
const HISTORY_MAX = 8;

// History is partitioned per registered page key (e.g. `/`, `/clients`,
// `/projects`) so that the dropdown only shows queries the user has run
// on the page they're currently viewing — typing "invoice" on /clients
// shouldn't surface that suggestion when they later open /campaigns.
function historyKey(pageKey: string | null): string | null {
    if (!pageKey) return null;
    return `${HISTORY_PREFIX}:${pageKey}`;
}

function loadHistory(pageKey: string | null): string[] {
    if (typeof window === 'undefined') return [];
    const key = historyKey(pageKey);
    if (!key) return [];
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter(s => typeof s === 'string') : [];
    } catch { return []; }
}
function saveHistory(pageKey: string | null, arr: string[]) {
    const key = historyKey(pageKey);
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(arr.slice(0, HISTORY_MAX))); } catch {}
}

export default function GlobalTopbar() {
    const { key: pageKey, config } = useGlobalSearchSnapshot();
    const inputRef = useRef<HTMLInputElement>(null);
    const [history, setHistory] = useState<string[]>([]);
    const [open, setOpen] = useState(false);

    // Reload history whenever the active page changes, so /clients sees
    // /clients history and /campaigns sees /campaigns history.
    useEffect(() => {
        setHistory(loadHistory(pageKey));
        // One-time migration: drop the old global key so stale cross-page
        // queries don't bleed into any single page's bucket.
        try { localStorage.removeItem(LEGACY_HISTORY_KEY); } catch {}
    }, [pageKey]);

    const active = !!config;
    const placeholder = config?.placeholder ?? 'Search…';
    const value = config?.value ?? '';

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!config) return;
        config.onChange(e.target.value);
    };

    const recordHistoryEntry = (q: string) => {
        const trimmed = q.trim();
        if (trimmed.length < 2) return;
        const next = [trimmed, ...history.filter(h => h.toLowerCase() !== trimmed.toLowerCase())].slice(0, HISTORY_MAX);
        setHistory(next);
        saveHistory(pageKey, next);
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!config) return;
        recordHistoryEntry(value);
        setOpen(false);
        config.onSubmit?.(value);
    };

    const handleClear = () => {
        if (!config) return;
        if (config.onClear) config.onClear();
        else config.onChange('');
        inputRef.current?.focus();
    };

    const handleHistoryPick = (q: string) => {
        if (!config) return;
        config.onChange(q);
        // Move picked entry to top.
        recordHistoryEntry(q);
        setOpen(false);
        config.onSubmit?.(q);
    };

    const handleHistoryClear = () => {
        setHistory([]);
        saveHistory(pageKey, []);
        const key = historyKey(pageKey);
        if (key) {
            try { localStorage.removeItem(key); } catch {}
        }
    };

    const handleFocus = () => {
        if (history.length > 0) setOpen(true);
    };
    const handleBlur = () => {
        // Delay so click on history row registers.
        setTimeout(() => setOpen(false), 150);
    };

    return (
        <div className="global-topbar" role="banner">
            <div className="global-topbar-slot global-topbar-left" />

            {/* Search is rendered only on list-heavy pages that register a
                handler via useRegisterGlobalSearch. Dashboard, Intelligence,
                Finance, Data Health, Team etc. show no search at all. */}
            {active && (
            <form className="global-search-form" onSubmit={handleSubmit} role="search">
                <div className={`global-search-bar ${active ? '' : 'is-disabled'}`}>
                    <svg
                        className="global-search-icon"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="search"
                        className="global-search-input"
                        placeholder={placeholder}
                        value={value}
                        onChange={handleChange}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        disabled={!active}
                        aria-label={placeholder}
                        autoComplete="off"
                    />
                    {value && (
                        <button
                            type="button"
                            className="global-search-clear"
                            onClick={handleClear}
                            aria-label="Clear search"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                    {open && active && history.length > 0 && (
                        <div className="global-search-history" role="listbox" onMouseDown={e => e.preventDefault()}>
                            <div className="global-search-history-head">
                                <span>Recent searches</span>
                                <button type="button" className="global-search-history-clear" onClick={handleHistoryClear}>
                                    Clear
                                </button>
                            </div>
                            {history.map((h, i) => (
                                <button
                                    type="button"
                                    key={`${h}-${i}`}
                                    className="global-search-history-item"
                                    onClick={() => handleHistoryPick(h)}
                                    role="option"
                                    aria-selected="false"
                                >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                    </svg>
                                    <span>{h}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </form>
            )}

            {/* Right slot intentionally empty — keeps the centered-search
                3-column grid balanced. The user persona lives in the sidebar
                profile pill (left rail) and the Jarvis orb sits in its own
                draggable layer above. */}
            <div className="global-topbar-slot global-topbar-right" />
        </div>
    );
}
