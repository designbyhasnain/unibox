'use client';

import { useState, useEffect } from 'react';
import { getEditorDashboardStats, type EditorStats } from '../../lib/projects/editorStats';

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
    IN_PROGRESS: { color: '#d97706', bg: '#fffbeb' },
    DOWNLOADED: { color: '#2563eb', bg: '#eff6ff' },
    DOWNLOADING: { color: '#2563eb', bg: '#eff6ff' },
    IN_REVIEW: { color: '#7c3aed', bg: '#f5f3ff' },
    REVISION: { color: '#dc2626', bg: '#fef2f2' },
    ON_HOLD: { color: '#6b7280', bg: '#f3f4f6' },
    NOT_STARTED: { color: '#6b7280', bg: '#f3f4f6' },
};

function formatDueDate(d: string): string {
    const due = new Date(d);
    const now = new Date();
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const formatted = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (diff < 0) return `${formatted} (overdue)`;
    if (diff === 0) return `${formatted} (today)`;
    if (diff === 1) return `${formatted} (tomorrow)`;
    if (diff <= 3) return `${formatted} (${diff}d left)`;
    return formatted;
}

export default function EditorDashboard() {
    const [stats, setStats] = useState<EditorStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getEditorDashboardStats().then(s => { setStats(s); setLoading(false); });
    }, []);

    if (loading || !stats) {
        return <div className="ep-loading">Loading dashboard...</div>;
    }

    const maxBarCount = Math.max(...stats.weeklyCompleted.map(w => w.count), 1);

    return (
        <div className="ep-page">
            <div className="ep-page-header">
                <h1 className="ep-page-title">Dashboard</h1>
                <p className="ep-page-desc">Your editing workload at a glance.</p>
            </div>

            {/* KPI Cards — full-width grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px', padding: '0 0 24px 0', borderBottom: '1px solid #e5e7eb' }}>
                {([
                    { label: 'Total Assigned', value: stats.assigned, color: '#3b82f6', icon: '📋' },
                    { label: 'In Progress', value: stats.inProgress, color: '#d97706', icon: '⚡' },
                    { label: 'In Review', value: stats.inReview, color: '#7c3aed', icon: '👁' },
                    { label: 'Completed', value: stats.done, color: '#059669', icon: '✓' },
                ] as const).map(kpi => (
                    <div key={kpi.label} style={{
                        padding: '20px 24px', borderRadius: '10px', border: '1px solid #e5e7eb',
                        background: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                                {kpi.label}
                            </div>
                            <div style={{ fontSize: '36px', fontWeight: 700, color: kpi.color, lineHeight: 1 }}>
                                {kpi.value}
                            </div>
                        </div>
                        <div style={{ fontSize: '28px', opacity: 0.7 }}>{kpi.icon}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Priority Deadlines — professional table */}
                <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', fontWeight: 700, color: '#111827' }}>
                        Priority Deadlines
                    </div>
                    {stats.deadlines.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No upcoming deadlines</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f9fafb' }}>
                                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project</th>
                                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                                    <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.deadlines.map(d => {
                                    const sc = STATUS_COLORS[d.progress] || { color: '#6b7280', bg: '#f3f4f6' };
                                    const daysLeft = Math.ceil((new Date(d.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                                    const urgent = daysLeft <= 2;
                                    return (
                                        <tr key={d.id} style={{ borderBottom: '1px solid #f3f4f6', background: urgent ? '#fef2f2' : 'white' }}>
                                            <td style={{ padding: '10px 16px' }}>
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>{d.name}</div>
                                                <div style={{ fontSize: '10px', color: '#9ca3af' }}>{d.pseudonym}</div>
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '3px', color: sc.color, background: sc.bg }}>
                                                    {d.progress.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '12px', fontWeight: urgent ? 600 : 400, color: urgent ? '#dc2626' : '#374151' }}>
                                                {formatDueDate(d.dueDate)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Weekly Completed Chart — full height */}
                <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', fontWeight: 700, color: '#111827' }}>
                        Projects Completed — Last 4 Weeks
                    </div>
                    <div style={{ padding: '24px 20px', display: 'flex', alignItems: 'flex-end', gap: '16px', height: '220px' }}>
                        {stats.weeklyCompleted.map(w => (
                            <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>{w.count}</div>
                                <div style={{
                                    width: '100%', maxWidth: '60px',
                                    height: `${Math.max(12, (w.count / maxBarCount) * 140)}px`,
                                    background: 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)',
                                    borderRadius: '6px 6px 2px 2px',
                                }} />
                                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px', fontWeight: 500 }}>{w.week}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
