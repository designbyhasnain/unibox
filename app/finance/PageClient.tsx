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

const COLORS = ['var(--coach)', 'var(--warn)', 'var(--danger)'];

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
        <div style={{ height: '100%', overflow: 'auto', background: 'var(--shell)', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>
            <div style={{ padding: '22px 26px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 18 }}>
                    <div>
                        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>Revenue &amp; invoices</h2>
                        <div style={{ color: 'var(--ink-muted)', fontSize: 13, marginTop: 4 }}>Financial overview · filter by date range</div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--hairline-soft)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12, fontFamily: 'var(--font-ui)' }} />
                    <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>to</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--hairline-soft)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12, fontFamily: 'var(--font-ui)' }} />
                </div>

                <PageLoader isLoading={!isHydrated || isLoading} type="list" count={6}>
                            {data ? (
                                <>
                                    {/* KPI Cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                                        {[
                                            { label: 'Total Revenue', value: formatCurrency(data.stats?.totalRevenue), color: 'var(--accent)' },
                                            { label: 'Paid', value: formatCurrency(data.stats?.paidRevenue), color: 'var(--coach)' },
                                            { label: 'Outstanding', value: formatCurrency(data.stats?.pipelineValue), color: 'var(--warn)' },
                                            { label: 'Avg Deal Size', value: formatCurrency(data.stats?.avgDealSize), color: 'var(--accent)' },
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
                                                        color: last.growth >= 0 ? 'var(--coach)' : 'var(--danger)',
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
                                                        <ReferenceLine y={0} stroke="var(--ink-faint)" />
                                                        <Line type="monotone" dataKey="growth" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
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
                                                    <Bar dataKey="revenue" name="Total" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                                                    <Bar dataKey="paid" name="Paid" fill="var(--coach)" radius={[4, 4, 0, 0]} />
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
                                                        <div className="notion-cell" style={{ flex: 1, color: 'var(--coach)', fontWeight: 600 }}>{formatCurrency(agent.revenue || 0)}</div>
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
                                                        <div className="notion-cell" style={{ flex: 1, color: 'var(--danger)', fontWeight: 600 }}>{formatCurrency(item.value || 0)}</div>
                                                        <div className="notion-cell" style={{ flex: 1 }}>
                                                            <span className={`notion-badge ${item.daysOverdue > 30 ? 'badge-red' : item.daysOverdue > 7 ? 'badge-yellow' : 'badge-green'}`}>
                                                                {item.daysOverdue > 0 ? `${item.daysOverdue}d` : 'Current'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                                {(data.outstanding || []).length === 0 && (
                                                    <div className="empty-state-v2">
                                                        <div className="empty-illu" aria-hidden="true" style={{ background: 'var(--coach-soft)', color: 'var(--coach)', borderColor: 'var(--coach)' }}>
                                                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                                        </div>
                                                        <h3>All paid up</h3>
                                                        <p>No outstanding invoices right now. Every closed deal has been paid.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="empty-state-v2">
                                    <div className="empty-illu" aria-hidden="true">
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                                    </div>
                                    <h3>No finance data yet</h3>
                                    <p>Your revenue summary, collections, and outstanding balances will appear here once projects are linked to payments.</p>
                                    <a href="/projects" className="empty-cta" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Go to Projects</a>
                                </div>
                            )}
                        </PageLoader>
            </div>
        </div>
    );
}
