'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSalesDashboardAction } from '../../src/actions/dashboardActions';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';
import OnboardingWizard from '../components/OnboardingWizard';

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function formatDate() {
    return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
}

function fmtK(n: number) {
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    return '$' + n.toLocaleString();
}

export default function SalesDashboard() {
    const isHydrated = useHydrated();
    const [userName, setUserName] = useState('');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        Promise.all([
            getCurrentUserAction(),
            getSalesDashboardAction(),
        ]).then(([user, dashboard]) => {
            setUserName(user?.name?.split(' ')[0] || 'there');
            setData(dashboard);
            setLoading(false);
            try { if (!localStorage.getItem('unibox_onboarding_done')) setShowOnboarding(true); } catch {}
        }).catch(() => setLoading(false));
    }, []);

    if (!isHydrated || loading) return <PageLoader isLoading={true} type="grid" count={4}><div /></PageLoader>;

    const stats = data?.stats || { sent: 0, replies: 0, newLeads: 0, openRate: 0 };
    const rev = data?.revenue || { total: 0, paid: 0, unpaid: 0, projects: 0, collectionRate: 0, thisMonth: 0, lastMonth: 0, monthGrowth: 0, targetProgress: 0, monthlyTarget: 10000 };
    const hotLeads = data?.hotLeads || [];
    const activity = data?.recentActivity || [];
    const followUpsDue = data?.followUpsDue || 0;
    const needReply = data?.needReply || [];
    const unpaidClients = data?.unpaidClients || [];
    const replyNowCount = data?.replyNowCount || 0;

    const perfScore = Math.min(100, Math.round(
        (stats.openRate + (stats.sent > 0 ? (stats.replies / stats.sent) * 100 : 0) + rev.collectionRate) / 3
    ));

    return (
        <>
        {showOnboarding && <OnboardingWizard userName={userName} onComplete={() => setShowOnboarding(false)} />}
        <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
            .kpi-page{height:100%;overflow-y:auto;background:#fafafa;font-family:'Inter',system-ui,-apple-system,sans-serif}
            .kpi-inner{max-width:1200px;margin:0 auto;padding:24px 32px 40px}
            .kpi-header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:28px}
            .kpi-greet{font-size:32px;font-weight:800;color:#1a1a1a;letter-spacing:-.03em;line-height:1.1}
            .kpi-date{font-size:13px;color:#8e8e93;font-weight:500;margin-top:4px}
            .kpi-ring{position:relative;width:72px;height:72px}
            .kpi-ring svg{transform:rotate(-90deg)}
            .kpi-ring-label{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
            .kpi-ring-num{font-size:20px;font-weight:800;color:#1a1a1a;line-height:1}
            .kpi-ring-sub{font-size:8px;color:#8e8e93;font-weight:600;letter-spacing:.08em;text-transform:uppercase}

            .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px}
            .kpi-card{background:#fff;border-radius:16px;padding:20px 22px;box-shadow:0 1px 3px rgba(0,0,0,.04),0 0 0 1px rgba(0,0,0,.03)}
            .kpi-card-label{font-size:11px;font-weight:600;color:#8e8e93;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
            .kpi-card-value{font-size:32px;font-weight:800;color:#1a1a1a;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums}
            .kpi-card-sub{font-size:11px;color:#8e8e93;margin-top:6px;font-weight:500}
            .kpi-card-sub .up{color:#34c759;font-weight:600}
            .kpi-card-sub .down{color:#ff3b30;font-weight:600}

            .kpi-target{background:#fff;border-radius:16px;padding:20px 24px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04),0 0 0 1px rgba(0,0,0,.03)}
            .kpi-target-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
            .kpi-target-title{font-size:13px;font-weight:700;color:#1a1a1a}
            .kpi-target-pct{font-size:24px;font-weight:800;color:#007aff;letter-spacing:-.02em}
            .kpi-bar{height:8px;background:#f2f2f7;border-radius:4px;overflow:hidden}
            .kpi-bar-fill{height:100%;border-radius:4px;transition:width .6s ease}
            .kpi-target-detail{display:flex;justify-content:space-between;margin-top:10px;font-size:11px;color:#8e8e93;font-weight:500}

            .kpi-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
            .kpi-section{background:#fff;border-radius:16px;padding:20px 22px;box-shadow:0 1px 3px rgba(0,0,0,.04),0 0 0 1px rgba(0,0,0,.03)}
            .kpi-section-title{font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:14px;display:flex;align-items:center;gap:8px}
            .kpi-section-badge{font-size:10px;font-weight:700;color:#fff;padding:2px 8px;border-radius:10px}
            .kpi-list-item{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f5f5f7}
            .kpi-list-item:last-child{border-bottom:none}
            .kpi-avatar{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0}
            .kpi-list-name{font-size:13px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            .kpi-list-sub{font-size:11px;color:#8e8e93}
            .kpi-list-right{margin-left:auto;text-align:right;flex-shrink:0}
            .kpi-list-amount{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}
            .kpi-list-tag{font-size:9px;font-weight:600;padding:2px 8px;border-radius:4px}

            .kpi-cta{display:flex;gap:12px;margin-bottom:20px}
            .kpi-cta a{flex:1;display:flex;align-items:center;gap:12px;padding:16px 20px;border-radius:14px;text-decoration:none;transition:transform .15s,box-shadow .15s}
            .kpi-cta a:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.08)}

            .kpi-activity-item{display:flex;align-items:flex-start;gap:10px;padding:6px 0}
            .kpi-dot{width:6px;height:6px;border-radius:50%;margin-top:6px;flex-shrink:0}

            @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
            .kpi-anim{animation:fadeUp .3s ease both}
            .kpi-anim-1{animation-delay:0s}.kpi-anim-2{animation-delay:40ms}.kpi-anim-3{animation-delay:80ms}.kpi-anim-4{animation-delay:120ms}
            .kpi-anim-5{animation-delay:160ms}.kpi-anim-6{animation-delay:200ms}
        `}</style>

        <div className="kpi-page">
        <div className="kpi-inner">

            {/* Header */}
            <div className="kpi-header kpi-anim kpi-anim-1">
                <div>
                    <div className="kpi-greet">{getGreeting()}, {userName}</div>
                    <div className="kpi-date">{formatDate()}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div className="kpi-ring">
                        <svg width="72" height="72" viewBox="0 0 72 72">
                            <circle cx="36" cy="36" r="30" fill="none" stroke="#f2f2f7" strokeWidth="6" />
                            <circle cx="36" cy="36" r="30" fill="none" stroke={perfScore >= 60 ? '#34c759' : perfScore >= 30 ? '#ff9f0a' : '#ff3b30'} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${perfScore * 1.885} 188.5`} />
                        </svg>
                        <div className="kpi-ring-label">
                            <span className="kpi-ring-num">{perfScore}</span>
                            <span className="kpi-ring-sub">Score</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="kpi-grid kpi-anim kpi-anim-2">
                <div className="kpi-card">
                    <div className="kpi-card-label">Emails Sent</div>
                    <div className="kpi-card-value">{stats.sent.toLocaleString()}</div>
                    <div className="kpi-card-sub">This week</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-card-label">Replies</div>
                    <div className="kpi-card-value">{stats.replies.toLocaleString()}</div>
                    <div className="kpi-card-sub">
                        {stats.sent > 0 ? <span className={stats.replies / stats.sent > 0.05 ? 'up' : 'down'}>{Math.round((stats.replies / stats.sent) * 100)}% reply rate</span> : 'No emails yet'}
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-card-label">Revenue This Month</div>
                    <div className="kpi-card-value">{fmtK(rev.thisMonth)}</div>
                    <div className="kpi-card-sub">
                        {rev.monthGrowth !== 0 && <span className={rev.monthGrowth > 0 ? 'up' : 'down'}>{rev.monthGrowth > 0 ? '+' : ''}{rev.monthGrowth}% vs last month</span>}
                        {rev.monthGrowth === 0 && <span>vs {fmtK(rev.lastMonth)} last month</span>}
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-card-label">Collection Rate</div>
                    <div className="kpi-card-value" style={{ color: rev.collectionRate >= 80 ? '#34c759' : rev.collectionRate >= 50 ? '#ff9f0a' : '#ff3b30' }}>{rev.collectionRate}%</div>
                    <div className="kpi-card-sub">{fmtK(rev.paid)} of {fmtK(rev.total)} collected</div>
                </div>
            </div>

            {/* Monthly Target Bar */}
            <div className="kpi-target kpi-anim kpi-anim-3">
                <div className="kpi-target-header">
                    <div className="kpi-target-title">Monthly Target</div>
                    <div className="kpi-target-pct">{rev.targetProgress}%</div>
                </div>
                <div className="kpi-bar">
                    <div className="kpi-bar-fill" style={{
                        width: `${rev.targetProgress}%`,
                        background: rev.targetProgress >= 100 ? '#34c759' : rev.targetProgress >= 60 ? '#007aff' : '#ff9f0a',
                    }} />
                </div>
                <div className="kpi-target-detail">
                    <span>{fmtK(rev.thisMonth)} earned</span>
                    <span>Target: {fmtK(rev.monthlyTarget)}</span>
                    <span>{fmtK(Math.max(0, rev.monthlyTarget - rev.thisMonth))} to go</span>
                </div>
            </div>

            {/* Action CTAs */}
            <div className="kpi-cta kpi-anim kpi-anim-4">
                <Link href="/actions" style={{ background: '#007aff', color: '#fff' }}>
                    <span style={{ fontSize: 24 }}>{'\uD83C\uDFAF'}</span>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>Start Selling</div>
                        <div style={{ fontSize: 11, opacity: .8 }}>{replyNowCount > 0 ? `${replyNowCount} replies waiting` : 'Check action queue'}</div>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: 18, opacity: .6 }}>{'\u2192'}</span>
                </Link>
                {rev.unpaid > 0 && (
                    <Link href="/clients" style={{ background: '#ff3b30', color: '#fff' }}>
                        <span style={{ fontSize: 24 }}>{'\uD83D\uDCB0'}</span>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700 }}>Collect {fmtK(rev.unpaid)}</div>
                            <div style={{ fontSize: 11, opacity: .8 }}>{unpaidClients.length} clients with balance</div>
                        </div>
                        <span style={{ marginLeft: 'auto', fontSize: 18, opacity: .6 }}>{'\u2192'}</span>
                    </Link>
                )}
            </div>

            {/* Two Column: Reply Now + Hot Leads */}
            <div className="kpi-row kpi-anim kpi-anim-5">
                {/* Reply Now */}
                <div className="kpi-section">
                    <div className="kpi-section-title">
                        {'\uD83D\uDCE9'} Reply Now
                        {replyNowCount > 0 && <span className="kpi-section-badge" style={{ background: '#ff3b30' }}>{replyNowCount}</span>}
                    </div>
                    {needReply.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#8e8e93', fontSize: 13 }}>
                            <div style={{ fontSize: 28, marginBottom: 4 }}>{'\u2705'}</div>
                            All caught up
                        </div>
                    ) : needReply.map((c: any) => (
                        <Link href={`/clients/${c.id}`} key={c.id} className="kpi-list-item" style={{ textDecoration: 'none' }}>
                            <div className="kpi-avatar" style={{ background: '#ff3b30' }}>
                                {(c.name || '?')[0]?.toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="kpi-list-name">{c.name}</div>
                                <div className="kpi-list-sub">{c.email}</div>
                            </div>
                            <div className="kpi-list-right">
                                <span className="kpi-list-tag" style={{ background: c.days_since_last_contact <= 1 ? '#fff1f0' : '#fffbe6', color: c.days_since_last_contact <= 1 ? '#ff3b30' : '#ff9f0a' }}>
                                    {c.days_since_last_contact === 0 ? 'TODAY' : c.days_since_last_contact + 'd ago'}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>

                {/* Hot Leads */}
                <div className="kpi-section">
                    <div className="kpi-section-title">
                        {'\uD83D\uDD25'} Hot Leads
                        {hotLeads.length > 0 && <span className="kpi-section-badge" style={{ background: '#ff9f0a' }}>{hotLeads.length}</span>}
                    </div>
                    {hotLeads.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#8e8e93', fontSize: 13 }}>
                            <div style={{ fontSize: 28, marginBottom: 4 }}>{'\uD83C\uDFAF'}</div>
                            No hot leads yet — keep emailing
                        </div>
                    ) : hotLeads.map((lead: any) => (
                        <Link href={`/clients/${lead.id}`} key={lead.id} className="kpi-list-item" style={{ textDecoration: 'none' }}>
                            <div className="kpi-avatar" style={{ background: '#ff9f0a' }}>
                                {(lead.name || lead.email || '?')[0]?.toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="kpi-list-name">{lead.name || lead.email}</div>
                                <div className="kpi-list-sub">{lead.email}</div>
                            </div>
                            <div className="kpi-list-right">
                                <span className="kpi-list-tag" style={{ background: '#fff8e1', color: '#e65100' }}>{lead.open_count} opens</span>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Two Column: Unpaid + Activity */}
            <div className="kpi-row kpi-anim kpi-anim-6">
                {/* Unpaid */}
                <div className="kpi-section">
                    <div className="kpi-section-title">
                        {'\uD83D\uDCB3'} Outstanding
                        {rev.unpaid > 0 && <span className="kpi-section-badge" style={{ background: '#ff3b30' }}>{fmtK(rev.unpaid)}</span>}
                    </div>
                    {unpaidClients.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#8e8e93', fontSize: 13 }}>
                            <div style={{ fontSize: 28, marginBottom: 4 }}>{'\uD83C\uDF89'}</div>
                            All paid up!
                        </div>
                    ) : unpaidClients.map((c: any) => (
                        <Link href={`/clients/${c.id}`} key={c.id} className="kpi-list-item" style={{ textDecoration: 'none' }}>
                            <div className="kpi-avatar" style={{ background: '#8e8e93' }}>
                                {(c.name || '?')[0]?.toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="kpi-list-name">{c.name}</div>
                                <div className="kpi-list-sub">{c.email}</div>
                            </div>
                            <div className="kpi-list-right">
                                <span className="kpi-list-amount" style={{ color: '#ff3b30' }}>${c.unpaid_amount?.toLocaleString()}</span>
                            </div>
                        </Link>
                    ))}
                </div>

                {/* Activity */}
                <div className="kpi-section">
                    <div className="kpi-section-title">{'\u26A1'} Recent Activity</div>
                    {activity.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#8e8e93', fontSize: 13 }}>
                            <div style={{ fontSize: 28, marginBottom: 4 }}>{'\uD83D\uDCEC'}</div>
                            Send your first email
                        </div>
                    ) : activity.slice(0, 8).map((item: any) => (
                        <div key={item.id} className="kpi-activity-item">
                            <div className="kpi-dot" style={{ background: item.direction === 'RECEIVED' ? '#34c759' : '#007aff' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.direction === 'RECEIVED' ? `${item.contactName} replied` : `You emailed ${item.contactName}`}
                                </div>
                                <div style={{ fontSize: 11, color: '#8e8e93', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject}</div>
                            </div>
                            <span style={{ fontSize: 10, color: '#c7c7cc', whiteSpace: 'nowrap', flexShrink: 0 }}>{timeAgo(item.sentAt)}</span>
                        </div>
                    ))}
                </div>
            </div>

        </div>
        </div>
        </>
    );
}
