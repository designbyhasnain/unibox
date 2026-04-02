'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSalesDashboardAction } from '../../src/actions/dashboardActions';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
}

export default function SalesDashboard() {
    const isHydrated = useHydrated();
    const [userName, setUserName] = useState('');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            getCurrentUserAction(),
            getSalesDashboardAction(),
        ]).then(([user, dashboard]) => {
            setUserName(user?.name?.split(' ')[0] || 'there');
            setData(dashboard);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    if (!isHydrated || loading) return <PageLoader isLoading={true} type="grid" count={4}><div /></PageLoader>;

    const stats = data?.stats || { sent: 0, replies: 0, newLeads: 0, openRate: 0 };
    const hotLeads = data?.hotLeads || [];
    const activity = data?.recentActivity || [];
    const followUpsDue = data?.followUpsDue || 0;

    const card: React.CSSProperties = {
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '20px 24px',
    };

    return (
        <div style={{ padding: '32px 40px', maxWidth: 960 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>
                {getGreeting()}, {userName}!
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28 }}>
                Here&apos;s your sales overview for this week.
            </p>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
                {[
                    { n: stats.sent, l: 'Emails Sent' },
                    { n: stats.replies, l: 'Replies' },
                    { n: stats.newLeads, l: 'New Leads' },
                    { n: stats.openRate + '%', l: 'Open Rate' },
                ].map(s => (
                    <div key={s.l} style={card}>
                        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{s.n}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>{s.l}</div>
                    </div>
                ))}
            </div>

            {/* Priority Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
                {[
                    { emoji: '\ud83d\udd25', n: hotLeads.length, l: 'Hot Leads' },
                    { emoji: '\ud83d\udce7', n: followUpsDue, l: 'Follow-ups Due' },
                    { emoji: '\ud83c\udd95', n: stats.newLeads, l: 'New This Week' },
                ].map(c => (
                    <Link key={c.l} href="/clients" style={{ ...card, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{ fontSize: 28 }}>{c.emoji}</span>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{c.n}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.l}</div>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Two Column */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div style={card}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Hot Leads</div>
                    {hotLeads.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hot leads right now.</p>
                    ) : hotLeads.map((lead: any) => (
                        <Link key={lead.id} href={'/clients/' + lead.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none',
                        }}>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{lead.name || lead.email}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lead.email}</div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: '#fef3c7', color: '#92400e' }}>
                                {lead.open_count} opens
                            </span>
                        </Link>
                    ))}
                </div>

                <div style={card}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Recent Activity</div>
                    {activity.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No recent activity.</p>
                    ) : activity.map((item: any) => (
                        <div key={item.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 0', borderBottom: '1px solid var(--border)',
                        }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.direction === 'RECEIVED' ? item.contactName + ' replied' : 'You emailed ' + item.contactName}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject}</div>
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 8 }}>{timeAgo(item.sentAt)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
