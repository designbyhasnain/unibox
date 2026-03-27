'use client';

import React from 'react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const COLORS = ['#1a73e8', '#137333', '#f9ab00', '#c5221f', '#8430ce', '#6B7280'];

const STATUS_LABELS: Record<string, string> = {
    PENDING: 'Pending',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    STOPPED: 'Stopped',
    BOUNCED: 'Bounced',
    UNSUBSCRIBED: 'Unsubscribed',
};

export default function CampaignCharts({ analytics }: { analytics: any }) {
    if (!analytics) return null;

    const { dailySends, stepPerformance, contactStatusDistribution } = analytics;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Daily Sends */}
            <div style={{
                background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', padding: '1.25rem',
                gridColumn: '1 / -1',
            }}>
                <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>
                    Daily Sends
                </h3>
                {dailySends && dailySends.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={dailySends}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                            <Tooltip
                                contentStyle={{
                                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                    borderRadius: '8px', fontSize: '12px',
                                }}
                            />
                            <Line type="monotone" dataKey="count" stroke="#1a73e8" strokeWidth={2} dot={{ r: 3 }} name="Emails Sent" />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                        No send data yet
                    </div>
                )}
            </div>

            {/* Step Performance */}
            <div style={{
                background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', padding: '1.25rem',
            }}>
                <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>
                    Step-by-Step Open Rates
                </h3>
                {stepPerformance && stepPerformance.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={stepPerformance}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis
                                dataKey="stepNumber"
                                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                                tickFormatter={v => `Step ${v}`}
                            />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} unit="%" />
                            <Tooltip
                                contentStyle={{
                                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                    borderRadius: '8px', fontSize: '12px',
                                }}
                                formatter={(value: any) => [`${value}%`, 'Open Rate']}
                            />
                            <Bar dataKey="openRate" fill="#1a73e8" radius={[4, 4, 0, 0]} name="Open Rate" />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                        No step data yet
                    </div>
                )}
            </div>

            {/* Contact Status Distribution */}
            <div style={{
                background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', padding: '1.25rem',
            }}>
                <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>
                    Contact Status
                </h3>
                {contactStatusDistribution && contactStatusDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie
                                data={contactStatusDistribution.map((d: any) => ({
                                    ...d,
                                    name: STATUS_LABELS[d.status] || d.status,
                                }))}
                                dataKey="count"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                label={(props: any) => `${props.name} ${((props.percent || 0) * 100).toFixed(0)}%`}
                            >
                                {contactStatusDistribution.map((_: any, index: number) => (
                                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                    borderRadius: '8px', fontSize: '12px',
                                }}
                            />
                            <Legend
                                wrapperStyle={{ fontSize: '11px' }}
                                formatter={(value) => <span style={{ color: 'var(--text-secondary)' }}>{value}</span>}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                        No contacts enrolled yet
                    </div>
                )}
            </div>
        </div>
    );
}
