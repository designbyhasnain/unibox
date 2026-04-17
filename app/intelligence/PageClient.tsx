'use client';

import React from 'react';
import Topbar from '../components/Topbar';
import { getIntelligenceDashboardAction, getPricingAnalyticsAction, getJarvisWeeklyInsightAction } from '../../src/actions/intelligenceActions';
import { Sparkles, RefreshCw } from 'lucide-react';
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

    const { data: pricing } = useSWRData(
        'pricing_analytics',
        () => getPricingAnalyticsAction()
    );

    // Jarvis Weekly Insight — fetched once on mount, user can regenerate.
    const [weekly, setWeekly] = React.useState<Awaited<ReturnType<typeof getJarvisWeeklyInsightAction>> | null>(null);
    const [weeklyLoading, setWeeklyLoading] = React.useState(false);
    const loadWeekly = React.useCallback(async () => {
        setWeeklyLoading(true);
        try { setWeekly(await getJarvisWeeklyInsightAction()); }
        finally { setWeeklyLoading(false); }
    }, []);
    React.useEffect(() => { loadWeekly(); }, [loadWeekly]);

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
                                    {/* Jarvis Weekly Insight */}
                                    <div style={{
                                        marginBottom: 24,
                                        background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.06), rgba(59, 130, 246, 0.04))',
                                        border: '1px solid rgba(124, 58, 237, 0.15)',
                                        borderRadius: 14,
                                        padding: 18,
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Sparkles size={16} style={{ color: '#7c3aed' }} />
                                                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#7c3aed', letterSpacing: 0.2 }}>
                                                    JARVIS WEEKLY INSIGHT
                                                </h3>
                                            </div>
                                            <button onClick={loadWeekly} disabled={weeklyLoading} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                background: 'transparent', border: '1px solid rgba(124, 58, 237, 0.25)',
                                                borderRadius: 6, padding: '3px 10px', fontSize: 11,
                                                color: '#7c3aed', fontWeight: 600, cursor: weeklyLoading ? 'wait' : 'pointer',
                                            }}>
                                                <RefreshCw size={11} style={{ animation: weeklyLoading ? 'spin 1s linear infinite' : 'none' }} />
                                                {weeklyLoading ? 'Thinking…' : 'Regenerate'}
                                            </button>
                                        </div>

                                        {weekly?.summary ? (
                                            <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.55, margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>
                                                {weekly.summary}
                                            </p>
                                        ) : weeklyLoading ? (
                                            <p style={{ fontSize: 13, color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic', margin: 0 }}>
                                                Reading your last 7 days and drafting an insight…
                                            </p>
                                        ) : (
                                            <p style={{ fontSize: 13, color: 'var(--text-muted, #94a3b8)', margin: 0 }}>
                                                {weekly?.error || 'No insight available yet. Click Regenerate.'}
                                            </p>
                                        )}

                                        {weekly?.snapshot && (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, fontSize: 12 }}>
                                                <Stat label="Sent" value={weekly.snapshot.emailsSent.toLocaleString()} />
                                                <Stat label="Replies" value={weekly.snapshot.repliesReceived.toLocaleString()} />
                                                <Stat label="New leads" value={weekly.snapshot.newLeads.toLocaleString()} />
                                                <Stat label="Deals closed" value={weekly.snapshot.dealsClosed.toLocaleString()} />
                                                <Stat label="Revenue" value={fmt(weekly.snapshot.revenueClosed)} />
                                            </div>
                                        )}
                                    </div>

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

                            {/* ═══ PRICING ANALYTICS ═══ */}
                            {pricing && (
                                <>
                                    {/* Overall KPIs */}
                                    <div style={{ marginBottom: 24 }}>
                                        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Pricing Analytics</h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)' }}>
                                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Total Revenue</div>
                                                <div style={{ fontSize: 28, fontWeight: 700, color: '#10B981' }}>{fmt(pricing.overall.totalRevenue)}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{pricing.overall.totalProjects} projects</div>
                                            </div>
                                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)' }}>
                                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Avg Project Value</div>
                                                <div style={{ fontSize: 28, fontWeight: 700, color: '#1a73e8' }}>{fmt(pricing.overall.avgValue)}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Median: {fmt(pricing.overall.medianValue)}</div>
                                            </div>
                                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)' }}>
                                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Winning Client Avg</div>
                                                <div style={{ fontSize: 28, fontWeight: 700, color: '#8B5CF6' }}>{fmt(pricing.winningProfile.avgPaid)}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{pricing.winningProfile.paidCount} paid clients</div>
                                            </div>
                                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)' }}>
                                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Unpaid Avg</div>
                                                <div style={{ fontSize: 28, fontWeight: 700, color: '#EF4444' }}>{fmt(pricing.winningProfile.avgUnpaid)}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{pricing.winningProfile.unpaidCount} unpaid</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Monthly Trend */}
                                    <div style={{ marginBottom: 24 }}>
                                        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Monthly Avg Project Value</h3>
                                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)', marginBottom: 12 }}>
                                            <ResponsiveContainer width="100%" height={220}>
                                                <BarChart data={[...pricing.monthly].reverse()}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                                                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                                                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                                                    <Tooltip formatter={(v: any) => ['$' + v, '']} />
                                                    <Bar dataKey="avgValue" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Avg Value" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                                                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Month</th>
                                                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Projects</th>
                                                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Revenue</th>
                                                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Avg Value</th>
                                                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Collection</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pricing.monthly.map((m: any) => (
                                                        <tr key={m.month} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{m.month}</td>
                                                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>{m.projects}</td>
                                                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10B981' }}>{fmt(m.totalRevenue)}</td>
                                                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{fmt(m.avgValue)}</td>
                                                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                                <span style={{ color: m.collectionRate > 70 ? '#10B981' : m.collectionRate > 40 ? '#F59E0B' : '#EF4444' }}>
                                                                    {m.collectionRate}%
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Price Brackets */}
                                    <div style={{ marginBottom: 24 }}>
                                        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Price Brackets</h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
                                            {pricing.brackets.map((b: any) => (
                                                <div key={b.label} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 12, border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                                                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>{b.label}</div>
                                                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{b.count}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{b.percentage}%</div>
                                                    <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${b.percentage}%`, background: '#8B5CF6', borderRadius: 2 }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Top Clients */}
                                    <div style={{ marginBottom: 24 }}>
                                        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Top 10 Clients by Revenue</h3>
                                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                                            {pricing.topClients.map((c: any, i: number) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                                                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: i < 3 ? '#F59E0B' : 'var(--bg-tertiary)', color: i < 3 ? '#fff' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                                                        {i + 1}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                                                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{c.projects} projects | avg {fmt(c.avgValue)}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#10B981' }}>{fmt(c.totalRevenue)}</div>
                                                        <div style={{ fontSize: 10, color: c.collectionRate > 80 ? '#10B981' : '#F59E0B' }}>
                                                            {fmt(c.collected)} collected ({c.collectionRate}%)
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* AM Performance */}
                                    <div style={{ marginBottom: 24 }}>
                                        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Account Manager Performance</h3>
                                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                                                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Manager</th>
                                                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Projects</th>
                                                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Revenue</th>
                                                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Avg</th>
                                                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Collected</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pricing.amPerformance.map((am: any) => (
                                                        <tr key={am.name} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{am.name}</td>
                                                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>{am.projects}</td>
                                                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10B981' }}>{fmt(am.totalRevenue)}</td>
                                                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{fmt(am.avgValue)}</td>
                                                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt(am.collected)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}
                        </PageLoader>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div style={{
            background: 'var(--bg-surface, #fff)', border: '1px solid var(--border-subtle, #e5e7eb)',
            borderRadius: 8, padding: '6px 10px',
        }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{value}</div>
        </div>
    );
}
