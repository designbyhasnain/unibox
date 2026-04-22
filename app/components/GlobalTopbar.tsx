'use client';

import React, { useRef } from 'react';
import { useGlobalSearch } from '../context/GlobalSearchContext';

export default function GlobalTopbar() {
    const { config } = useGlobalSearch();
    const inputRef = useRef<HTMLInputElement>(null);

    const active = !!config;
    const placeholder = config?.placeholder ?? 'Search…';
    const value = config?.value ?? '';

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!config) return;
        config.onChange(e.target.value);
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!config) return;
        config.onSubmit?.(value);
    };

    const handleClear = () => {
        if (!config) return;
        if (config.onClear) config.onClear();
        else config.onChange('');
        inputRef.current?.focus();
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
                        disabled={!active}
                        aria-label={placeholder}
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
                </div>
            </form>

            <div className="global-topbar-slot global-topbar-right" />
        </div>
    );
}
