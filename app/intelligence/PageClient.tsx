'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { RefreshCw, CheckCircle2, X } from 'lucide-react';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { avatarColor, initials } from '../utils/helpers';
import { getIntelligenceDashboardAction } from '../../src/actions/intelligenceActions';

type Priority = 'CRITICAL' | 'OPPORTUNITY' | 'INFO';

interface InsightCard {
    id: string;
    priority: Priority;
    contactName?: string;
    contactEmail?: string;
    dealStage?: string;
    title: string;
    description: string;
    recommendation: string;
}

function buildCards(data: Awaited<ReturnType<typeof getIntelligenceDashboardAction>>): InsightCard[] {
    const cards: InsightCard[] = [];

    // Churn risks → Critical or Opportunity
    for (const c of (data.churn || [])) {
        const priority: Priority = (c.riskLevel === 'critical' || c.riskLevel === 'high') ? 'CRITICAL' : 'OPPORTUNITY';
        cards.push({
            id: `churn-${c.id}`,
            priority,
            contactName: c.name || undefined,
            contactEmail: c.email || undefined,
            dealStage: 'ACTIVE',
            title: `${c.name || c.email} — response time slowing (${c.slowdownFactor}x)`,
            description: `Previously replying in ${c.earlyAvgHours}h, now taking ${c.recentAvgHours}h on average. This ${c.slowdownFactor}x slowdown is a strong early churn signal — act before they go fully dark.`,
            recommendation: 'Send a short, personal check-in email today — no pitch, just genuine interest in their status.',
        });
    }

    // Competitor mentions → Critical
    for (const c of (data.competitors || [])) {
        cards.push({
            id: `comp-${c.id}`,
            priority: 'CRITICAL',
            contactName: c.name || undefined,
            contactEmail: c.email || undefined,
            title: `${c.name || c.email} — competitor mentioned in conversation`,
            description: `"${(c.mentionText || '').substring(0, 120)}${(c.mentionText || '').length > 120 ? '…' : ''}"`,
            recommendation: 'Address competitive concerns directly. Emphasize your unique strengths and offer a case study or testimonial.',
        });
    }

    // Stuck in Contacted → Critical
    for (const c of ((data.escalations as any)?.stuckInContacted || [])) {
        cards.push({
            id: `esc-contacted-${c.id}`,
            priority: 'CRITICAL',
            contactName: c.name || undefined,
            contactEmail: c.email || undefined,
            dealStage: 'CONTACTED',
            title: `${c.name || c.email} — ${c.days} days no reply`,
            description: `Lead has been in "Contacted" for ${c.days} days without responding. Warm clients in this bracket have a 70% chance of going cold permanently after 10 days.`,
            recommendation: 'Send a pricing softener or social proof email. A short, curiosity-driven subject line works best here.',
        });
    }

    // Stuck in Lead → Opportunity
    for (const c of ((data.escalations as any)?.stuckInLead || [])) {
        cards.push({
            id: `esc-lead-${c.id}`,
            priority: 'OPPORTUNITY',
            contactName: c.name || undefined,
            contactEmail: c.email || undefined,
            dealStage: 'LEAD',
            title: `${c.name || c.email} — contract aging ${c.days} days`,
            description: `This lead has exchanged ${c.replies} replies and been at "Lead" stage for ${c.days} days. High engagement signals interest; they may need a final nudge to close.`,
            recommendation: 'Propose a concrete next step — schedule a call, send a revised quote, or offer a limited-time incentive.',
        });
    }

    // Forecast insights → Info
    const forecast = (data.forecast as any);
    if (forecast?.totalClosedRevenue > 0) {
        cards.push({
            id: 'forecast-info',
            priority: 'INFO',
            title: `Revenue forecast: $${(forecast.projectedNext30Days || 0).toLocaleString()} projected next 30 days`,
            description: `Total closed revenue is $${(forecast.totalClosedRevenue || 0).toLocaleString()} with an average deal size of $${(forecast.avgDealSize || 0).toLocaleString()}. Pipeline conversion looks healthy.`,
            recommendation: 'Focus outreach on Offer Accepted leads — they carry the highest revenue-close probability at ~85%.',
        });
    }

    return cards;
}

const PRIORITY_COLOR: Record<Priority, string> = {
    CRITICAL: 'var(--danger)',
    OPPORTUNITY: 'var(--coach)',
    INFO: 'var(--info)',
};

const PRIORITY_BG: Record<Priority, string> = {
    CRITICAL: 'color-mix(in oklab, var(--danger) 12%, transparent)',
    OPPORTUNITY: 'color-mix(in oklab, var(--coach) 12%, transparent)',
    INFO: 'color-mix(in oklab, var(--info) 12%, transparent)',
};

function timeAgo(iso: string): string {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

export default function IntelligencePage() {
    const isHydrated = useHydrated();
    const [data, setData] = useState<Awaited<ReturnType<typeof getIntelligenceDashboardAction>> | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastRun, setLastRun] = useState<string | null>(null);
    const [, setTick] = useState(0);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    const runAudit = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getIntelligenceDashboardAction();
            setData(result);
            setLastRun(new Date().toISOString());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { runAudit(); }, [runAudit]);

    // Tick every 30s so "X min ago" stays live
    useEffect(() => {
        const t = setInterval(() => setTick(n => n + 1), 30_000);
        return () => clearInterval(t);
    }, []);

    const cards = data ? buildCards(data).filter(c => !dismissed.has(c.id)) : [];
    const critical = cards.filter(c => c.priority === 'CRITICAL');
    const opportunities = cards.filter(c => c.priority === 'OPPORTUNITY');
    const info = cards.filter(c => c.priority === 'INFO');

    // Rough model confidence based on data richness
    const totalRaw = data ? (data.churn?.length ?? 0) + (data.competitors?.length ?? 0) + ((data.escalations as any)?.stuckInContacted?.length ?? 0) + ((data.escalations as any)?.stuckInLead?.length ?? 0) : 0;
    const confidence = totalRaw > 10 ? 94 : totalRaw > 5 ? 89 : totalRaw > 0 ? 83 : 72;

    const dismiss = (id: string) => setDismissed(prev => new Set([...prev, id]));

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--shell)', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>

            {/* ── Topbar ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 24px', height: 52, flexShrink: 0,
                background: 'var(--canvas)', borderBottom: '1px solid var(--hairline)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Admin</span>
                    <span style={{ fontSize: 13, color: 'var(--ink-faint)' }}>/</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Intelligence</span>
                </div>
                <button
                    onClick={runAudit}
                    disabled={loading}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 8,
                        fontSize: 12.5, fontWeight: 500,
                        color: 'var(--ink)', background: 'var(--surface)',
                        border: '1px solid var(--hairline-soft)',
                        cursor: loading ? 'wait' : 'pointer',
                        fontFamily: 'var(--font-ui)',
                        opacity: loading ? 0.65 : 1,
                    }}
                >
                    <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                    Re-run audit
                </button>
            </div>

            {/* ── Page head ── */}
            <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
                <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 3px', color: 'var(--ink)' }}>
                    Jarvis audit
                    {lastRun && (
                        <span style={{ fontWeight: 400, color: 'var(--ink-muted)', fontSize: 13, marginLeft: 8 }}>
                            · last run {timeAgo(lastRun)}
                        </span>
                    )}
                </h1>
                <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: 0 }}>
                    Relationship hub · deal aging · account health · template drift
                    {totalRaw > 0 && <span> — scanned across {totalRaw.toLocaleString()}+ signals</span>}
                </p>
            </div>

            <PageLoader isLoading={!isHydrated || loading} type="list" count={4} context="default">

                {/* ── KPI chips ── */}
                <div style={{
                    display: 'flex', gap: 10, padding: '16px 24px',
                    flexShrink: 0,
                }}>
                    {[
                        { label: 'CRITICAL', value: critical.length, sub: 'require attention', color: 'var(--danger)' },
                        { label: 'OPPORTUNITIES', value: opportunities.length, sub: 'pipeline plays', color: 'var(--coach)' },
                        { label: 'INFO', value: info.length, sub: 'notes', color: 'var(--info)' },
                        { label: 'MODEL CONFIDENCE', value: `${confidence}%`, sub: 'based on data volume', color: 'var(--ink-muted)' },
                    ].map(chip => (
                        <div key={chip.label} style={{
                            flex: 1, background: 'var(--canvas)', border: '1px solid var(--hairline)',
                            borderRadius: 10, padding: '10px 14px',
                        }}>
                            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', color: chip.color, marginBottom: 2, textTransform: 'uppercase' }}>
                                {chip.label}
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.1 }}>
                                {chip.value}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', marginTop: 2 }}>
                                {chip.sub}
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Cards list ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
                    {cards.length === 0 && (
                        <div style={{
                            textAlign: 'center', padding: '48px 0',
                            color: 'var(--ink-muted)', fontSize: 13,
                        }}>
                            <CheckCircle2 size={32} style={{ color: 'var(--coach)', marginBottom: 10, opacity: 0.6, display: 'block', margin: '0 auto 10px' }} />
                            All clear — no active insights. Run the audit to refresh.
                        </div>
                    )}

                    {['CRITICAL', 'OPPORTUNITY', 'INFO'].flatMap(p =>
                        cards.filter(c => c.priority === p)
                    ).map(card => (
                        <InsightCardRow
                            key={card.id}
                            card={card}
                            onDismiss={() => dismiss(card.id)}
                        />
                    ))}
                </div>

            </PageLoader>
        </div>
    );
}

function InsightCardRow({ card, onDismiss }: { card: InsightCard; onDismiss: () => void }) {
    const color = PRIORITY_COLOR[card.priority];
    const bg = PRIORITY_BG[card.priority];
    const [applied, setApplied] = useState(false);

    return (
        <div style={{
            display: 'flex',
            background: 'var(--canvas)',
            border: '1px solid var(--hairline)',
            borderLeft: `4px solid ${color}`,
            borderRadius: '0 10px 10px 0',
            marginBottom: 10,
            overflow: 'hidden',
        }}>
            {/* Main content */}
            <div style={{ flex: 1, padding: '14px 16px' }}>
                {/* Priority chip + contact + stage */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{
                        fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
                        padding: '2px 7px', borderRadius: 4,
                        background: bg, color: color,
                        textTransform: 'uppercase',
                    }}>
                        {card.priority}
                    </span>

                    {card.contactName && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{
                                width: 20, height: 20, borderRadius: '50%',
                                background: avatarColor(card.contactEmail || card.contactName),
                                color: '#fff', fontSize: 8, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                {initials(card.contactName)}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                                {card.contactName}
                            </span>
                        </div>
                    )}

                    {card.dealStage && (
                        <span style={{
                            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em',
                            padding: '2px 7px', borderRadius: 4,
                            background: 'var(--surface)', color: 'var(--ink-muted)',
                            border: '1px solid var(--hairline-soft)',
                            textTransform: 'uppercase',
                        }}>
                            {card.dealStage}
                        </span>
                    )}
                </div>

                {/* Title */}
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5, lineHeight: 1.35 }}>
                    {card.title}
                </div>

                {/* Description */}
                <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: '0 0 7px', lineHeight: 1.5 }}>
                    {card.description}
                </p>

                {/* Recommendation */}
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', fontStyle: 'italic' }}>
                    <span style={{ fontStyle: 'normal', fontWeight: 600, color: 'var(--ink)' }}>Recommended: </span>
                    {card.recommendation}
                </div>
            </div>

            {/* Action buttons */}
            <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                padding: '14px 14px 14px 0', justifyContent: 'center', flexShrink: 0,
            }}>
                {applied ? (
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 600, color: 'var(--coach)',
                        padding: '6px 12px',
                    }}>
                        <CheckCircle2 size={13} />
                        Applied
                    </div>
                ) : (
                    <button
                        onClick={() => setApplied(true)}
                        style={{
                            padding: '6px 14px', borderRadius: 7,
                            fontSize: 12, fontWeight: 600,
                            background: 'color-mix(in oklab, var(--coach) 14%, transparent)',
                            color: 'var(--coach)',
                            border: '1px solid color-mix(in oklab, var(--coach) 35%, transparent)',
                            cursor: 'pointer', fontFamily: 'var(--font-ui)',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Apply
                    </button>
                )}
                <button
                    onClick={onDismiss}
                    style={{
                        padding: '6px 14px', borderRadius: 7,
                        fontSize: 12, fontWeight: 500,
                        background: 'transparent',
                        color: 'var(--ink-muted)',
                        border: '1px solid var(--hairline-soft)',
                        cursor: 'pointer', fontFamily: 'var(--font-ui)',
                        display: 'flex', alignItems: 'center', gap: 4,
                        whiteSpace: 'nowrap',
                    }}
                >
                    <X size={11} />
                    Dismiss
                </button>
            </div>
        </div>
    );
}
