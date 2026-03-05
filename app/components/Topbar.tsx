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
    rightContent
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
                    <button className="icon-btn search-icon-main" onClick={() => onSearch(searchTerm)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                        </svg>
                    </button>

                    <input
                        type="text"
                        placeholder={placeholder}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={() => {
                            setFocused(true);
                            setIsAdvSearchOpen(false);
                        }}
                        onKeyDown={handleKeyDown}
                    />

                    {searchTerm && (
                        <button className="icon-btn" onClick={() => { onClearSearch(); setFocused(false); }}>
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
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 14V3M1 14h6M9 8h6M17 14h6" />
                        </svg>
                    </button>
                </div>

                {/* Advanced Search Popup */}
                {isAdvSearchOpen && (
                    <div className="adv-search-popup show" ref={advSearchRef} onClick={(e) => e.stopPropagation()}>
                        <div className="adv-search-row">
                            <div className="adv-label">From</div>
                            <input type="text" className="adv-input" placeholder="" />
                        </div>
                        <div className="adv-search-row">
                            <div className="adv-label">To</div>
                            <input type="text" className="adv-input" />
                        </div>
                        <div className="adv-search-row">
                            <div className="adv-label">Subject</div>
                            <input type="text" className="adv-input" />
                        </div>
                        <div className="adv-search-row">
                            <div className="adv-label">Has the words</div>
                            <input type="text" className="adv-input" />
                        </div>
                        <div className="adv-search-row">
                            <div className="adv-label">Doesn't have</div>
                            <input type="text" className="adv-input" />
                        </div>
                        <div className="adv-search-row" style={{ marginTop: '0.5rem' }}>
                            <div className="adv-label">Size</div>
                            <div style={{ display: 'flex', gap: '0.5rem', flex: 1, alignItems: 'center' }}>
                                <select className="adv-select" style={{ width: '100px' }}>
                                    <option>greater than</option>
                                    <option>less than</option>
                                </select>
                                <input type="text" className="adv-input" style={{ width: '80px' }} placeholder="0" />
                                <select className="adv-select" style={{ width: '60px' }}>
                                    <option>MB</option>
                                    <option>KB</option>
                                    <option>Bytes</option>
                                </select>
                            </div>
                        </div>

                        <div className="adv-search-footer">
                            <button className="adv-footer-btn" onClick={() => setIsAdvSearchOpen(false)}>Create filter</button>
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
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
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
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <div className="avatar-btn">A</div>
                    </div>
                )}
            </div>
        </header>
    );
}
