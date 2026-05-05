'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useGlobalSearchSnapshot } from '../context/GlobalSearchContext';
import TopbarUserBadge from './TopbarUserBadge';

const HISTORY_KEY = 'unibox_search_history';
const HISTORY_MAX = 8;

function loadHistory(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter(s => typeof s === 'string') : [];
    } catch { return []; }
}
function saveHistory(arr: string[]) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, HISTORY_MAX))); } catch {}
}

export default function GlobalTopbar() {
    const { config } = useGlobalSearchSnapshot();
    const inputRef = useRef<HTMLInputElement>(null);
    const [history, setHistory] = useState<string[]>([]);
    const [open, setOpen] = useState(false);

    useEffect(() => { setHistory(loadHistory()); }, []);

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
        saveHistory(next);
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
        saveHistory([]);
        try { localStorage.removeItem(HISTORY_KEY); } catch {}
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

            <div className="global-topbar-slot global-topbar-right">
                <TopbarUserBadge />
            </div>
        </div>
    );
}
