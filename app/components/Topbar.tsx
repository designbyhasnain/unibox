"use client";

import React from 'react';

interface TopbarProps {
    // Legacy search props — preserved for back-compat so existing callers
    // don't break. Search is now handled by <GlobalTopbar /> in ClientLayout;
    // pages should register their search handler via useRegisterGlobalSearch.
    searchTerm?: string;
    setSearchTerm?: (val: string) => void;
    onSearch?: (term: string) => void;
    onClearSearch?: () => void;
    searchResults?: any[];
    searchLoading?: boolean;
    onResultClick?: (result: any) => void;
    placeholder?: string;

    leftContent?: React.ReactNode;
    rightContent?: React.ReactNode;
}

export default function Topbar({
    leftContent,
    rightContent,
}: TopbarProps) {
    return (
        <header className="topbar topbar--no-search">
            <div className="topbar-left">
                {leftContent}
            </div>

            <div className="topbar-spacer" />

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
                .topbar-spacer {
                    flex: 1;
                }
            `}</style>
        </header>
    );
}
