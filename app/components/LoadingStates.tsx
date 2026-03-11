'use client'

import React from 'react';

/**
 * A generic skeleton box that can be shaped into anything
 * Shimmer animation is handled in CSS
 */
export function Skeleton({ className, style }: { className?: string, style?: React.CSSProperties }) {
    return <div className={`skeleton-box shimmer ${className || ''}`} style={style} />;
}

/**
 * Standard Email Row Skeleton (Gmail Style)
 * Matches .gmail-email-row structure
 */
export function SkeletonEmailRow() {
    return (
        <div className="skeleton-row gmail-email-row" style={{ borderBottom: '1px solid var(--border-subtle)', height: '48px', alignItems: 'center', display: 'flex', padding: '0 1.25rem', gap: '1rem', opacity: 0.7 }}>
            <Skeleton style={{ width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0 }} />
            <Skeleton style={{ width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0 }} />
            <Skeleton style={{ width: '180px', height: '14px', borderRadius: '4px' }} />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Skeleton style={{ width: '40%', height: '14px', borderRadius: '4px' }} />
                <Skeleton style={{ width: '100px', height: '14px', borderRadius: '4px', opacity: 0.4 }} />
            </div>
            <Skeleton style={{ width: '120px', height: '14px', borderRadius: '40px', flexShrink: 0, opacity: 0.5 }} />
            <Skeleton style={{ width: '60px', height: '14px', borderRadius: '4px', marginLeft: 'auto', flexShrink: 0 }} />
        </div>
    );
}

/**
 * Standard Card Skeleton (for Accounts, Clients, etc.)
 */
export function SkeletonCard() {
    return (
        <div className="skeleton-card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Skeleton className="skeleton-circle" style={{ width: '48px', height: '48px', borderRadius: '12px' }} />
                <div style={{ flex: 1 }}>
                    <Skeleton style={{ width: '60%', height: '14px', marginBottom: '8px' }} />
                    <Skeleton style={{ width: '30%', height: '10px' }} />
                </div>
            </div>
            <Skeleton style={{ width: '100%', height: '32px', marginTop: '1.25rem', borderRadius: '8px', opacity: 0.6 }} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '0.75rem' }}>
                <Skeleton style={{ width: '70px', height: '24px', borderRadius: '6px' }} />
                <Skeleton style={{ width: '70px', height: '24px', borderRadius: '6px' }} />
            </div>
        </div>
    );
}

/**
 * Page Loader Wrapper
 */
export function PageLoader({
    isLoading,
    type = 'list',
    count = 10,
    children
}: {
    isLoading: boolean;
    type?: 'list' | 'grid' | 'table';
    count?: number;
    children: React.ReactNode
}) {
    // Show content immediately if not loading
    if (!isLoading) return <>{children}</>;

    return (
        <div className="animate-fade-in" style={{ width: '100%', flex: 1, overflow: 'hidden' }}>
            {type === 'list' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {Array.from({ length: Math.max(8, count) }).map((_, i) => (
                        <SkeletonEmailRow key={i} />
                    ))}
                </div>
            )}
            {type === 'grid' && (
                <div style={{
                    padding: '2rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '1.5rem',
                    overflow: 'hidden'
                }}>
                    {Array.from({ length: count }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            )}
        </div>
    );
}
