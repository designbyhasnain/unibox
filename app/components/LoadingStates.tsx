'use client'

import React, { useState, useEffect } from 'react';

const LOADING_MESSAGES: Record<string, string[]> = {
    inbox: [
        'Checking your inbox...',
        'Scanning for new replies...',
        'Sorting the gold from the noise...',
        'Loading conversations...',
        'Hunting for hot leads...',
    ],
    sent: [
        'Pulling your sent emails...',
        'Counting follow-ups...',
        'Loading outreach history...',
    ],
    clients: [
        'Rounding up your clients...',
        'Loading the talent roster...',
        'Fetching videographer profiles...',
        'Pulling client data...',
        'Who\'s ready to close today?',
    ],
    dashboard: [
        'Crunching your numbers...',
        'Tallying up the wins...',
        'Loading your scoreboard...',
        'How many deals this week?',
        'Counting revenue...',
    ],
    campaigns: [
        'Loading your campaigns...',
        'Checking send queues...',
        'How\'s "Love your Films" doing?',
        'Pulling campaign stats...',
    ],
    analytics: [
        'Building your charts...',
        'Analyzing open rates...',
        'Calculating reply rates...',
        'Visualizing the funnel...',
        'Number crunching time...',
    ],
    accounts: [
        'Checking email accounts...',
        'Pinging Gmail servers...',
        'Loading account health...',
        'Are all accounts warmed up?',
    ],
    templates: [
        'Loading your templates...',
        'Pulling proven winners...',
        '"Hey {Name}, Love your Films!"',
        'Loading email blueprints...',
    ],
    team: [
        'Loading the squad...',
        'Checking team assignments...',
        'Who\'s crushing it today?',
        'Pulling agent stats...',
    ],
    projects: [
        'Loading edit projects...',
        'Checking delivery deadlines...',
        'What\'s rendering today?',
        'Pulling project timelines...',
    ],
    opportunities: [
        'Loading the pipeline...',
        'Where are the hot deals?',
        'Scanning for closeable leads...',
        'Loading opportunity board...',
    ],
    settings: [
        'Loading preferences...',
        'Pulling your settings...',
    ],
    'data-health': [
        'Scanning database integrity...',
        'Checking Gmail sync status...',
        'Counting orphans and strays...',
        'How healthy is the pipeline?',
    ],
    default: [
        'Loading...',
        'Almost there...',
        'Getting things ready...',
        'One moment...',
    ],
};

export function LoadingText({ context = 'default' }: { context?: string }) {
    const [messageIndex, setMessageIndex] = useState(0);
    const messages = LOADING_MESSAGES[context] ?? LOADING_MESSAGES['default']!;

    useEffect(() => {
        const initial = Math.floor(Math.random() * messages.length);
        setMessageIndex(initial);

        const interval = setInterval(() => {
            setMessageIndex(prev => (prev + 1) % messages.length);
        }, 2400);
        return () => clearInterval(interval);
    }, [messages.length]);

    return (
        <div className="loading-text-container">
            <div className="loading-text-dot" />
            <span className="loading-text-message" key={messageIndex}>
                {messages[messageIndex]}
            </span>
        </div>
    );
}

export function Skeleton({ className, style }: { className?: string, style?: React.CSSProperties }) {
    return <div className={`skeleton-box shimmer ${className || ''}`} style={style} />;
}

export function SkeletonEmailRow({ index = 0 }: { index?: number }) {
    return (
        <div className="skeleton-row-stagger" style={{ animationDelay: `${index * 30}ms` }}>
            <div className="skeleton-row gmail-email-row" style={{ borderBottom: '1px solid var(--border-subtle)', height: '48px', alignItems: 'center', display: 'flex', padding: '0 1.25rem', gap: '1rem' }}>
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
        </div>
    );
}

export function SkeletonCard({ index = 0 }: { index?: number }) {
    return (
        <div className="skeleton-card skeleton-row-stagger" style={{ animationDelay: `${index * 40}ms`, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
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

export function SkeletonStatCard({ index = 0 }: { index?: number }) {
    return (
        <div className="skeleton-row-stagger" style={{ animationDelay: `${index * 50}ms`, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
            <Skeleton style={{ width: '40%', height: '12px', marginBottom: '12px' }} />
            <Skeleton style={{ width: '60%', height: '24px', marginBottom: '8px' }} />
            <Skeleton style={{ width: '30%', height: '10px', opacity: 0.5 }} />
        </div>
    );
}

export function SkeletonTableRow({ index = 0 }: { index?: number }) {
    return (
        <div className="skeleton-row-stagger" style={{ animationDelay: `${index * 30}ms`, display: 'flex', alignItems: 'center', gap: '1rem', padding: '12px 1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <Skeleton style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0 }} />
            <Skeleton style={{ width: '25%', height: '14px' }} />
            <Skeleton style={{ width: '20%', height: '14px', opacity: 0.6 }} />
            <Skeleton style={{ width: '15%', height: '14px', opacity: 0.4 }} />
            <Skeleton style={{ width: '80px', height: '24px', borderRadius: '6px', marginLeft: 'auto' }} />
        </div>
    );
}

export function SkeletonChartCard({ index = 0 }: { index?: number }) {
    return (
        <div className="skeleton-row-stagger" style={{ animationDelay: `${index * 60}ms`, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
            <Skeleton style={{ width: '30%', height: '16px', marginBottom: '1.5rem' }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '120px' }}>
                {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} style={{ flex: 1, height: `${30 + Math.random() * 70}%`, borderRadius: '4px 4px 0 0' }} />
                ))}
            </div>
        </div>
    );
}

export function PageLoader({
    isLoading,
    type = 'list',
    count = 10,
    context,
    children
}: {
    isLoading: boolean;
    type?: 'list' | 'grid' | 'table' | 'stats' | 'charts';
    count?: number;
    context?: string;
    children?: React.ReactNode
}) {
    if (!isLoading) return <div className="content-loaded">{children}</div>;

    return (
        <div style={{ width: '100%', flex: 1, overflow: 'hidden' }}>
            {context && (
                <div style={{ padding: '1.25rem 1.5rem 0.5rem' }}>
                    <LoadingText context={context} />
                </div>
            )}
            {type === 'list' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {Array.from({ length: Math.max(8, count) }).map((_, i) => (
                        <SkeletonEmailRow key={i} index={i} />
                    ))}
                </div>
            )}
            {type === 'grid' && (
                <div style={{ padding: '1rem 2rem 2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', overflow: 'hidden' }}>
                    {Array.from({ length: count }).map((_, i) => (
                        <SkeletonCard key={i} index={i} />
                    ))}
                </div>
            )}
            {type === 'table' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {Array.from({ length: count }).map((_, i) => (
                        <SkeletonTableRow key={i} index={i} />
                    ))}
                </div>
            )}
            {type === 'stats' && (
                <div style={{ padding: '1rem 2rem 2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                    {Array.from({ length: count }).map((_, i) => (
                        <SkeletonStatCard key={i} index={i} />
                    ))}
                </div>
            )}
            {type === 'charts' && (
                <div style={{ padding: '1rem 2rem 2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
                    {Array.from({ length: count }).map((_, i) => (
                        <SkeletonChartCard key={i} index={i} />
                    ))}
                </div>
            )}
        </div>
    );
}
