'use client';

import React from 'react';
import Topbar from '../components/Topbar';
import { getIntelligenceDashboardAction } from '../../src/actions/intelligenceActions';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { avatarColor, initials } from '../utils/helpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSWRData } from '../utils/staleWhileRevalidate';

export default function IntelligencePage() {
    const isHydrated = useHydrated();
    const { data, isLoading, isStale, refresh: loadData } = useSWRData(
        'intelligence',
        () => getIntelligenceDashboardAction()
    );

    const fmt = (v: number) => '$' + (v || 0).toLocaleString();
    const riskColors: Record<string, string> = { critical: '#EF4444', high: '#F59E0B', medium: '#3B82F6', low: '#10B981' };

    return (
        <div className="mailbox-wrapper">
            <div className="mailbox-main">
                <Topbar searchTerm="" setSearchTerm={() => {}} placeholder="Intelligence"
                    onSearch={() => {}} onClearSearch={() => {}}
                    leftContent={<h1 className="clients-page-title">Sales Intelligence</h1>}
                    rightContent={<button className="btn btn-secondary sm" onClick={loadData}>Refresh</button>}
                />

                <div className="content-split content-split-bg">
                    <div className="list-panel list-panel-flex" style={{ padding: '1.5rem', overflowY: 'auto' }}>
                        <PageLoader isLoading={!isHydrated || isLoading} type="list" count={6}>
                            {data && (
                                <>
                                    {/* Revenue Forecast */}
                                    {data.forecast && (
                                        <div style={{ marginBottom: 24 }}>
                                            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Revenue Forecast</h3>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                                                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)' }}>
                                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Projected (30 days)</div>
                                                    <div style={{ fontSize: 28, fontWeight: 700, color: '#10B981' }}>{fmt(data.forecast.projectedNext30Days)}</div>
                                                </div>
                                                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)' }}>
                                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Total Closed Revenue</div>
                                                    <div style={{ fontSize: 28, fontWeight: 700, color: '#1a73e8' }}>{fmt(data.forecast.totalClosedRevenue)}</div>
                                                </div>
                                                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)' }}>
                                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Avg Deal Size</div>
                                                    <div style={{ fontSize: 28, fontWeight: 700, color: '#8B5CF6' }}>{fmt(data.forecast.avgDealSize)}</div>
                                                </div>
                                            </div>

                                            {/* Pipeline Breakdown */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                                                {[
                                                    { label: 'Offer Accepted', data: data.forecast.pipelineValue?.offerAccepted, color: '#10B981', rate: '85%' },
                                                    { label: 'Leads', data: data.forecast.pipelineValue?.lead, color: '#F59E0B', rate: `${data.forecast.historicalConversion?.leadToClose || 0}%` },
                                                    { label: 'Warm Leads', data: data.forecast.pipelineValue?.warmLead, color: '#F97316', rate: '~10%' },
                                                    { label: 'Contacted', data: data.forecast.pipelineValue?.contacted, color: '#3B82F6', rate: `${data.forecast.historicalConversion?.contactedToLead || 0}%` },
                                                ].map(p => (
                                                    <div key={p.label} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12, border: '1px solid var(--border-subtle)' }}>
                                                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{p.label}</div>
                                                        <div style={{ fontSize: 18, fontWeight: 700, color: p.color }}>{p.data?.count || 0}</div>
                                                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Conv: {p.rate}</div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Revenue Trend Chart */}
                                            {data.forecast.revenueByMonth?.length > 0 && (
                                                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)' }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Monthly Revenue</div>
                                                    <ResponsiveContainer width="100%" height={200}>
                                                        <BarChart data={data.forecast.revenueByMonth}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                                                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                                                            <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                                                            <Tooltip />
                                                            <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Escalation Alerts */}
                                    {data.escalations && (
                                        <div style={{ marginBottom: 24 }}>
                                            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Escalation Alerts</h3>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                                {/* Stuck in Contacted */}
                                                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)' }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', marginBottom: 8 }}>
                                                        Stuck in Contacted ({data.escalations.stuckInContacted?.length || 0})
                                                    </div>
                                                    {(data.escalations.stuckInContacted || []).slice(0, 5).map((c: any) => (
                                                        <div key={c.id} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>{c.name || c.email}</span>
                                                            <span style={{ color: '#EF4444' }}>{c.days}d</span>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Stuck in Lead */}
                                                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)' }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#3B82F6', marginBottom: 8 }}>
                                                        Leads Going Cold ({data.escalations.stuckInLead?.length || 0})
                                                    </div>
                                                    {(data.escalations.stuckInLead || []).slice(0, 5).map((c: any) => (
                                                        <div key={c.id} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>{c.name || c.email} ({c.replies} replies)</span>
                                                            <span style={{ color: '#F59E0B' }}>{c.days}d silent</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Churn Risks */}
                                    {data.churn?.length > 0 && (
                                        <div style={{ marginBottom: 24 }}>
                                            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                                                Churn Risk — Response Time Slowing ({data.churn.length})
                                            </h3>
                                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                                                {data.churn.slice(0, 10).map((c: any) => (
                                                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                                                        <div className="avatar avatar-sm" style={{ background: avatarColor(c.email), flexShrink: 0 }}>
                                                            {initials(c.name || '?')}
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name || c.email}</div>
                                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                                                Was replying in {c.earlyAvgHours}h → now {c.recentAvgHours}h ({c.slowdownFactor}x slower)
                                                            </div>
                                                        </div>
                                                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: riskColors[c.riskLevel], color: '#fff' }}>
                                                            {c.riskLevel.toUpperCase()}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Competitor Mentions */}
                                    {data.competitors?.length > 0 && (
                                        <div style={{ marginBottom: 24 }}>
                                            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                                                Competitor Mentions ({data.competitors.length})
                                            </h3>
                                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                                                {data.competitors.slice(0, 10).map((c: any, i: number) => (
                                                    <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                            <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name || c.email}</span>
                                                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{c.mentionDate?.substring(0, 10)}</span>
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#EF4444', fontStyle: 'italic', padding: '4px 8px', background: 'rgba(239,68,68,0.05)', borderRadius: 4 }}>
                                                            &quot;{c.mentionText?.substring(0, 150)}&quot;
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </PageLoader>
                    </div>
                </div>
            </div>
        </div>
    );
}
