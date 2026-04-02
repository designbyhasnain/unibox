'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSalesDashboardAction } from '../../src/actions/dashboardActions';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return { text: 'Good morning', emoji: '\u2600\uFE0F' };
    if (h < 17) return { text: 'Good afternoon', emoji: '\uD83C\uDF24\uFE0F' };
    return { text: 'Good evening', emoji: '\uD83C\uDF19' };
}

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
}

function formatDate() {
    return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function initialsColor(name: string) {
    const colors = ['#2563eb', '#7c3aed', '#dc2626', '#d97706', '#16a34a', '#0891b2', '#be185d', '#4f46e5'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

const QUOTES = [
    'Every no gets you closer to a yes. Keep dialing. \u2014 Grant Cardone',
    'Follow up or fail. 80% of sales happen after the 5th contact.',
    'The difference between try and triumph is just a little umph.',
    'Success is the sum of small efforts repeated day in and day out.',
    'Your attitude, not your aptitude, determines your altitude. \u2014 Zig Ziglar',
    'Wake up with determination. Go to bed with satisfaction.',
    'Champions keep playing until they get it right.',
];

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

    const greeting = getGreeting();
    const perfScore = Math.min(100, Math.round(
        (stats.openRate + (stats.sent > 0 ? (stats.replies / stats.sent) * 100 : 0)) / 2
    ));
    const perfColor = perfScore > 60 ? '#16a34a' : perfScore > 30 ? '#d97706' : '#dc2626';
    const dailyQuote = QUOTES[new Date().getDate() % QUOTES.length];

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800&family=DM+Mono:wght@400;500&display=swap');
                .dash { font-family: 'DM Sans', system-ui, sans-serif; padding: 0 40px 40px; max-width: 1120px; }
                .dash-mono { font-family: 'DM Mono', monospace; }
                @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
                .dash-anim-1 { animation: slideUp .4s ease both; }
                .dash-anim-2 { animation: slideUp .4s ease both; animation-delay: 50ms; }
                .dash-anim-3 { animation: slideUp .4s ease both; animation-delay: 100ms; }
                .dash-anim-4 { animation: slideUp .4s ease both; animation-delay: 150ms; }
                .dash-anim-5 { animation: slideUp .4s ease both; animation-delay: 250ms; }
                .dash-anim-6 { animation: slideUp .4s ease both; animation-delay: 350ms; }
                .dash-anim-7 { animation: slideUp .4s ease both; animation-delay: 450ms; }
                .dash-anim-8 { animation: fadeIn .5s ease both; animation-delay: 600ms; }
                .dash-card { background: #fff; border: 1px solid #f0f0f0; border-radius: 12px; padding: 20px 24px; transition: box-shadow .15s, transform .15s; }
                .dash-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.06); transform: translateY(-1px); }
                .dash-stat { border-left: 3px solid; }
                .dash-lead-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; text-decoration: none; transition: background .12s, border-left .12s; border-left: 3px solid transparent; }
                .dash-lead-row:hover { background: #f8fafc; border-left-color: #2563eb; }
                .dash-activity-row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f5f5f5; }
                .dash-activity-row:last-child { border-bottom: none; }
                .dash-priority { transition: box-shadow .15s, transform .15s; cursor: pointer; text-decoration: none; display: flex; align-items: center; gap: 16px; }
                .dash-priority:hover { box-shadow: 0 4px 20px rgba(0,0,0,.06); transform: translateY(-1px); }
                .dash-pulse { animation: pulse 2s ease-in-out infinite; }
                .dash-perf-ring { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
            `}</style>

            <div className="dash">
                {/* ── HEADER ── */}
                <div className="dash-anim-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '32px 0 28px' }}>
                    <div>
                        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.02em' }}>
                            {greeting.emoji} {greeting.text}, {userName}
                        </h1>
                        <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 4, fontWeight: 500 }}>
                            Your sales overview &mdash; {formatDate()}
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="dash-perf-ring" style={{
                            background: `conic-gradient(${perfColor} ${perfScore * 3.6}deg, #f1f5f9 0deg)`,
                        }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: '50%', background: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <span className="dash-mono" style={{ fontSize: 16, fontWeight: 700, color: perfColor }}>{perfScore}</span>
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Performance</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Score</div>
                        </div>
                    </div>
                </div>

                {/* ── STATS ROW ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                    {[
                        { n: stats.sent, l: 'EMAILS SENT', color: '#2563eb', delay: 'dash-anim-1' },
                        { n: stats.replies, l: 'REPLIES', color: '#16a34a', delay: 'dash-anim-2' },
                        { n: stats.newLeads, l: 'NEW LEADS', color: '#7c3aed', delay: 'dash-anim-3' },
                        { n: stats.openRate + '%', l: 'OPEN RATE', color: '#d97706', delay: 'dash-anim-4' },
                    ].map(s => (
                        <div key={s.l} className={`dash-card dash-stat ${s.delay}`} style={{ borderLeftColor: s.color }}>
                            <div className="dash-mono" style={{ fontSize: 40, fontWeight: 700, color: '#0f172a', lineHeight: 1, letterSpacing: '-.03em' }}>{s.n}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 8, fontWeight: 600, letterSpacing: '.08em' }}>{s.l}</div>
                        </div>
                    ))}
                </div>

                {/* ── PRIORITY STRIP ── */}
                <div className="dash-anim-5" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                    {/* Hot Leads */}
                    <Link href="/clients" className="dash-card dash-priority" style={{
                        background: hotLeads.length > 0 ? 'linear-gradient(135deg, #fef2f2, #fff)' : '#fff',
                        borderColor: hotLeads.length > 0 ? '#fecaca' : '#f0f0f0',
                    }}>
                        <span style={{ fontSize: 36 }}>{'\uD83D\uDD25'}</span>
                        <div style={{ flex: 1 }}>
                            <div className={`dash-mono ${hotLeads.length > 0 ? 'dash-pulse' : ''}`} style={{
                                fontSize: 28, fontWeight: 700,
                                color: hotLeads.length > 0 ? '#dc2626' : '#94a3b8',
                            }}>{hotLeads.length}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Hot Leads</div>
                        </div>
                        {hotLeads.length > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 700, background: '#dc2626', color: '#fff', padding: '3px 8px', borderRadius: 4, letterSpacing: '.05em' }}>
                                ACTION NEEDED
                            </span>
                        )}
                    </Link>

                    {/* Follow-ups Due */}
                    <Link href="/clients" className="dash-card dash-priority" style={{
                        background: followUpsDue > 0 ? 'linear-gradient(135deg, #fffbeb, #fff)' : '#fff',
                        borderColor: followUpsDue > 0 ? '#fde68a' : '#f0f0f0',
                    }}>
                        <span style={{ fontSize: 36 }}>{'\uD83D\uDCE7'}</span>
                        <div style={{ flex: 1 }}>
                            <div className="dash-mono" style={{
                                fontSize: 28, fontWeight: 700,
                                color: followUpsDue > 0 ? '#d97706' : '#94a3b8',
                            }}>{followUpsDue}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Follow-ups Due</div>
                        </div>
                        {followUpsDue > 0 ? (
                            <span style={{ fontSize: 9, fontWeight: 700, background: '#d97706', color: '#fff', padding: '3px 8px', borderRadius: 4, letterSpacing: '.05em' }}>
                                OVERDUE
                            </span>
                        ) : (
                            <span style={{ fontSize: 9, fontWeight: 700, background: '#16a34a', color: '#fff', padding: '3px 8px', borderRadius: 4 }}>
                                {'\u2713'} ALL CLEAR
                            </span>
                        )}
                    </Link>

                    {/* New This Week */}
                    <Link href="/clients" className="dash-card dash-priority" style={{
                        background: stats.newLeads > 0 ? 'linear-gradient(135deg, #f0fdf4, #fff)' : '#fff',
                        borderColor: stats.newLeads > 0 ? '#bbf7d0' : '#f0f0f0',
                    }}>
                        <span style={{ fontSize: 36 }}>{'\uD83C\uDD95'}</span>
                        <div style={{ flex: 1 }}>
                            <div className="dash-mono" style={{
                                fontSize: 28, fontWeight: 700,
                                color: stats.newLeads > 0 ? '#16a34a' : '#94a3b8',
                            }}>{stats.newLeads}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>New This Week</div>
                        </div>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{'\u2192'}</span>
                    </Link>
                </div>

                {/* ── TWO COLUMN ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, marginBottom: 28 }}>
                    {/* Hot Leads */}
                    <div className="dash-card dash-anim-6" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px 14px', borderBottom: '1px solid #f5f5f5' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 16 }}>{'\uD83D\uDD25'}</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Hot Leads</span>
                            </div>
                            {hotLeads.length > 0 && (
                                <span style={{ fontSize: 11, fontWeight: 700, background: '#fef2f2', color: '#dc2626', padding: '2px 10px', borderRadius: 20 }}>
                                    {hotLeads.length}
                                </span>
                            )}
                        </div>
                        <div style={{ padding: '8px 12px 12px' }}>
                            {hotLeads.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '32px 20px' }}>
                                    <div style={{ fontSize: 36, marginBottom: 8 }}>{'\uD83C\uDFAF'}</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 4 }}>No hot leads yet</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                                        Keep sending emails &mdash; your first hot lead will appear here
                                    </div>
                                </div>
                            ) : hotLeads.map((lead: any) => (
                                <Link key={lead.id} href={'/clients/' + lead.id} className="dash-lead-row">
                                    <div style={{
                                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                                        background: initialsColor(lead.name || lead.email),
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', fontSize: 12, fontWeight: 700,
                                    }}>
                                        {getInitials(lead.name || lead.email)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name || lead.email}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.email}</div>
                                    </div>
                                    <span style={{
                                        fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                                        background: '#fef3c7', color: '#92400e', whiteSpace: 'nowrap',
                                        display: 'flex', alignItems: 'center', gap: 3,
                                    }}>
                                        {lead.open_count} opens {'\uD83D\uDD25'}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Recent Activity */}
                    <div className="dash-card dash-anim-7" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16 }}>{'\u26A1'}</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Recent Activity</span>
                        </div>
                        <div style={{ padding: '8px 20px 16px' }}>
                            {activity.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '32px 20px' }}>
                                    <div style={{ fontSize: 36, marginBottom: 8 }}>{'\uD83D\uDCEC'}</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 4 }}>No recent activity</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Send your first email to get started</div>
                                </div>
                            ) : activity.map((item: any) => {
                                const isReceived = item.direction === 'RECEIVED';
                                return (
                                    <div key={item.id} className="dash-activity-row" style={{
                                        borderLeft: isReceived ? '3px solid #16a34a' : '3px solid transparent',
                                        paddingLeft: 10,
                                    }}>
                                        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
                                            {isReceived ? '\uD83D\uDCE5' : '\uD83D\uDCE4'}
                                        </span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {isReceived ? item.contactName + ' replied' : 'You emailed ' + item.contactName}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject}</div>
                                        </div>
                                        <span style={{ fontSize: 10, color: '#cbd5e1', whiteSpace: 'nowrap', fontWeight: 500, marginTop: 2 }}>{timeAgo(item.sentAt)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ── MOTIVATIONAL STRIP ── */}
                <div className="dash-anim-8" style={{
                    background: '#f8faff', border: '1px solid #e0e7ff', borderRadius: 12,
                    padding: '20px 28px', textAlign: 'center',
                }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', letterSpacing: '.08em', marginBottom: 6 }}>
                        {'\uD83D\uDCA1'} DAILY MOTIVATION
                    </div>
                    <div style={{ fontSize: 14, color: '#4338ca', fontStyle: 'italic', fontWeight: 500, lineHeight: 1.6 }}>
                        &ldquo;{dailyQuote}&rdquo;
                    </div>
                </div>
            </div>
        </>
    );
}
