'use client';

import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    AreaChart, Area, PieChart, Pie, Cell, LabelList
} from 'recharts';

/* ── Palette matching app design system (Gmail-inspired) ──────────── */
const CHART_COLORS = ['#1a73e8', '#1e8e3e', '#f9ab00', '#8430ce', '#129eaf', '#d93025', '#4285f4', '#5f6368'];

/** Mini empty state for cards - shows icon + message instead of blank space */
function CardEmpty({ message }: { message: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 1rem', gap: 8, minHeight: 160 }}>
            <svg width="32" height="32" fill="none" stroke="#dadce0" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M3 3h18v18H3zM3 9h18M9 21V9" />
            </svg>
            <span style={{ fontSize: '0.8rem', color: '#9aa0a6', textAlign: 'center' }}>{message}</span>
        </div>
    );
}

/** Renders a breakdown bar list - reused across many cards */
function BreakdownList({ items }: { items: Array<{ name: string; value: number; color: string }> }) {
    const total = items.reduce((s, x) => s + x.value, 0);
    if (total === 0) return <CardEmpty message="No data for this period" />;
    return (
        <div className="a-breakdown-list">
            {items.map(d => {
                const pct = total > 0 ? (d.value / total) * 100 : 0;
                return (
                    <div key={d.name} className="a-breakdown-row">
                        <div className="a-breakdown-label">
                            <span className="a-breakdown-dot" style={{ background: d.color }} />
                            <span className="a-breakdown-name">{d.name}</span>
                        </div>
                        <div className="a-breakdown-bar-wrap">
                            <div className="a-breakdown-bar-fill a-bar-animate" style={{ background: d.color, width: `${pct}%` }} />
                        </div>
                        <span className="a-breakdown-value">{d.value} <span className="a-breakdown-pct">({pct.toFixed(0)}%)</span></span>
                    </div>
                );
            })}
        </div>
    );
}

/** Pie chart with legend - reused pattern */
function PieLegendCard({ items, totalRef }: { items: Array<{ name: string; value: number; color: string }>; totalRef?: number }) {
    const total = totalRef ?? items.reduce((a, b) => a + b.value, 0);
    if (total === 0) return <CardEmpty message="No data for this period" />;
    return (
        <div className="a-sentiment-layout">
            <div className="a-pie-wrap">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={items} innerRadius={70} outerRadius={100} paddingAngle={4} cornerRadius={6} dataKey="value" stroke="none">
                            {items.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="a-legend">
                {items.map(s => (
                    <div key={s.name} className="a-legend-item">
                        <div className="a-legend-top">
                            <span className="a-legend-dot" style={{ background: s.color }} />
                            <span className="a-legend-name">{s.name}</span>
                            <span className="a-legend-count">{s.value.toLocaleString()}</span>
                        </div>
                        <div className="a-legend-bar">
                            <div className="a-legend-bar-fill a-bar-animate" style={{ background: s.color, width: `${total > 0 ? (s.value / total) * 100 : 0}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ── Tooltip rendered via recharts content prop (receives portal, not scoped) ── */
const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12,
            padding: '12px 16px', boxShadow: '0 1px 3px 0 rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15)',
            minWidth: 160,
        }}>
            <p style={{ fontWeight: 600, fontSize: '0.85rem', color: '#202124', marginBottom: 8 }}>{label}</p>
            {payload.map((entry: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.color || entry.fill, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', color: '#444746', flex: 1 }}>{entry.name}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#202124' }}>{entry.value?.toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
};

interface AnalyticsChartsProps {
    data: any;
    deviceData: any;
    stats: any;
    kpis: Array<{ label: string; value: string; detail: string; icon: React.ReactNode }>;
}

export default function AnalyticsCharts({ data, deviceData, stats, kpis }: AnalyticsChartsProps) {
    return (
        <div className="a-content a-charts-fade-in">

            {/* ── KPI Row ── */}
            <div className="a-stats-row">
                {kpis.map((kpi, i) => (
                    <div
                        key={kpi.label}
                        className="a-stat a-kpi-stagger"
                        style={{ animationDelay: `${i * 0.05}s` }}
                    >
                        <div className="a-stat-top">
                            <div className="a-stat-icon">{kpi.icon}</div>
                            <p className="a-stat-label">{kpi.label}</p>
                        </div>
                        <h2 className="a-stat-value">{kpi.value}</h2>
                        <p className="a-stat-detail">{kpi.detail}</p>
                    </div>
                ))}
            </div>

            {/* ── Row 2: Funnel + Reply Categories ── */}
            <div className="a-grid">
                <div className="a-card a-card--7">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Email Funnel</h3>
                        <p className="a-card-sub">Outreach to conversion flow</p>
                    </div>
                    <div className="a-chart-container" style={{ height: 360 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={data?.funnelData || []} margin={{ left: 10, right: 40 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={13} width={80} tick={{ fill: '#444746', fontWeight: 500 }} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                                <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={40}>
                                    {(data?.funnelData || []).map((_: any, i: number) => (
                                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                    ))}
                                    <LabelList dataKey="value" position="right" offset={12} style={{ fill: '#202124', fontSize: '13px', fontWeight: 600 }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="a-card a-card--5">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Reply Categories</h3>
                        <p className="a-card-sub">Based on lead status and spam flags</p>
                    </div>
                    <PieLegendCard items={data?.sentimentData || []} totalRef={stats?.totalReceived || 0} />
                </div>
            </div>

            {/* ── Outreach Breakdown (5 Email Types) ── */}
            {(data?.outreachBreakdown || []).some((d: any) => d.value > 0) && (
                <div className="a-grid">
                    <div className="a-card a-card--7">
                        <div className="a-card-header">
                            <h3 className="a-card-title">Outreach Breakdown</h3>
                            <p className="a-card-sub">Email classification: outreach, follow-ups, replies</p>
                        </div>
                        <div className="a-chart-container" style={{ height: 320 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart layout="vertical" data={data?.outreachBreakdown || []} margin={{ left: 20, right: 40 }}>
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={13} width={130} tick={{ fill: '#444746', fontWeight: 500 }} />
                                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                                    <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={32}>
                                        {(data?.outreachBreakdown || []).map((entry: any, i: number) => (
                                            <Cell key={i} fill={entry.color} />
                                        ))}
                                        <LabelList dataKey="value" position="right" offset={12} style={{ fill: '#202124', fontSize: '13px', fontWeight: 600 }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="a-card a-card--5">
                        <div className="a-card-header">
                            <h3 className="a-card-title">True Reply Rate</h3>
                            <p className="a-card-sub">First replies / unique prospects outreached</p>
                        </div>
                        <div style={{ padding: '2rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                                {stats?.avgReplyRate || '0%'}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: 8 }}>
                                {(stats?.firstReplies || 0).toLocaleString()} first replies from {(stats?.uniqueProspectsOutreached || 0).toLocaleString()} prospects
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20 }}>
                                <div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1a73e8' }}>{(stats?.outreachFirst || 0).toLocaleString()}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Outreach #1</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#6366f1' }}>{(stats?.followUps || 0).toLocaleString()}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Follow-ups</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#129eaf' }}>{(stats?.conversational || 0).toLocaleString()}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>In Dialogue</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Team Performance ─────────────── */}
            <div className="a-card a-card-full">
                <div className="a-card-header">
                    <h3 className="a-card-title">Team Performance</h3>
                    <p className="a-card-sub">Leads, revenue, and conversion by manager</p>
                </div>
                {(data?.leaderboard || []).length === 0 ? (
                    <CardEmpty message="No team data for this period. Add managers in Settings." />
                ) : (
                    <div className="a-table-wrap">
                        <table className="a-table" role="table">
                            <thead>
                                <tr>
                                    <th className="a-th">Manager</th>
                                    <th className="a-th a-th--right">Sent</th>
                                    <th className="a-th a-th--right">Received</th>
                                    <th className="a-th a-th--right">Reply Rate</th>
                                    <th className="a-th a-th--right">Leads</th>
                                    <th className="a-th a-th--right">Revenue</th>
                                    <th className="a-th">Conversion</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(data?.leaderboard || []).map((m: any, i: number) => (
                                    <tr key={i} className="a-tr">
                                        <td className="a-td">
                                            <div className="a-manager-cell">
                                                <div className="a-avatar" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>
                                                    {m.name?.[0] || '?'}
                                                </div>
                                                <span className="a-manager-name">{m.name}</span>
                                            </div>
                                        </td>
                                        <td className="a-td a-td--right a-td--mono">{(m.sent || 0).toLocaleString()}</td>
                                        <td className="a-td a-td--right a-td--mono">{(m.received || 0).toLocaleString()}</td>
                                        <td className="a-td a-td--right a-td--mono">{m.replyRate || '0%'}</td>
                                        <td className="a-td a-td--right a-td--mono">{m.leads}</td>
                                        <td className="a-td a-td--right a-td--mono">${(m.revenue || 0).toLocaleString()}</td>
                                        <td className="a-td">
                                            <div className="a-conv-cell">
                                                <div className="a-conv-track">
                                                    <div className="a-conv-fill" style={{ width: m.conversion, background: '#1e8e3e' }} />
                                                </div>
                                                <span className="a-conv-label">{m.conversion}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Account Performance ──────────── */}
            {(data?.accountPerformance || []).length > 0 && (
                <div className="a-card a-card-full">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Account Performance</h3>
                        <p className="a-card-sub">Emails sent and received per connected account</p>
                    </div>
                    <div className="a-table-wrap">
                        <table className="a-table" role="table">
                            <thead>
                                <tr>
                                    <th className="a-th">Account</th>
                                    <th className="a-th a-th--right">Sent</th>
                                    <th className="a-th a-th--right">Received</th>
                                    <th className="a-th">Reply Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(data.accountPerformance || []).map((a: any, i: number) => (
                                    <tr key={i} className="a-tr">
                                        <td className="a-td">
                                            <div className="a-manager-cell">
                                                <div className="a-avatar" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>
                                                    {a.name?.[0]?.toUpperCase() || '@'}
                                                </div>
                                                <div>
                                                    <span className="a-manager-name">{a.name}</span>
                                                    <div style={{ fontSize: '0.75rem', color: '#5f6368' }}>{a.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="a-td a-td--right a-td--mono">{(a.sent || 0).toLocaleString()}</td>
                                        <td className="a-td a-td--right a-td--mono">{(a.received || 0).toLocaleString()}</td>
                                        <td className="a-td">
                                            <div className="a-conv-cell">
                                                <div className="a-conv-track">
                                                    <div className="a-conv-fill" style={{ width: a.replyRate, background: '#1a73e8' }} />
                                                </div>
                                                <span className="a-conv-label">{a.replyRate}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Row 3: Hourly + Top Subjects ──── */}
            <div className="a-grid">
                <div className="a-card a-card--7">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Response Times</h3>
                        <p className="a-card-sub">Replies received by hour of day</p>
                    </div>
                    <div className="a-chart-container" style={{ height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data?.hourlyEngagement || []}>
                                <defs>
                                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#1a73e8" stopOpacity={0.15} />
                                        <stop offset="100%" stopColor="#1a73e8" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} interval={3} tick={{ fill: '#5f6368' }} />
                                <YAxis hide />
                                <Tooltip content={<ChartTooltip />} />
                                <Area type="monotone" dataKey="replies" stroke="#1a73e8" strokeWidth={2.5} fillOpacity={1} fill="url(#areaGrad)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="a-card a-card--5">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Top Subjects</h3>
                        <p className="a-card-sub">Most replied-to email subjects</p>
                    </div>
                    <div className="a-subjects">
                        {(data?.topSubjects || []).length === 0 ? (
                            <CardEmpty message="No subject data for this period" />
                        ) : (
                            (data?.topSubjects || []).map((s: any, i: number) => (
                                <div key={i} className="a-subject-row">
                                    <span className="a-subject-rank">{i + 1}</span>
                                    <div className="a-subject-info">
                                        <p className="a-subject-name">{s.name}</p>
                                    </div>
                                    <span className="a-subject-count">{s.replies} <span className="a-subject-unit">replies</span></span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* ── Row 4: Device & Browser Analytics (removed - simplified tracking) ── */}
            {false && deviceData && (
                <div className="a-grid a-grid--3">
                    {/* Device Type */}
                    <div className="a-card a-card--4">
                        <div className="a-card-header">
                            <h3 className="a-card-title">Device Type</h3>
                            <p className="a-card-sub">Opens & clicks by device</p>
                        </div>
                        <div className="a-breakdown-list">
                            {(() => {
                                const items = (deviceData.devices || []).filter((d: any) => d.name !== 'Bot');
                                const total = items.reduce((sum: number, d: any) => sum + d.count, 0);
                                if (items.length === 0) return <CardEmpty message="No device data for this period" />;
                                return items.map((d: any, i: number) => {
                                    const pct = total > 0 ? (d.count / total) * 100 : 0;
                                    return (
                                        <div key={d.name} className="a-breakdown-row">
                                            <div className="a-breakdown-label">
                                                <span className="a-breakdown-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                                <span className="a-breakdown-name">{d.name}</span>
                                            </div>
                                            <div className="a-breakdown-bar-wrap">
                                                <div
                                                    className="a-breakdown-bar-fill a-bar-animate"
                                                    style={{
                                                        background: CHART_COLORS[i % CHART_COLORS.length],
                                                        width: `${pct}%`,
                                                    }}
                                                />
                                            </div>
                                            <span className="a-breakdown-value">{d.count} <span className="a-breakdown-pct">({pct.toFixed(0)}%)</span></span>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>

                    {/* Browser */}
                    <div className="a-card a-card--4">
                        <div className="a-card-header">
                            <h3 className="a-card-title">Browser</h3>
                            <p className="a-card-sub">Opens & clicks by browser</p>
                        </div>
                        <div className="a-breakdown-list">
                            {(() => {
                                const items = (deviceData.browsers || []).filter((d: any) => d.name !== 'Bot');
                                const total = items.reduce((sum: number, d: any) => sum + d.count, 0);
                                if (items.length === 0) return <CardEmpty message="No browser data for this period" />;
                                return items.map((d: any, i: number) => {
                                    const pct = total > 0 ? (d.count / total) * 100 : 0;
                                    return (
                                        <div key={d.name} className="a-breakdown-row">
                                            <div className="a-breakdown-label">
                                                <span className="a-breakdown-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                                <span className="a-breakdown-name">{d.name}</span>
                                            </div>
                                            <div className="a-breakdown-bar-wrap">
                                                <div
                                                    className="a-breakdown-bar-fill a-bar-animate"
                                                    style={{
                                                        background: CHART_COLORS[i % CHART_COLORS.length],
                                                        width: `${pct}%`,
                                                    }}
                                                />
                                            </div>
                                            <span className="a-breakdown-value">{d.count} <span className="a-breakdown-pct">({pct.toFixed(0)}%)</span></span>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>

                    {/* OS */}
                    <div className="a-card a-card--4">
                        <div className="a-card-header">
                            <h3 className="a-card-title">Operating System</h3>
                            <p className="a-card-sub">Opens & clicks by OS</p>
                        </div>
                        <div className="a-breakdown-list">
                            {(() => {
                                const items = (deviceData.os || []).filter((d: any) => d.name !== 'Bot');
                                const total = items.reduce((sum: number, d: any) => sum + d.count, 0);
                                if (items.length === 0) return <CardEmpty message="No OS data for this period" />;
                                return items.map((d: any, i: number) => {
                                    const pct = total > 0 ? (d.count / total) * 100 : 0;
                                    return (
                                        <div key={d.name} className="a-breakdown-row">
                                            <div className="a-breakdown-label">
                                                <span className="a-breakdown-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                                <span className="a-breakdown-name">{d.name}</span>
                                            </div>
                                            <div className="a-breakdown-bar-wrap">
                                                <div
                                                    className="a-breakdown-bar-fill a-bar-animate"
                                                    style={{
                                                        background: CHART_COLORS[i % CHART_COLORS.length],
                                                        width: `${pct}%`,
                                                    }}
                                                />
                                            </div>
                                            <span className="a-breakdown-value">{d.count} <span className="a-breakdown-pct">({pct.toFixed(0)}%)</span></span>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Row 5: Email Volume by Day + Response Time ── */}
            <div className="a-grid">
                <div className="a-card a-card--7">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Email Volume by Day</h3>
                        <p className="a-card-sub">Sent and received emails by day of week</p>
                    </div>
                    <div className="a-chart-container" style={{ height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data?.volumeByDay || []}>
                                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: '#5f6368' }} />
                                <YAxis hide />
                                <Tooltip content={<ChartTooltip />} />
                                <Bar dataKey="sent" name="Sent" fill="#1a73e8" radius={[4, 4, 0, 0]} barSize={20} />
                                <Bar dataKey="received" name="Received" fill="#1e8e3e" radius={[4, 4, 0, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="a-card a-card--5">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Response Time</h3>
                        <p className="a-card-sub">How fast contacts reply to your emails</p>
                    </div>
                    <BreakdownList items={data?.responseTimeBuckets || []} />
                </div>
            </div>

            {/* ── Row 6: Pipeline Funnel + Thread Depth ── */}
            <div className="a-grid">
                <div className="a-card a-card--7">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Pipeline Funnel</h3>
                        <p className="a-card-sub">Contact conversion through pipeline stages</p>
                    </div>
                    <div className="a-chart-container" style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={data?.pipelineFunnel || []} margin={{ left: 20, right: 40 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={13} width={120} tick={{ fill: '#444746', fontWeight: 500 }} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                                <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={32}>
                                    {(data?.pipelineFunnel || []).map((entry: any, i: number) => (
                                        <Cell key={i} fill={entry.fill} />
                                    ))}
                                    <LabelList dataKey="value" position="right" offset={12} style={{ fill: '#202124', fontSize: '13px', fontWeight: 600 }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="a-card a-card--5">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Thread Depth</h3>
                        <p className="a-card-sub">Conversation length distribution</p>
                    </div>
                    <PieLegendCard items={data?.threadDepthData || []} />
                </div>
            </div>

            {/* ── Row 7: Revenue Trend + Payment Status ── */}
                <div className="a-grid">
                    <div className="a-card a-card--7">
                        <div className="a-card-header">
                            <h3 className="a-card-title">Revenue Trend</h3>
                            <p className="a-card-sub">Monthly revenue from projects</p>
                        </div>
                        <div className="a-chart-container" style={{ height: 260 }}>
                            {(data?.revenueTrend || []).length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={data.revenueTrend}>
                                        <defs>
                                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#8430ce" stopOpacity={0.15} />
                                                <stop offset="100%" stopColor="#8430ce" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#5f6368' }} />
                                        <YAxis hide />
                                        <Tooltip content={<ChartTooltip />} />
                                        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#8430ce" strokeWidth={2.5} fillOpacity={1} fill="url(#revGrad)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : <CardEmpty message="No revenue data for this period" />}
                        </div>
                    </div>

                    <div className="a-card a-card--5">
                        <div className="a-card-header">
                            <h3 className="a-card-title">Payment Status</h3>
                            <p className="a-card-sub">Project payment breakdown</p>
                        </div>
                        <PieLegendCard items={data?.paidBreakdown || []} />
                    </div>
                </div>

            {/* ── Row 8: Best Subject Lines + Top Clients ── */}
            <div className="a-grid">
                <div className="a-card a-card--7">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Best Subject Lines</h3>
                        <p className="a-card-sub">Highest open rate on sent emails (min 2 sent)</p>
                    </div>
                    <div className="a-subjects">
                        {(data?.bestSubjects || []).length === 0 ? (
                            <CardEmpty message="No subject data for this period" />
                        ) : (
                            (data.bestSubjects || []).map((s: any, i: number) => (
                                <div key={i} className="a-subject-row">
                                    <span className="a-subject-rank">{i + 1}</span>
                                    <div className="a-subject-info">
                                        <p className="a-subject-name">{s.name}</p>
                                    </div>
                                    <span className="a-subject-count" style={{ color: s.openRate >= 50 ? '#1e8e3e' : s.openRate >= 25 ? '#f9ab00' : '#ea4335' }}>
                                        {s.openRate}% <span className="a-subject-unit">open ({s.opened}/{s.sent})</span>
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="a-card a-card--5">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Top Contacts</h3>
                        <p className="a-card-sub">Most active email contacts</p>
                    </div>
                    <div className="a-subjects">
                        {(data?.topClients || []).length === 0 ? (
                            <CardEmpty message="No contact activity for this period" />
                        ) : (
                            (data.topClients || []).map((c: any, i: number) => (
                                <div key={i} className="a-subject-row">
                                    <span className="a-subject-rank" style={{ background: CHART_COLORS[i % CHART_COLORS.length], color: '#fff', fontSize: '0.7rem' }}>
                                        {(c.email?.[0] || '?').toUpperCase()}
                                    </span>
                                    <div className="a-subject-info">
                                        <p className="a-subject-name">{c.email}</p>
                                    </div>
                                    <span className="a-subject-count">{c.total} <span className="a-subject-unit">emails</span></span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* ── Row 9: Project Analytics (Priority + Review + Timeline) ── */}
                <div className="a-grid a-grid--3">
                    <div className="a-card a-card--4">
                        <div className="a-card-header">
                            <h3 className="a-card-title">Priority Distribution</h3>
                            <p className="a-card-sub">Project priority levels</p>
                        </div>
                        <BreakdownList items={data?.priorityDist || []} />
                    </div>

                    <div className="a-card a-card--4">
                        <div className="a-card-header">
                            <h3 className="a-card-title">Final Review</h3>
                            <p className="a-card-sub">Project review status</p>
                        </div>
                        <BreakdownList items={data?.reviewStats || []} />
                    </div>

                    <div className="a-card a-card--4">
                        <div className="a-card-header">
                            <h3 className="a-card-title">Project Timeline</h3>
                            <p className="a-card-sub">On-time vs delayed delivery</p>
                        </div>
                        <BreakdownList items={data?.timelinessData || []} />
                    </div>
                </div>

            {/* ── Row 10: Unread/Read + Link Clicks ── */}
            <div className="a-grid">
                <div className="a-card a-card--5">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Read vs Unread</h3>
                        <p className="a-card-sub">Email read status in selected period</p>
                    </div>
                    <PieLegendCard items={data?.unreadData || []} />
                </div>

                <div className="a-card a-card--7">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Open Rate</h3>
                        <p className="a-card-sub">How many sent emails were opened (blue ticked)</p>
                    </div>
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                            {stats?.openRate || '0%'}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: 8 }}>
                            {stats?.openedEmails?.toLocaleString() || '0'} opened out of {stats?.totalOutreach?.toLocaleString() || '0'} sent
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Row 11: Activity Heatmap (Day x Hour) ── */}
            <div className="a-card a-card-full">
                <div className="a-card-header">
                    <h3 className="a-card-title">Activity Heatmap</h3>
                    <p className="a-card-sub">Email activity by day and hour — darker = more emails</p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(24, 1fr)', gap: 2, minWidth: 700 }}>
                        <div />
                        {Array.from({ length: 24 }, (_, h) => (
                            <div key={h} style={{ textAlign: 'center', fontSize: 10, color: '#5f6368', padding: '4px 0' }}>
                                {h % 3 === 0 ? `${h}:00` : ''}
                            </div>
                        ))}
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => {
                            const dayData = (data?.heatmapData || []).filter((d: any) => d.day === day);
                            const maxCount = Math.max(...(data?.heatmapData || []).map((d: any) => d.count), 1);
                            return (
                                <React.Fragment key={day}>
                                    <div style={{ fontSize: 12, fontWeight: 500, color: '#444746', display: 'flex', alignItems: 'center', paddingRight: 8 }}>{day}</div>
                                    {Array.from({ length: 24 }, (_, h) => {
                                        const cell = dayData.find((d: any) => d.hour === h);
                                        const count = cell?.count || 0;
                                        const intensity = count / maxCount;
                                        return (
                                            <div
                                                key={h}
                                                title={`${day} ${h}:00 — ${count} emails`}
                                                style={{
                                                    height: 24,
                                                    borderRadius: 3,
                                                    background: count === 0 ? '#f1f3f4' : `rgba(26, 115, 232, ${Math.max(0.1, intensity)})`,
                                                }}
                                            />
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>
            </div>

        </div>
    );
}
