'use client';

import React, { lazy, Suspense } from 'react';

const LazyBarChart = lazy(() => import('./ABTestingChart'));

type VariantItem = {
    id: string;
    label: string;
    subject: string;
    totalSent: number;
    opens: number;
    replies: number;
    openRate: number;
    replyRate: number;
    isWinner: boolean;
};

type StepVariantData = {
    stepNumber: number;
    stepSubject: string;
    variants: VariantItem[];
};

interface ABTestingAnalyticsProps {
    data: StepVariantData[];
    isLoading: boolean;
}

export default function ABTestingAnalytics({ data, isLoading }: ABTestingAnalyticsProps) {
    if (isLoading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[1, 2].map(i => (
                    <div key={i} className="skeleton-box" style={{ height: '180px', borderRadius: 'var(--radius-sm)' }} />
                ))}
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div style={{
                textAlign: 'center', padding: '3rem 2rem',
                color: 'var(--text-secondary)', fontSize: 'var(--text-sm)',
            }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.75rem', opacity: 0.5 }}>
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
                <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Not enough data yet</p>
                <p>Campaign needs to run first to collect A/B testing results.</p>
            </div>
        );
    }

    // Only show steps that have multiple variants (actual A/B tests)
    const abSteps = data.filter(s => s.variants.length > 1);
    if (abSteps.length === 0) {
        return (
            <div style={{
                textAlign: 'center', padding: '2rem',
                color: 'var(--text-secondary)', fontSize: 'var(--text-sm)',
            }}>
                No A/B tests configured in this campaign.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {abSteps.map(step => (
                <div key={step.stepNumber} style={{
                    background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)', padding: '1.25rem',
                }}>
                    {/* Step Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <span style={{
                            fontWeight: 700, fontSize: 'var(--text-xs)',
                            padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-full)',
                            background: 'var(--accent-light)', color: 'var(--accent)',
                        }}>
                            Step {step.stepNumber}
                        </span>
                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)' }}>
                            A/B Test Results
                        </span>
                    </div>

                    {/* Variant Comparison Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${step.variants.length}, 1fr)`, gap: '0.75rem', marginBottom: '1rem' }}>
                        {step.variants.map((variant, vi) => (
                            <div key={variant.id} style={{
                                padding: '0.875rem',
                                borderRadius: 'var(--radius-xs)',
                                border: `1.5px solid ${variant.isWinner ? '#137333' : 'var(--border)'}`,
                                background: variant.isWinner ? '#e6f4ea' : 'var(--bg-base)',
                                position: 'relative',
                            }}>
                                {/* Winner badge */}
                                {variant.isWinner && (
                                    <span style={{
                                        position: 'absolute', top: '-8px', right: '8px',
                                        fontSize: '10px', fontWeight: 700, padding: '0.125rem 0.5rem',
                                        borderRadius: 'var(--radius-full)',
                                        background: '#137333', color: '#fff',
                                    }}>
                                        Winner
                                    </span>
                                )}

                                <div style={{
                                    fontSize: 'var(--text-xs)', fontWeight: 600,
                                    color: vi === 0 ? 'var(--accent)' : 'var(--success)',
                                    marginBottom: '0.5rem',
                                }}>
                                    {variant.label}
                                </div>

                                <div style={{
                                    fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                                    marginBottom: '0.75rem',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                    Subject: {variant.subject}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                    <div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Sent</div>
                                        <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {variant.totalSent}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Open Rate</div>
                                        <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: variant.openRate > 30 ? '#137333' : 'var(--text-primary)' }}>
                                            {variant.openRate}%
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Reply Rate</div>
                                        <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: variant.replyRate > 10 ? '#137333' : 'var(--text-primary)' }}>
                                            {variant.replyRate}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Chart */}
                    <Suspense fallback={<div style={{ height: '200px' }} className="skeleton-box" />}>
                        <LazyBarChart variants={step.variants} />
                    </Suspense>
                </div>
            ))}
        </div>
    );
}
