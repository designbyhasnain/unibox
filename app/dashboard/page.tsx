'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getSalesDashboardAction } from '../../src/actions/dashboardActions';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';
import OnboardingWizard from '../components/OnboardingWizard';

function fmtK(n: number) { return n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + n.toLocaleString(); }
function fmtDate() { return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
function timeAgo(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); return m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago'; }
function initials(n: string) { return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'; }
const STAGE_COLORS: Record<string, string> = { COLD_LEAD: '#94a3b8', CONTACTED: '#3b82f6', WARM_LEAD: '#f59e0b', LEAD: '#8b5cf6', OFFER_ACCEPTED: '#10b981', CLOSED: '#22c55e', NOT_INTERESTED: '#ef4444' };
const STAGE_LABELS: Record<string, string> = { COLD_LEAD: 'Cold Lead', CONTACTED: 'Contacted', WARM_LEAD: 'Warm Lead', LEAD: 'Lead', OFFER_ACCEPTED: 'Proposal', CLOSED: 'Closed Won', NOT_INTERESTED: 'Lost' };
const HEALTH_MAP: Record<string, { label: string; color: string }> = { strong: { label: 'Healthy', color: '#22c55e' }, good: { label: 'Good', color: '#22c55e' }, warm: { label: 'Warm', color: '#f59e0b' }, cold: { label: 'Cooling', color: '#f97316' }, critical: { label: 'At Risk', color: '#ef4444' }, dead: { label: 'Lost', color: '#94a3b8' }, neutral: { label: '--', color: '#d1d5db' } };

export default function SalesDashboard() {
    const isHydrated = useHydrated();
    const [userName, setUserName] = useState('');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        Promise.all([getCurrentUserAction(), getSalesDashboardAction()])
            .then(([user, dash]) => {
                setUserName(user?.name?.split(' ')[0] || 'there');
                setData(dash);
                setLoading(false);
                try { if (!localStorage.getItem('unibox_onboarding_done')) setShowOnboarding(true); } catch {}
            }).catch(() => setLoading(false));
    }, []);

    if (!isHydrated || loading) return <PageLoader isLoading={true} type="grid" count={4}><div /></PageLoader>;

    const s = data?.stats || { sent: 0, replies: 0, newLeads: 0, replyRate: 0 };
    const r = data?.revenue || { total: 0, paid: 0, unpaid: 0, projects: 0, collectionRate: 0, thisMonth: 0, lastMonth: 0, monthGrowth: 0, targetProgress: 0, monthlyTarget: 10000, chart: [] };
    const pipeline = data?.pipeline || {};
    const funnel = data?.funnel || [];
    const reply = data?.needReply || [];
    const top = data?.topClients || [];
    const contacts = data?.pipelineContacts || [];
    const activity = data?.recentActivity || [];
    const replyCount = data?.replyNowCount || 0;

    const perfScore = useMemo(() => Math.min(100, Math.round(
        (s.replyRate + r.collectionRate + r.targetProgress) / 3
    )), [s, r]);

    const activeDeals = (pipeline['CONTACTED'] || 0) + (pipeline['WARM_LEAD'] || 0) + (pipeline['LEAD'] || 0) + (pipeline['OFFER_ACCEPTED'] || 0);
    const closedWon = pipeline['CLOSED'] || 0;
    const winRate = (activeDeals + closedWon) > 0 ? Math.round((closedWon / (activeDeals + closedWon)) * 100) : 0;

    return (
        <>
        {showOnboarding && <OnboardingWizard userName={userName} onComplete={() => setShowOnboarding(false)} />}
        <style>{`
            .d-page{height:100%;overflow-y:auto;background:#f8f9fa;font-family:'Inter',system-ui,-apple-system,sans-serif}
            .d-inner{max-width:1280px;margin:0 auto;padding:20px 28px 40px}
            .d-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
            .d-title{font-size:22px;font-weight:700;color:#111}
            .d-subtitle{font-size:13px;color:#888;margin-top:2px}
            .d-date-pill{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:500;color:#333;display:flex;align-items:center;gap:8px}

            .d-kpi-row{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:20px}
            .d-kpi{background:#fff;border-radius:12px;padding:16px 18px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
            .d-kpi-label{font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
            .d-kpi-value{font-size:28px;font-weight:800;color:#111;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums}
            .d-kpi-trend{font-size:11px;font-weight:600;margin-left:6px}
            .d-kpi-trend.up{color:#22c55e}
            .d-kpi-trend.down{color:#ef4444}

            .d-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
            .d-grid-3{display:grid;grid-template-columns:2fr 1fr 1fr;gap:16px;margin-bottom:16px}
            .d-card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
            .d-card-title{font-size:14px;font-weight:700;color:#111;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between}
            .d-card-badge{font-size:10px;font-weight:700;color:#fff;padding:2px 8px;border-radius:10px}

            .d-pipeline-health{display:flex;flex-direction:column;gap:10px}
            .d-ph-row{display:flex;align-items:center;gap:10px}
            .d-ph-label{font-size:12px;font-weight:600;color:#333;width:90px;flex-shrink:0}
            .d-ph-bar{flex:1;height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden}
            .d-ph-fill{height:100%;border-radius:3px;transition:width .5s ease}
            .d-ph-count{font-size:12px;font-weight:700;color:#555;width:40px;text-align:right;flex-shrink:0}

            .d-funnel{display:flex;flex-direction:column;align-items:center;gap:4px}
            .d-funnel-step{display:flex;align-items:center;justify-content:center;padding:8px;border-radius:6px;font-size:11px;font-weight:600;color:#fff;text-align:center;transition:width .5s ease}

            .d-table{width:100%;border-collapse:separate;border-spacing:0}
            .d-table th{font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.06em;padding:8px 12px;text-align:left;border-bottom:1px solid #f1f5f9}
            .d-table td{font-size:13px;padding:10px 12px;border-bottom:1px solid #f8f9fa;color:#333}
            .d-table tr:hover td{background:#f8f9fa}
            .d-avatar{width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0}
            .d-stage-badge{font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;white-space:nowrap}
            .d-action-badge{font-size:9px;font-weight:700;padding:3px 8px;border-radius:4px;background:#f1f5f9;color:#555;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
            .d-health-bar{width:40px;height:4px;border-radius:2px;display:inline-block}

            .d-list-item{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f8f9fa}
            .d-list-item:last-child{border:none}
            .d-list-rank{width:24px;height:24px;border-radius:6px;background:#111;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}

            .d-cta{display:flex;gap:12px;margin-bottom:16px}
            .d-cta a{flex:1;display:flex;align-items:center;gap:10px;padding:14px 18px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:700;color:#fff;transition:transform .15s,box-shadow .15s}
            .d-cta a:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.1)}

            .d-perf-ring{position:relative;width:56px;height:56px;flex-shrink:0}
            .d-perf-ring svg{transform:rotate(-90deg)}
            .d-perf-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#111}

            @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
            .d-anim{animation:fadeUp .3s ease both}
        `}</style>

        <div className="d-page"><div className="d-inner">

            {/* Header */}
            <div className="d-header d-anim">
                <div>
                    <div className="d-title">Dashboard Overview</div>
                    <div className="d-subtitle">Welcome back, {userName}. Here&apos;s your pipeline status.</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div className="d-date-pill">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        {fmtDate()}
                    </div>
                    <div className="d-perf-ring">
                        <svg width="56" height="56" viewBox="0 0 56 56">
                            <circle cx="28" cy="28" r="24" fill="none" stroke="#f1f5f9" strokeWidth="4"/>
                            <circle cx="28" cy="28" r="24" fill="none" stroke={perfScore >= 60 ? '#22c55e' : perfScore >= 30 ? '#f59e0b' : '#ef4444'} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${perfScore * 1.508} 150.8`}/>
                        </svg>
                        <div className="d-perf-num">{perfScore}</div>
                    </div>
                </div>
            </div>

            {/* KPI Row */}
            <div className="d-kpi-row d-anim" style={{ animationDelay: '40ms' }}>
                <div className="d-kpi">
                    <div className="d-kpi-label">Active Deals</div>
                    <div className="d-kpi-value">{activeDeals}</div>
                </div>
                <div className="d-kpi">
                    <div className="d-kpi-label">Conversion</div>
                    <div className="d-kpi-value">{winRate}%</div>
                </div>
                <div className="d-kpi">
                    <div className="d-kpi-label">Revenue</div>
                    <div className="d-kpi-value">
                        {fmtK(r.thisMonth)}
                        {r.monthGrowth !== 0 && <span className={`d-kpi-trend ${r.monthGrowth > 0 ? 'up' : 'down'}`}>{r.monthGrowth > 0 ? '+' : ''}{r.monthGrowth}%</span>}
                    </div>
                </div>
                <div className="d-kpi">
                    <div className="d-kpi-label">New Leads</div>
                    <div className="d-kpi-value">
                        {s.newLeads}
                        {s.newLeads > 0 && <span className="d-kpi-trend up">+{s.newLeads}</span>}
                    </div>
                </div>
                <div className="d-kpi">
                    <div className="d-kpi-label">Closed Won</div>
                    <div className="d-kpi-value">
                        {fmtK(r.paid)}
                        {r.collectionRate > 0 && <span className={`d-kpi-trend ${r.collectionRate >= 70 ? 'up' : 'down'}`}>{r.collectionRate}%</span>}
                    </div>
                </div>
                <div className="d-kpi">
                    <div className="d-kpi-label">Emails Sent</div>
                    <div className="d-kpi-value">{s.sent.toLocaleString()}</div>
                </div>
            </div>

            {/* CTAs */}
            <div className="d-cta d-anim" style={{ animationDelay: '80ms' }}>
                <Link href="/actions" style={{ background: '#007aff' }}>
                    {'\uD83C\uDFAF'} Start Selling
                    {replyCount > 0 && <span style={{ fontSize: 11, opacity: .8 }}>{replyCount} replies waiting</span>}
                    <span style={{ marginLeft: 'auto', opacity: .6 }}>{'\u2192'}</span>
                </Link>
                {r.unpaid > 0 && (
                    <Link href="/clients" style={{ background: '#ef4444' }}>
                        {'\uD83D\uDCB0'} Collect {fmtK(r.unpaid)}
                        <span style={{ marginLeft: 'auto', opacity: .6 }}>{'\u2192'}</span>
                    </Link>
                )}
            </div>

            {/* Row: Revenue Chart + Pipeline Table */}
            <div className="d-grid-2 d-anim" style={{ animationDelay: '120ms' }}>
                {/* Revenue Chart */}
                <div className="d-card">
                    <div className="d-card-title">
                        <span>Monthly Revenue</span>
                        <span style={{ fontSize: 20, fontWeight: 800, color: r.monthGrowth >= 0 ? '#22c55e' : '#ef4444' }}>
                            {fmtK(r.thisMonth)}
                        </span>
                    </div>
                    <div style={{ height: 200 }}>
                        {r.chart.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={r.chart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false}/>
                                    <YAxis tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => '$' + (v / 1000).toFixed(0) + 'k'}/>
                                    <Tooltip formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Revenue']} labelStyle={{ fontSize: 11 }} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}/>
                                    <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#revGrad)"/>
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ccc', fontSize: 13 }}>No revenue data yet</div>
                        )}
                    </div>
                    {/* Target bar */}
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 10, color: '#888', fontWeight: 600, flexShrink: 0 }}>TARGET</span>
                        <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${r.targetProgress}%`, background: r.targetProgress >= 100 ? '#22c55e' : '#3b82f6', borderRadius: 3 }}/>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#333', flexShrink: 0 }}>{r.targetProgress}%</span>
                    </div>
                </div>

                {/* Filmmaker Pipeline Table */}
                <div className="d-card" style={{ overflow: 'hidden' }}>
                    <div className="d-card-title">
                        <span>Filmmaker Pipeline</span>
                        <Link href="/clients" style={{ fontSize: 12, color: '#007aff', textDecoration: 'none', fontWeight: 600 }}>View All</Link>
                    </div>
                    <div style={{ overflowX: 'auto', maxHeight: 250 }}>
                        <table className="d-table">
                            <thead><tr>
                                <th>Filmmaker</th>
                                <th>Stage</th>
                                <th>Value</th>
                                <th>Health</th>
                            </tr></thead>
                            <tbody>
                                {contacts.slice(0, 8).map((c: any) => {
                                    const h = HEALTH_MAP[c.health] || HEALTH_MAP['neutral']!;
                                    return (
                                        <tr key={c.id}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div className="d-avatar" style={{ background: STAGE_COLORS[c.stage] || '#94a3b8' }}>{initials(c.name)}</div>
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: 12 }}>{c.name}</div>
                                                        <div style={{ fontSize: 10, color: '#888' }}>{c.location || c.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td><span className="d-stage-badge" style={{ background: (STAGE_COLORS[c.stage] || '#94a3b8') + '20', color: STAGE_COLORS[c.stage] || '#94a3b8' }}>{STAGE_LABELS[c.stage] || c.stage}</span></td>
                                            <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.revenue > 0 ? fmtK(c.revenue) : '--'}</td>
                                            <td><span className="d-health-bar" style={{ background: h.color }}/></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Row: Pipeline Health + Funnel + Top Producers */}
            <div className="d-grid-3 d-anim" style={{ animationDelay: '160ms' }}>
                {/* Pipeline Health Bars */}
                <div className="d-card">
                    <div className="d-card-title">Pipeline Health</div>
                    <div className="d-pipeline-health">
                        {['COLD_LEAD', 'CONTACTED', 'LEAD', 'OFFER_ACCEPTED', 'CLOSED'].map(stage => {
                            const count = pipeline[stage] || 0;
                            const maxCount = Math.max(...Object.values(pipeline).map(Number), 1);
                            return (
                                <div className="d-ph-row" key={stage}>
                                    <div className="d-ph-label">{STAGE_LABELS[stage]}</div>
                                    <div className="d-ph-bar">
                                        <div className="d-ph-fill" style={{ width: `${(count / maxCount) * 100}%`, background: STAGE_COLORS[stage] }}/>
                                    </div>
                                    <div className="d-ph-count">{count}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Conversion Funnel */}
                <div className="d-card">
                    <div className="d-card-title">Pipeline Funnel</div>
                    <div className="d-funnel">
                        {funnel.map((f: any, i: number) => {
                            const colors = ['#f97316', '#f59e0b', '#3b82f6', '#22c55e'];
                            const widths = [100, 70, 45, 25];
                            return (
                                <div key={f.stage} className="d-funnel-step" style={{ width: `${widths[i]}%`, background: colors[i], fontSize: i === 0 ? 12 : 10 }}>
                                    {f.pct > 0 ? `${f.pct}% ${f.stage}` : `${f.stage}: ${f.count}`}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Top Producers */}
                <div className="d-card">
                    <div className="d-card-title">Top Clients</div>
                    {top.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 16, color: '#ccc', fontSize: 12 }}>No clients yet</div>
                    ) : top.map((c: any, i: number) => (
                        <div className="d-list-item" key={c.id}>
                            <div className="d-list-rank">{i + 1}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#111', fontVariantNumeric: 'tabular-nums' }}>{fmtK(c.total_revenue)}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Row: Reply Now + Activity */}
            <div className="d-grid-2 d-anim" style={{ animationDelay: '200ms' }}>
                {/* Reply Now */}
                <div className="d-card">
                    <div className="d-card-title">
                        {'\uD83D\uDCE9'} Reply Now
                        {replyCount > 0 && <span className="d-card-badge" style={{ background: '#ef4444' }}>{replyCount}</span>}
                    </div>
                    {reply.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 16, color: '#ccc', fontSize: 12 }}>{'\u2705'} All caught up</div>
                    ) : reply.map((c: any) => (
                        <Link href={`/clients/${c.id}`} className="d-list-item" key={c.id} style={{ textDecoration: 'none' }}>
                            <div className="d-avatar" style={{ background: '#ef4444' }}>{initials(c.name)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{c.name}</div>
                                <div style={{ fontSize: 10, color: '#888' }}>{c.email}</div>
                            </div>
                            <span className="d-action-badge">{c.days_since_last_contact === 0 ? 'TODAY' : c.days_since_last_contact + 'd ago'}</span>
                        </Link>
                    ))}
                </div>

                {/* Recent Activity */}
                <div className="d-card">
                    <div className="d-card-title">{'\u26A1'} Recent Activity</div>
                    {activity.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 16, color: '#ccc', fontSize: 12 }}>{'\uD83D\uDCEC'} Send your first email</div>
                    ) : activity.slice(0, 8).map((a: any) => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: a.direction === 'RECEIVED' ? '#22c55e' : '#3b82f6' }}/>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {a.direction === 'RECEIVED' ? `${a.contactName} replied` : `Sent to ${a.contactName}`}
                                </div>
                                <div style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.subject}</div>
                            </div>
                            <span style={{ fontSize: 9, color: '#bbb', whiteSpace: 'nowrap', flexShrink: 0 }}>{timeAgo(a.sentAt)}</span>
                        </div>
                    ))}
                </div>
            </div>

        </div></div>
        </>
    );
}
