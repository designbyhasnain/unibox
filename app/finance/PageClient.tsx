'use client';

import React, { useState } from 'react';
import Topbar from '../components/Topbar';
import { getFinanceOverviewAction } from '../../src/actions/financeActions';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { useSWRData } from '../utils/staleWhileRevalidate';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, LineChart, Line, ReferenceLine,
} from 'recharts';

const COLORS = ['#10B981', '#F59E0B', '#EF4444'];

function formatCurrency(val: number) {
    return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function FinancePage() {
    const isHydrated = useHydrated();
    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().split('T')[0]!;
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]!);

    const { data, isLoading, refresh: loadData } = useSWRData(
        `finance_${startDate}_${endDate}`,
        async () => {
            const result = await getFinanceOverviewAction(startDate, endDate);
            return result.success ? result : null;
        },
        [startDate, endDate]
    );

    return (
        <div className="mailbox-wrapper">
            <div className="mailbox-main">
                <Topbar
                    searchTerm="" setSearchTerm={() => {}}
                    placeholder="Finance"
                    onSearch={() => {}} onClearSearch={() => {}}
                    leftContent={<h1 className="clients-page-title">Finance</h1>}
                    rightContent={
                        <div className="topbar-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                className="ncell-input" style={{ width: 140, height: 34 }} />
                            <span style={{ color: 'var(--text-secondary)' }}>to</span>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                                className="ncell-input" style={{ width: 140, height: 34 }} />
                        </div>
                    }
                />

                <div className="content-split content-split-bg">
                    <div className="list-panel list-panel-flex" style={{ padding: '1.5rem' }}>
                        <PageLoader isLoading={!isHydrated || isLoading} type="list" count={6}>
                            {data ? (
                                <>
                                    {/* KPI Cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                                        {[
                                            { label: 'Total Revenue', value: formatCurrency(data.stats?.totalRevenue), color: '#1a73e8' },
                                            { label: 'Paid', value: formatCurrency(data.stats?.paidRevenue), color: '#10B981' },
                                            { label: 'Outstanding', value: formatCurrency(data.stats?.pipelineValue), color: '#F59E0B' },
                                            { label: 'Avg Deal Size', value: formatCurrency(data.stats?.avgDealSize), color: '#8B5CF6' },
                                            { label: 'Collection Rate', value: data.stats?.collectionRate, color: '#06B6D4' },
                                            { label: 'Total Projects', value: data.stats?.totalProjects, color: '#6366F1' },
                                        ].map(kpi => (
                                            <div key={kpi.label} style={{
                                                background: 'var(--bg-secondary)', borderRadius: 12, padding: '1.25rem',
                                                border: '1px solid var(--border-subtle)'
                                            }}>
                                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>{kpi.label}</div>
                                                <div style={{ fontSize: 24, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Monthly Growth (MoM %) */}
                                    {Array.isArray(data.revenueByMonth) && data.revenueByMonth.length > 1 && (() => {
                                        const rows = data.revenueByMonth.map((r: any, i: number, arr: any[]) => {
                                            const prev = i > 0 ? arr[i - 1]?.revenue || 0 : 0;
                                            const cur = r.revenue || 0;
                                            const growth = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : 0;
                                            return { month: r.month, revenue: cur, growth };
                                        });
                                        const last = rows[rows.length - 1] || { month: '', revenue: 0, growth: 0 };
                                        const avg = rows.length > 1
                                            ? rows.slice(1).reduce((s: number, r: any) => s + r.growth, 0) / (rows.length - 1)
                                            : 0;
                                        return (
                                            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '1.25rem', border: '1px solid var(--border-subtle)', marginBottom: 24 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                    <div>
                                                        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Monthly Growth</h3>
                                                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                                                            Month-over-month revenue change. Avg {avg.toFixed(1)}% · Latest {last.growth.toFixed(1)}%
                                                        </p>
                                                    </div>
                                                    <span style={{
                                                        fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                                                        background: last.growth >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                        color: last.growth >= 0 ? '#10B981' : '#EF4444',
                                                    }}>
                                                        {last.growth >= 0 ? '▲' : '▼'} {Math.abs(last.growth).toFixed(1)}%
                                                    </span>
                                                </div>
                                                <ResponsiveContainer width="100%" height={180}>
                                                    <LineChart data={rows}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                                                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                                        <YAxis unit="%" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                                        <Tooltip formatter={(v: any) => `${v}%`} />
                                                        <ReferenceLine y={0} stroke="#94a3b8" />
                                                        <Line type="monotone" dataKey="growth" stroke="#1a73e8" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        );
                                    })()}

                                    {/* Charts Row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
                                        {/* Revenue by Month */}
                                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '1.25rem', border: '1px solid var(--border-subtle)' }}>
                                            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>Revenue by Month</h3>
                                            <ResponsiveContainer width="100%" height={250}>
                                                <BarChart data={data.revenueByMonth}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                                                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                                    <Tooltip />
                                                    <Bar dataKey="revenue" name="Total" fill="#1a73e8" radius={[4, 4, 0, 0]} />
                                                    <Bar dataKey="paid" name="Paid" fill="#10B981" radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Payment Breakdown Pie */}
                                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '1.25rem', border: '1px solid var(--border-subtle)' }}>
                                            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>Payment Status</h3>
                                            <ResponsiveContainer width="100%" height={250}>
                                                <PieChart>
                                                    <Pie data={data.paidBreakdown || []} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label>
                                                        {data.paidBreakdown?.map((entry: any, i: number) => (
                                                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                    <Legend />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Revenue by Agent */}
                                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '1.25rem', border: '1px solid var(--border-subtle)', marginBottom: 24 }}>
                                        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>Revenue by Agent</h3>
                                        <div className="notion-table">
                                            <div className="notion-header">
                                                <div className="notion-cell" style={{ flex: 2 }}>Agent</div>
                                                <div className="notion-cell" style={{ flex: 1 }}>Revenue</div>
                                                <div className="notion-cell" style={{ flex: 1 }}>Projects</div>
                                            </div>
                                            <div className="notion-body">
                                                {(data.revenueByAgent || []).map((agent: any) => (
                                                    <div key={agent.name} className="notion-row">
                                                        <div className="notion-cell" style={{ flex: 2 }}>{agent.name}</div>
                                                        <div className="notion-cell" style={{ flex: 1, color: '#10B981', fontWeight: 600 }}>{formatCurrency(agent.revenue || 0)}</div>
                                                        <div className="notion-cell" style={{ flex: 1 }}>{agent.projects}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Outstanding Payments */}
                                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '1.25rem', border: '1px solid var(--border-subtle)' }}>
                                        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
                                            Outstanding Payments
                                            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                                                Aging: {data.aging.current} current, {data.aging.days8to30} (8-30d), {data.aging.days30plus} (30d+)
                                            </span>
                                        </h3>
                                        <div className="notion-table">
                                            <div className="notion-header">
                                                <div className="notion-cell" style={{ flex: 2 }}>Project</div>
                                                <div className="notion-cell" style={{ flex: 2 }}>Client</div>
                                                <div className="notion-cell" style={{ flex: 1 }}>Value</div>
                                                <div className="notion-cell" style={{ flex: 1 }}>Days Overdue</div>
                                            </div>
                                            <div className="notion-body">
                                                {(data.outstanding || []).slice(0, 20).map((item: any, i: number) => (
                                                    <div key={i} className="notion-row">
                                                        <div className="notion-cell" style={{ flex: 2 }}>{item.projectName}</div>
                                                        <div className="notion-cell" style={{ flex: 2 }}>{item.clientName || 'Unknown'}</div>
                                                        <div className="notion-cell" style={{ flex: 1, color: '#EF4444', fontWeight: 600 }}>{formatCurrency(item.value || 0)}</div>
                                                        <div className="notion-cell" style={{ flex: 1 }}>
                                                            <span className={`notion-badge ${item.daysOverdue > 30 ? 'badge-red' : item.daysOverdue > 7 ? 'badge-yellow' : 'badge-green'}`}>
                                                                {item.daysOverdue > 0 ? `${item.daysOverdue}d` : 'Current'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                                {(data.outstanding || []).length === 0 && (
                                                    <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
                                                        <div className="empty-state-title">No outstanding payments</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="empty-state">
                                    <div className="empty-state-title">No finance data available</div>
                                </div>
                            )}
                        </PageLoader>
                    </div>
                </div>
            </div>
        </div>
    );
}
