'use client';

import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    AreaChart, Area, PieChart, Pie, Cell, LabelList, CartesianGrid
} from 'recharts';

/* ── Palette matching app design system (Gmail-inspired) ──────────── */
const CHART_COLORS = ['#1a73e8', '#1e8e3e', '#f9ab00', '#8430ce', '#129eaf', '#d93025', '#4285f4', '#5f6368'];

/* ── Tooltip rendered via recharts content prop (receives portal, not scoped) ── */
const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
            padding: '12px 16px', boxShadow: '0 1px 3px 0 rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15)',
            minWidth: 160,
        }}>
            <p style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 8 }}>{label}</p>
            {payload.map((entry: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.color || entry.fill, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flex: 1 }}>{entry.name}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{entry.value?.toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
};

/* ── Format response time for display ──────────────────────────────── */
function formatResponseTime(hours: number | null): string {
    if (hours === null || hours === undefined) return 'N/A';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
}

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
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={13} width={80} tick={{ fill: 'var(--text-secondary)', fontWeight: 500 }} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                                <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={40}>
                                    {(data?.funnelData || []).map((_: any, i: number) => (
                                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                    ))}
                                    <LabelList dataKey="value" position="right" offset={12} style={{ fill: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }} />
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
                    <div className="a-sentiment-layout">
                        <div className="a-pie-wrap">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={data?.sentimentData || []} innerRadius={80} outerRadius={110} paddingAngle={4} cornerRadius={6} dataKey="value" stroke="none">
                                        {(data?.sentimentData || []).map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                                    </Pie>
                                    <Tooltip content={<ChartTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="a-legend">
                            {(data?.sentimentData || []).map((s: any, i: number) => (
                                <div key={i} className="a-legend-item">
                                    <div className="a-legend-top">
                                        <span className="a-legend-dot" style={{ background: s.color }} />
                                        <span className="a-legend-name">{s.name}</span>
                                        <span className="a-legend-count">{s.value}</span>
                                    </div>
                                    <div className="a-legend-bar">
                                        <div
                                            className="a-legend-bar-fill a-bar-animate"
                                            style={{
                                                background: s.color,
                                                width: `${stats?.totalReceived > 0 ? (s.value / stats.totalReceived) * 100 : 0}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Team Performance ─────────────── */}
            <div className="a-card a-card-full">
                <div className="a-card-header">
                    <h3 className="a-card-title">Team Performance</h3>
                    <p className="a-card-sub">Leads, revenue, and conversion by manager</p>
                </div>
                {(data?.leaderboard || []).length === 0 ? (
                    <p className="a-empty">No team data for selected period.</p>
                ) : (
                    <div className="a-table-wrap">
                        <table className="a-table" role="table">
                            <thead>
                                <tr>
                                    <th className="a-th">Manager</th>
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
                                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} interval={3} tick={{ fill: 'var(--text-tertiary)' }} />
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
                            <p className="a-empty">No subject data yet.</p>
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

            {/* ── Row 4: Response Time Distribution + Pipeline Overview ── */}
            <div className="a-grid">
                <div className="a-card a-card--7">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Response Time Distribution</h3>
                        <p className="a-card-sub">How quickly you reply to incoming emails</p>
                    </div>
                    <div className="a-chart-container" style={{ height: 250 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data?.responseTimeData?.responseDistribution || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} stroke="var(--text-tertiary)" />
                                <YAxis tick={{ fontSize: 12 }} stroke="var(--text-tertiary)" />
                                <Bar dataKey="count" fill="#1a73e8" radius={[4, 4, 0, 0]} />
                                <Tooltip content={<ChartTooltip />} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="a-card a-card--5">
                    <div className="a-card-header">
                        <h3 className="a-card-title">Pipeline Overview</h3>
                        <p className="a-card-sub">Contact distribution by pipeline stage</p>
                    </div>
                    <div className="a-chart-container" style={{ height: 250 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data?.pipelineFunnel || []} layout="vertical" margin={{ left: 10, right: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--text-tertiary)" />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} stroke="var(--text-tertiary)" width={120} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {(data?.pipelineFunnel || []).map((entry: any, index: number) => (
                                        <Cell key={index} fill={entry.fill} />
                                    ))}
                                    <LabelList dataKey="value" position="right" offset={8} style={{ fill: 'var(--text-primary)', fontSize: '12px', fontWeight: 600 }} />
                                </Bar>
                                <Tooltip content={<ChartTooltip />} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* ── Row 5: Device & Browser Analytics ── */}
            {deviceData && (
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
                                if (items.length === 0) return <p className="a-empty">No device data yet.</p>;
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
                                if (items.length === 0) return <p className="a-empty">No browser data yet.</p>;
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
                                if (items.length === 0) return <p className="a-empty">No OS data yet.</p>;
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

        </div>
    );
}
