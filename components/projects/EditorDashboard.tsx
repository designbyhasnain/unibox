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
    if (diff <= 3) return `${formatted} (${diff}d)`;
    return formatted;
}

export default function EditorDashboard() {
    const [stats, setStats] = useState<EditorStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getEditorDashboardStats().then(s => { setStats(s); setLoading(false); });
    }, []);

    if (loading || !stats) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#9ca3af' }}>
                Loading dashboard...
            </div>
        );
    }

    const maxBarCount = Math.max(...stats.weeklyCompleted.map(w => w.count), 1);

    return (
        <div style={{ maxWidth: '820px', margin: '0 auto', padding: '40px 24px' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Dashboard</h1>
                <p style={{ fontSize: '14px', color: '#9ca3af' }}>Your editing workload at a glance.</p>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '36px' }}>
                {([
                    { label: 'Assigned', value: stats.assigned, color: '#3b82f6', bg: '#eff6ff' },
                    { label: 'In Progress', value: stats.inProgress, color: '#d97706', bg: '#fffbeb' },
                    { label: 'In Review', value: stats.inReview, color: '#7c3aed', bg: '#f5f3ff' },
                    { label: 'Completed', value: stats.done, color: '#059669', bg: '#ecfdf5' },
                ] as const).map(kpi => (
                    <div key={kpi.label} style={{
                        padding: '20px', borderRadius: '10px', border: '1px solid #f3f4f6',
                        background: 'white',
                    }}>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {kpi.label}
                        </div>
                        <div style={{ fontSize: '32px', fontWeight: 700, color: kpi.color }}>
                            {kpi.value}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Priority Deadlines */}
                <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #f3f4f6', padding: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>Priority Deadlines</h3>
                    {stats.deadlines.length === 0 ? (
                        <p style={{ fontSize: '13px', color: '#9ca3af' }}>No upcoming deadlines.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {stats.deadlines.map(d => {
                                const sc = STATUS_COLORS[d.progress] || { color: '#6b7280', bg: '#f3f4f6' };
                                const due = new Date(d.dueDate);
                                const daysLeft = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                                const urgent = daysLeft <= 2;
                                return (
                                    <div key={d.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '10px 12px', borderRadius: '6px',
                                        background: urgent ? '#fef2f2' : '#fafafa',
                                        border: urgent ? '1px solid #fecaca' : '1px solid #f3f4f6',
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>{d.name}</div>
                                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>{d.pseudonym}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{
                                                fontSize: '11px', fontWeight: 600, color: urgent ? '#dc2626' : '#374151',
                                            }}>
                                                {formatDueDate(d.dueDate)}
                                            </div>
                                            <span style={{
                                                fontSize: '10px', fontWeight: 600, padding: '1px 6px',
                                                borderRadius: '3px', color: sc.color, background: sc.bg,
                                            }}>
                                                {d.progress.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Weekly Completed Chart */}
                <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #f3f4f6', padding: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>Projects Completed</h3>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '160px', paddingTop: '8px' }}>
                        {stats.weeklyCompleted.map(w => (
                            <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                                    {w.count}
                                </div>
                                <div style={{
                                    width: '100%', maxWidth: '48px',
                                    height: `${Math.max(8, (w.count / maxBarCount) * 120)}px`,
                                    background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
                                    borderRadius: '6px 6px 2px 2px',
                                    transition: 'height 0.3s ease',
                                }} />
                                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px', whiteSpace: 'nowrap' }}>
                                    {w.week}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', marginTop: '12px' }}>
                        Last 4 weeks
                    </div>
                </div>
            </div>
        </div>
    );
}
