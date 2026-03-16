"use client";

import React, { useState, useEffect, useRef } from 'react';

interface TopbarProps {
    searchTerm: string;
    setSearchTerm: (val: string) => void;
    onSearch: (term: string) => void;
    onClearSearch: () => void;
    searchResults?: any[];
    searchLoading?: boolean;
    onResultClick?: (result: any) => void;
    placeholder?: string;
    leftContent?: React.ReactNode;
    rightContent?: React.ReactNode;
}

export default function Topbar({
    searchTerm,
    setSearchTerm,
    onSearch,
    onClearSearch,
    searchResults = [],
    searchLoading = false,
    onResultClick,
    placeholder = "Search mail",
    leftContent,
    rightContent,
}: TopbarProps) {
    const [focused, setFocused] = useState(false);
    const [isAdvSearchOpen, setIsAdvSearchOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const advSearchRef = useRef<HTMLDivElement>(null);

    // Handle clicks outside to close live search & advanced search
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setFocused(false);
            }
            if (isAdvSearchOpen && advSearchRef.current && !advSearchRef.current.contains(e.target as Node)) {
                // If we didn't click inside the adv search, and didn't click the filter button
                const filterBtn = document.querySelector('.search-filter-btn');
                if (filterBtn && !filterBtn.contains(e.target as Node)) {
                    setIsAdvSearchOpen(false);
                }
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isAdvSearchOpen]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSearch(searchTerm);
            setFocused(false);
            setIsAdvSearchOpen(false);
        }
    };

    return (
        <header className="topbar">
            <div className="topbar-left">
                {leftContent}
            </div>

            <div className="search-bar-wrap" ref={containerRef}>
                <div className={`search-bar ${focused ? 'focused' : ''}`}>
                    <button className="icon-btn search-icon-main" onClick={() => onSearch(searchTerm)} aria-label="Search">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                        </svg>
                    </button>

                    <label htmlFor="topbar-search" className="sr-only">Search emails</label>
                    <input
                        id="topbar-search"
                        type="search"
                        placeholder={placeholder}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={() => {
                            setFocused(true);
                            setIsAdvSearchOpen(false);
                        }}
                        onKeyDown={handleKeyDown}
                        aria-label="Search mail"
                    />

                    {searchTerm && (
                        <button className="icon-btn" onClick={() => { onClearSearch(); setFocused(false); }} aria-label="Clear search">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    )}

                    <button
                        className={`icon-btn search-filter-btn ${isAdvSearchOpen ? 'active' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsAdvSearchOpen(!isAdvSearchOpen);
                            setFocused(false);
                        }}
                        title="Show search options"
                        aria-label="Search filter options"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 14V3M1 14h6M9 8h6M17 14h6" />
                        </svg>
                    </button>
                </div>

                {/* Advanced Search Popup - simplified since fields were not functional (FE-019) */}
                {isAdvSearchOpen && (
                    <div className="adv-search-popup show" ref={advSearchRef} onClick={(e) => e.stopPropagation()}>
                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Search Tips</p>
                            <p>Use keywords like <code>has:attachment</code>, <code>from:me</code>, or <code>newer_than:7d</code> in the search bar.</p>
                        </div>
                        <div className="adv-search-footer">
                            <button className="btn btn-primary" onClick={() => { onSearch(searchTerm); setIsAdvSearchOpen(false); }}>Search</button>
                        </div>
                    </div>
                )}

                {/* Live Search Popup */}
                {focused && (
                    <div className="search-popup show">
                        <div className="search-chips">
                            <button
                                className={`search-chip ${searchTerm.includes('has:attachment') ? 'active' : ''}`}
                                onClick={() => {
                                    if (!searchTerm.includes('has:attachment')) {
                                        setSearchTerm(searchTerm.trim() + ' has:attachment');
                                    }
                                }}
                            >
                                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                </svg>
                                Has attachment
                            </button>
                            <button
                                className={`search-chip ${searchTerm.includes('newer_than:7d') ? 'active' : ''}`}
                                onClick={() => {
                                    if (!searchTerm.includes('newer_than:7d')) {
                                        setSearchTerm(searchTerm.trim() + ' newer_than:7d');
                                    }
                                }}
                            >
                                Last 7 days
                            </button>
                            <button
                                className={`search-chip ${searchTerm.includes('from:me') ? 'active' : ''}`}
                                onClick={() => {
                                    if (!searchTerm.includes('from:me')) {
                                        setSearchTerm(searchTerm.trim() + ' from:me');
                                    }
                                }}
                            >
                                From me
                            </button>
                        </div>

                        {searchLoading ? (
                            <div style={{ padding: '2rem', textAlign: 'center' }}>
                                <div className="spinner spinner-sm" />
                            </div>
                        ) : searchResults.length > 0 ? (
                            <>
                                <div className="search-results-list">
                                    {searchResults.map((res, i) => (
                                        <div key={i} className="search-item" onClick={() => { onResultClick?.(res); setFocused(false); }}>
                                            <div className="search-item-icon">
                                                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                                    <polyline points="22,6 12,13 2,6" />
                                                </svg>
                                            </div>
                                            <div className="search-item-content">
                                                <div className="search-item-title-row">
                                                    <span className="search-item-title">{res.from_email?.split('<')[0].replace(/"/g, '') || 'Unknown'}</span>
                                                    {res.sent_at && (
                                                        <span className="search-item-date">
                                                            {new Date(res.sent_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="search-item-sub">{res.subject}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : searchTerm && (
                            <div className="search-item" onClick={() => { onSearch(searchTerm); setFocused(false); }}>
                                <div className="search-item-icon">
                                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                                    </svg>
                                </div>
                                <div className="search-item-content">
                                    <span className="search-item-title">Search for "{searchTerm}" anyway</span>
                                </div>
                            </div>
                        )}

                        {searchTerm && !searchLoading && (
                            <div className="search-all-btn" onClick={() => { onSearch(searchTerm); setFocused(false); }}>
                                <div className="search-item-icon" style={{ opacity: 0.7 }}>
                                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                                    </svg>
                                </div>
                                <span>All search results for "{searchTerm}"</span>
                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="press-enter-label">Press ENTER</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="topbar-right">
                {rightContent || (
                    <div className="topbar-right-default">
                        <div className="avatar-btn">A</div>
                    </div>
                )}
            </div>

            <style jsx>{`
                .topbar-right-default {
                    display: flex;
                    justify-content: flex-end;
                    align-items: center;
                    gap: 1rem;
                }
            `}</style>
        </header>
    );
}
