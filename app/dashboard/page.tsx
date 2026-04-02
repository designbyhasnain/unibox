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

    const px = '0 48px';

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800&family=DM+Mono:wght@400;500&display=swap');
                .dash { font-family: 'DM Sans', system-ui, sans-serif; background: #f8fafc; min-height: 100%; }
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
                .dash-card { background: #fff; border-radius: 12px; transition: box-shadow .15s, transform .15s; box-shadow: 0 2px 8px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04); }
                .dash-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04); transform: translateY(-2px); }
                .dash-stat { border-left: 3px solid; min-height: 140px; display: flex; flex-direction: column; justify-content: center; padding: 24px 28px; }
                .dash-lead-row { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 8px; text-decoration: none; transition: background .12s, border-left .12s; border-left: 3px solid transparent; margin: 0 4px; }
                .dash-lead-row:hover { background: #f8fafc; border-left-color: #2563eb; }
                .dash-activity-row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f5f5f5; }
                .dash-activity-row:last-child { border-bottom: none; }
                .dash-priority { transition: box-shadow .15s, transform .15s; cursor: pointer; text-decoration: none; display: flex; align-items: center; gap: 16px; min-height: 100px; padding: 24px 28px; }
                .dash-priority:hover { box-shadow: 0 8px 28px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04); transform: translateY(-2px); }
                .dash-pulse { animation: pulse 2s ease-in-out infinite; }
                .dash-perf-ring { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
            `}</style>

            <div className="dash">
                {/* ── HEADER ── */}
                <div className="dash-anim-1" style={{
                    background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 60%, #fef9ee 100%)',
                    borderBottom: '1px solid #e2e8f0',
                    padding: '36px 48px 32px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div>
                        <h1 style={{ fontSize: 36, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.02em' }}>
                            {greeting.emoji} {greeting.text}, {userName}
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                            <p style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500, margin: 0 }}>
                                Your sales overview &mdash; {formatDate()}
                            </p>
                            <span style={{ fontSize: 10, fontWeight: 700, background: '#2563eb', color: '#fff', padding: '2px 10px', borderRadius: 20, letterSpacing: '.04em' }}>
                                THIS WEEK
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div className="dash-perf-ring" style={{
                            background: `conic-gradient(${perfColor} ${perfScore * 3.6}deg, #e2e8f0 0deg)`,
                        }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: '50%', background: '#fff',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                            }}>
                                <span className="dash-mono" style={{ fontSize: 22, fontWeight: 700, color: perfColor, lineHeight: 1 }}>{perfScore}</span>
                                <span style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600, letterSpacing: '.04em' }}>/ 100</span>
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Performance</div>
                            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>Score</div>
                        </div>
                    </div>
                </div>

                {/* ── STATS ROW ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, padding: px, marginTop: 24, marginBottom: 24 }}>
                    {[
                        { n: stats.sent, l: 'EMAILS SENT', color: '#2563eb', bg: 'linear-gradient(135deg, #eff6ff, #fff)', icon: '\uD83D\uDCE4', delay: 'dash-anim-1' },
                        { n: stats.replies, l: 'REPLIES', color: '#16a34a', bg: 'linear-gradient(135deg, #f0fdf4, #fff)', icon: '\uD83D\uDCAC', delay: 'dash-anim-2' },
                        { n: stats.newLeads, l: 'NEW LEADS', color: '#7c3aed', bg: 'linear-gradient(135deg, #faf5ff, #fff)', icon: '\uD83D\uDC64', delay: 'dash-anim-3' },
                        { n: stats.openRate + '%', l: 'OPEN RATE', color: '#d97706', bg: 'linear-gradient(135deg, #fffbeb, #fff)', icon: '\uD83D\uDC41\uFE0F', delay: 'dash-anim-4' },
                    ].map(s => (
                        <div key={s.l} className={`dash-card dash-stat ${s.delay}`} style={{ borderLeftColor: s.color, background: s.bg }}>
                            <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                            <div className="dash-mono" style={{ fontSize: 48, fontWeight: 700, color: '#0f172a', lineHeight: 1, letterSpacing: '-.04em' }}>{s.n}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 10, fontWeight: 600, letterSpacing: '.08em' }}>{s.l}</div>
                        </div>
                    ))}
                </div>

                {/* ── PRIORITY STRIP ── */}
                <div className="dash-anim-5" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: px, marginBottom: 24 }}>
                    <Link href="/clients" className="dash-card dash-priority" style={{
                        background: hotLeads.length > 0 ? 'linear-gradient(135deg, #fff1f2, #fff)' : '#f8fafc',
                        borderColor: hotLeads.length > 0 ? '#fecaca' : 'transparent',
                    }}>
                        <span style={{ fontSize: 36 }}>{'\uD83D\uDD25'}</span>
                        <div style={{ flex: 1 }}>
                            <div className={`dash-mono ${hotLeads.length > 0 ? 'dash-pulse' : ''}`} style={{
                                fontSize: 36, fontWeight: 700,
                                color: hotLeads.length > 0 ? '#dc2626' : '#94a3b8',
                            }}>{hotLeads.length}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Hot Leads</div>
                        </div>
                        {hotLeads.length > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 700, background: '#dc2626', color: '#fff', padding: '4px 10px', borderRadius: 4, letterSpacing: '.05em' }}>
                                {'\uD83D\uDD25'} ACTION NEEDED
                            </span>
                        )}
                    </Link>

                    <Link href="/clients" className="dash-card dash-priority" style={{
                        background: followUpsDue > 0 ? 'linear-gradient(135deg, #fffbeb, #fff)' : 'linear-gradient(135deg, #f0fdf4, #fff)',
                    }}>
                        <span style={{ fontSize: 36 }}>{'\uD83D\uDCE7'}</span>
                        <div style={{ flex: 1 }}>
                            <div className="dash-mono" style={{
                                fontSize: 36, fontWeight: 700,
                                color: followUpsDue > 0 ? '#d97706' : '#16a34a',
                            }}>{followUpsDue}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Follow-ups Due</div>
                        </div>
                        {followUpsDue > 0 ? (
                            <span style={{ fontSize: 9, fontWeight: 700, background: '#d97706', color: '#fff', padding: '4px 10px', borderRadius: 4, letterSpacing: '.05em' }}>
                                {'\u26A0\uFE0F'} OVERDUE
                            </span>
                        ) : (
                            <span style={{ fontSize: 9, fontWeight: 700, background: '#16a34a', color: '#fff', padding: '4px 10px', borderRadius: 4, letterSpacing: '.05em' }}>
                                {'\u2713'} ALL CLEAR
                            </span>
                        )}
                    </Link>

                    <Link href="/clients" className="dash-card dash-priority" style={{
                        background: stats.newLeads > 0 ? 'linear-gradient(135deg, #faf5ff, #fff)' : '#f8fafc',
                    }}>
                        <span style={{ fontSize: 36 }}>{'\uD83C\uDD95'}</span>
                        <div style={{ flex: 1 }}>
                            <div className="dash-mono" style={{
                                fontSize: 36, fontWeight: 700,
                                color: stats.newLeads > 0 ? '#7c3aed' : '#94a3b8',
                            }}>{stats.newLeads}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>New This Week</div>
                        </div>
                        <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>{'\u2192'} View</span>
                    </Link>
                </div>

                {/* ── TWO COLUMN ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '58fr 42fr', gap: 20, padding: px, marginBottom: 28 }}>
                    {/* Hot Leads */}
                    <div className="dash-card dash-anim-6" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '14px 20px', borderLeft: '4px solid #dc2626', background: '#fff1f2',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 16 }}>{'\uD83D\uDD25'}</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Hot Leads</span>
                            </div>
                            {hotLeads.length > 0 && (
                                <span style={{ fontSize: 11, fontWeight: 700, background: '#dc2626', color: '#fff', padding: '2px 12px', borderRadius: 20, minWidth: 20, textAlign: 'center' }}>
                                    {hotLeads.length}
                                </span>
                            )}
                        </div>
                        <div style={{ padding: '8px 8px 16px' }}>
                            {hotLeads.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 24px' }}>
                                    <div style={{ fontSize: 60, marginBottom: 12 }}>{'\uD83C\uDFAF'}</div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 6 }}>No hot leads yet</div>
                                    <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, maxWidth: 260, margin: '0 auto' }}>
                                        Keep sending emails &mdash; your first hot lead will appear here when someone opens your email
                                    </div>
                                </div>
                            ) : hotLeads.map((lead: any) => (
                                <Link key={lead.id} href={'/clients/' + lead.id} className="dash-lead-row">
                                    <div style={{
                                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
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
                                        fontSize: 11, fontWeight: 600, padding: '3px 12px', borderRadius: 20,
                                        background: '#fef3c7', color: '#92400e', whiteSpace: 'nowrap',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                        {lead.open_count} opens {'\uD83D\uDD25'}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Recent Activity */}
                    <div className="dash-card dash-anim-7" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{
                            padding: '14px 20px', borderLeft: '4px solid #2563eb', background: '#eff6ff',
                            display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            <span style={{ fontSize: 16 }}>{'\u26A1'}</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Recent Activity</span>
                        </div>
                        <div style={{ padding: '8px 20px 16px' }}>
                            {activity.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 24px' }}>
                                    <div style={{ fontSize: 60, marginBottom: 12 }}>{'\uD83D\uDCEC'}</div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 6 }}>No recent activity</div>
                                    <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>Send your first email to get started</div>
                                </div>
                            ) : activity.map((item: any) => {
                                const isReceived = item.direction === 'RECEIVED';
                                return (
                                    <div key={item.id} className="dash-activity-row" style={{
                                        borderLeft: isReceived ? '3px solid #16a34a' : '3px solid transparent',
                                        paddingLeft: 10,
                                    }}>
                                        <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>
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
                    background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
                    borderRadius: 12, padding: '28px 48px', textAlign: 'center',
                    margin: '0 48px 40px', position: 'relative', overflow: 'hidden',
                }}>
                    <div style={{ position: 'absolute', top: -10, left: 24, fontSize: 80, color: 'rgba(255,255,255,.08)', fontFamily: 'Georgia, serif', lineHeight: 1 }}>&ldquo;</div>
                    <div style={{ position: 'absolute', bottom: -20, right: 24, fontSize: 80, color: 'rgba(255,255,255,.08)', fontFamily: 'Georgia, serif', lineHeight: 1 }}>&rdquo;</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.7)', letterSpacing: '2px', marginBottom: 8, position: 'relative' }}>
                        {'\uD83D\uDCA1'} DAILY MOTIVATION
                    </div>
                    <div style={{ fontSize: 16, color: '#fff', fontStyle: 'italic', fontWeight: 500, lineHeight: 1.7, position: 'relative' }}>
                        &ldquo;{dailyQuote}&rdquo;
                    </div>
                </div>
            </div>
        </>
    );
}
