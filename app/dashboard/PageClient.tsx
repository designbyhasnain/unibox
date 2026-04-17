'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { getSalesDashboardAction, getDashboardAddonsAction, type DashboardAddons } from '../../src/actions/dashboardActions';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';

const RevenueBarChart = dynamic(() => import('../components/RevenueBarChart'), { ssr: false });
const OnboardingWizard = dynamic(() => import('../components/OnboardingWizard'), { ssr: false });

/* ── Helpers ────────────────────────────────────────────────────────────── */
function fmt(n: number) {
    if (n >= 10000) return '$' + (n / 1000).toFixed(0) + 'k';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
    return '$' + n.toLocaleString();
}
function pct(n: number) { return (n > 0 ? '+' : '') + n + '%'; }
function ago(d: string) {
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (m < 60) return m + 'm';
    if (m < 1440) return Math.floor(m / 60) + 'h';
    return Math.floor(m / 1440) + 'd';
}
function ini(n: string) { return (n || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function relDate(d: string) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const SC: Record<string, string> = { COLD_LEAD: '#94a3b8', CONTACTED: '#3b82f6', WARM_LEAD: '#f59e0b', LEAD: '#8b5cf6', OFFER_ACCEPTED: '#10b981', CLOSED: '#22c55e', NOT_INTERESTED: '#ef4444' };
const SL: Record<string, string> = { COLD_LEAD: 'Cold', CONTACTED: 'Contacted', WARM_LEAD: 'Warm', LEAD: 'Lead', OFFER_ACCEPTED: 'Proposal', CLOSED: 'Won', NOT_INTERESTED: 'Lost' };
const PS: Record<string, { color: string; bg: string; label: string }> = {
    PAID: { color: '#22c55e', bg: '#f0fdf4', label: 'Paid' },
    UNPAID: { color: '#ef4444', bg: '#fef2f2', label: 'Unpaid' },
    PARTIAL: { color: '#f59e0b', bg: '#fffbeb', label: 'Partial' },
};

/* ── Component ──────────────────────────────────────────────────────────── */
export default function Dashboard({ userRole }: { userRole?: string }) {
    const hydrated = useHydrated();
    const [name, setName] = useState('');
    const [d, setD] = useState<any>(null);
    const [addons, setAddons] = useState<DashboardAddons | null>(null);
    const [loading, setLoading] = useState(true);
    const [onboard, setOnboard] = useState(false);
    const isEditor = userRole === 'VIDEO_EDITOR';

    useEffect(() => {
        Promise.all([getCurrentUserAction(), getSalesDashboardAction()])
            .then(([u, dash]) => {
                setName(u?.name?.split(' ')[0] || '');
                setD(dash);
                setLoading(false);
                try { if (!localStorage.getItem('unibox_onboarding_done')) setOnboard(true); } catch {}
            }).catch(() => setLoading(false));
        // Fire the addons request in parallel — don't block first paint.
        getDashboardAddonsAction().then(res => { if (res.success && res.data) setAddons(res.data); }).catch(() => {});
    }, []);

    if (!hydrated || loading) return <PageLoader isLoading type="grid" count={6}><div /></PageLoader>;

    const s = d?.stats || { sent: 0, replies: 0, newLeads: 0, replyRate: 0 };
    const o = d?.outreach || { today: 0, thisWeek: 0, thisMonth: 0 };
    const r = d?.revenue || { total: 0, paid: 0, unpaid: 0, projects: 0, collectionRate: 0, thisMonth: 0, lastMonth: 0, monthGrowth: 0, targetProgress: 0, monthlyTarget: 10000, chart: [] };
    const pl = d?.pipeline || {};
    const funnel = d?.funnel || [];
    const reply = d?.needReply || [];
    const top = d?.topClients || [];
    const rows = d?.pipelineContacts || [];
    const feed = d?.recentActivity || [];
    const replyN = d?.replyNowCount || 0;
    const recentProj = d?.recentProjects || [];
    const unpaidClients = d?.unpaidClients || [];

    const activeProjects = r.projects;
    const clientsOwned = d?.pipelineTotal || 0;
    const deals = Number(pl['CONTACTED'] || 0) + Number(pl['WARM_LEAD'] || 0) + Number(pl['LEAD'] || 0) + Number(pl['OFFER_ACCEPTED'] || 0);
    const won = Number(pl['CLOSED'] || 0);
    const score = Math.min(100, Math.round((s.replyRate + r.collectionRate + r.targetProgress) / 3));

    return (
        <>
        {onboard && <OnboardingWizard userName={name} onComplete={() => setOnboard(false)} />}

        <style>{`
/* ── Base ── */
.se{height:100%;overflow-y:auto;background:#fff;font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#171717}
.se-in{max-width:1440px;margin:0 auto;padding:32px}

/* ── Header ── */
.se-hd{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:28px}
.se-hd h1{font-size:24px;font-weight:700;letter-spacing:-.03em;margin:0;color:#171717}
.se-hd p{font-size:13px;color:#a3a3a3;margin:4px 0 0;font-weight:400}
.se-hd-actions{display:flex;align-items:center;gap:10px}

/* ── KPI Cards ── */
.se-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-bottom:24px}
.se-kpi{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:20px 24px;transition:box-shadow .15s}
.se-kpi:hover{box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.1)}
.se-kpi-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;margin-bottom:12px}
.se-kpi-l{font-size:12px;color:#a3a3a3;font-weight:500;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
.se-kpi-v{font-size:28px;font-weight:700;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums;color:#171717}
.se-kpi-t{font-size:11px;font-weight:600;margin-top:8px;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px}
.se-kpi-t.g{color:#22c55e;background:#f0fdf4}.se-kpi-t.r{color:#ef4444;background:#fef2f2}.se-kpi-t.n{color:#a3a3a3;background:#fafafa}

/* ── Cards ── */
.se-row{display:grid;gap:20px;margin-bottom:20px}
.se-r2{grid-template-columns:1fr 1fr}
.se-r3{grid-template-columns:3fr 2fr}
.se-r4{grid-template-columns:3fr 2fr 2fr}
@media (max-width:960px){
  .se-in{padding:20px}
  .se-r2,.se-r3,.se-r4{grid-template-columns:1fr}
  .se-cta{grid-template-columns:1fr}
}
.se-c{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:24px;transition:box-shadow .15s}
.se-c:hover{box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.1)}
.se-c-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.se-c-t{font-size:14px;font-weight:600;color:#171717}
.se-c-a{font-size:12px;color:#a3a3a3;text-decoration:none;font-weight:500;transition:color .15s}
.se-c-a:hover{color:#171717}

/* ── Outreach Metrics ── */
.se-outreach{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px}
.se-out-card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:18px 20px;text-align:center}
.se-out-v{font-size:32px;font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:#171717;line-height:1}
.se-out-l{font-size:12px;color:#a3a3a3;font-weight:500;margin-top:6px}

/* ── Target ── */
.se-target{display:flex;align-items:center;gap:12px;margin-top:14px;padding-top:14px;border-top:1px solid #f5f5f5}
.se-target-bar{flex:1;height:5px;background:#f5f5f5;border-radius:3px;overflow:hidden}
.se-target-fill{height:100%;border-radius:3px;transition:width .8s cubic-bezier(.4,0,.2,1)}
.se-target-label{font-size:12px;color:#a3a3a3;font-weight:500;white-space:nowrap}
.se-target-pct{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;min-width:36px;text-align:right}

/* ── Pipeline Bars ── */
.se-bars{display:flex;flex-direction:column;gap:14px}
.se-bar-row{display:grid;grid-template-columns:80px 1fr 40px;align-items:center;gap:10px}
.se-bar-l{font-size:12px;color:#525252;font-weight:500}
.se-bar-track{height:8px;background:#f5f5f5;border-radius:4px;overflow:hidden}
.se-bar-fill{height:100%;border-radius:4px;transition:width .6s cubic-bezier(.4,0,.2,1)}
.se-bar-n{font-size:13px;font-weight:600;color:#171717;text-align:right;font-variant-numeric:tabular-nums}

/* ── Funnel ── */
.se-funnel{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0}
.se-funnel-s{display:flex;align-items:center;justify-content:center;padding:12px;border-radius:8px;font-size:11px;font-weight:600;color:#fff;transition:width .6s cubic-bezier(.4,0,.2,1);letter-spacing:.01em}

/* ── Table ── */
.se-tbl{width:100%;border-collapse:collapse}
.se-tbl th{font-size:11px;font-weight:600;color:#a3a3a3;text-align:left;padding:0 12px 12px;text-transform:uppercase;letter-spacing:.05em}
.se-tbl td{font-size:13px;padding:12px;border-top:1px solid #f5f5f5}
.se-tbl tr:hover td{background:#fafafa}
.se-av{width:30px;height:30px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#fff;flex-shrink:0}
.se-stage{font-size:10px;font-weight:600;padding:3px 10px;border-radius:6px;letter-spacing:.02em}
.se-pay{font-size:10px;font-weight:600;padding:3px 10px;border-radius:6px;letter-spacing:.02em}

/* ── List Items ── */
.se-li{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f5f5f5;text-decoration:none;color:inherit;transition:background .1s}
.se-li:last-child{border:none}
.se-li:hover{background:#fafafa;margin:0 -12px;padding-left:12px;padding-right:12px;border-radius:8px}
.se-li-rank{width:24px;height:24px;border-radius:8px;background:#f5f5f5;font-size:10px;font-weight:700;color:#525252;display:flex;align-items:center;justify-content:center;flex-shrink:0}

/* ── Feed ── */
.se-feed{display:flex;gap:10px;padding:6px 0;align-items:flex-start}
.se-dot{width:6px;height:6px;border-radius:50%;margin-top:5px;flex-shrink:0}

/* ── CTAs ── */
.se-cta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
.se-cta a{display:flex;align-items:center;gap:10px;padding:16px 20px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;color:#fff;transition:transform .15s,box-shadow .15s}
.se-cta a:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.15)}

/* ── Score Ring ── */
.se-score{display:flex;align-items:center;gap:14px}
.se-ring{position:relative;width:48px;height:48px}
.se-ring svg{transform:rotate(-90deg)}
.se-ring-n{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}

/* ── New Campaign Button ── */
.se-btn-primary{background:#0ea5e9;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px;transition:background .15s}
.se-btn-primary:hover{background:#0284c7}

/* ── Anim ── */
@keyframes seUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.se-a{animation:seUp .3s ease both}
.se-a1{animation-delay:0s}.se-a2{animation-delay:40ms}.se-a3{animation-delay:80ms}.se-a4{animation-delay:120ms}.se-a5{animation-delay:160ms}.se-a6{animation-delay:200ms}

/* ── Empty State ── */
.se-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px;color:#d4d4d4}
.se-empty-icon{font-size:28px;margin-bottom:8px;opacity:.5}
.se-empty-text{font-size:13px;color:#a3a3a3}
.se-empty-sub{font-size:12px;color:#d4d4d4;margin-top:4px}
        `}</style>

        <div className="se"><div className="se-in">

            {/* ── Header ── */}
            <div className="se-hd se-a se-a1">
                <div>
                    <h1>{name ? `${name}\u2019s Dashboard` : 'Dashboard'}</h1>
                    <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
                {!isEditor && (
                    <div className="se-hd-actions">
                        <div className="se-score">
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 11, color: '#a3a3a3', fontWeight: 500 }}>Performance</div>
                                <div style={{ fontSize: 11, color: '#a3a3a3' }}>{fmt(r.thisMonth)} / {fmt(r.monthlyTarget)}</div>
                            </div>
                            <div className="se-ring">
                                <svg width="48" height="48" viewBox="0 0 48 48">
                                    <circle cx="24" cy="24" r="20" fill="none" stroke="#f5f5f5" strokeWidth="3"/>
                                    <circle cx="24" cy="24" r="20" fill="none" stroke={score >= 60 ? '#22c55e' : score >= 30 ? '#f59e0b' : '#ef4444'} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${score * 1.257} 125.7`}/>
                                </svg>
                                <div className="se-ring-n">{score}</div>
                            </div>
                        </div>
                        <Link href="/campaigns/new" className="se-btn-primary">+ New Campaign</Link>
                    </div>
                )}
            </div>

            {/* ── KPI Cards ── */}
            <div className="se-kpis se-a se-a2">
                {isEditor ? (<>
                    <div className="se-kpi">
                        <div className="se-kpi-icon" style={{ background: '#f0f9ff', color: '#0ea5e9' }}>{'\u{1F4CB}'}</div>
                        <div className="se-kpi-l">Total Assigned</div>
                        <div className="se-kpi-v">{activeProjects}</div>
                        <span className="se-kpi-t n">All projects</span>
                    </div>
                    <div className="se-kpi">
                        <div className="se-kpi-icon" style={{ background: '#fffbeb', color: '#d97706' }}>{'\u26A1'}</div>
                        <div className="se-kpi-l">In Progress</div>
                        <div className="se-kpi-v">{recentProj.filter((p: any) => p.status === 'In Progress' || p.status === 'Downloaded').length || 0}</div>
                        <span className="se-kpi-t n">Active tasks</span>
                    </div>
                    <div className="se-kpi">
                        <div className="se-kpi-icon" style={{ background: '#f0fdf4', color: '#22c55e' }}>{'\u2714'}</div>
                        <div className="se-kpi-l">Completed</div>
                        <div className="se-kpi-v">{won}</div>
                        <span className="se-kpi-t g">Done &amp; delivered</span>
                    </div>
                    <div className="se-kpi">
                        <div className="se-kpi-icon" style={{ background: '#faf5ff', color: '#8b5cf6' }}>{'\u{1F4C5}'}</div>
                        <div className="se-kpi-l">Monthly Projects</div>
                        <div className="se-kpi-v">{o.thisMonth || recentProj.length}</div>
                        <span className="se-kpi-t n">This month</span>
                    </div>
                </>) : (<>
                    <div className="se-kpi">
                        <div className="se-kpi-icon" style={{ background: '#f0f9ff', color: '#0ea5e9' }}>$</div>
                        <div className="se-kpi-l">Total Revenue</div>
                        <div className="se-kpi-v">{fmt(r.total)}</div>
                        <span className={`se-kpi-t ${r.monthGrowth >= 0 ? 'g' : 'r'}`}>
                            {r.monthGrowth !== 0 ? pct(r.monthGrowth) + ' vs last month' : 'This month: ' + fmt(r.thisMonth)}
                        </span>
                    </div>
                    <div className="se-kpi">
                        <div className="se-kpi-icon" style={{ background: '#f0fdf4', color: '#22c55e' }}>&#10003;</div>
                        <div className="se-kpi-l">Paid Revenue</div>
                        <div className="se-kpi-v">{fmt(r.paid)}</div>
                        <span className={`se-kpi-t ${r.collectionRate >= 70 ? 'g' : 'r'}`}>
                            {r.collectionRate}% collection rate
                        </span>
                    </div>
                    <div className="se-kpi">
                        <div className="se-kpi-icon" style={{ background: '#faf5ff', color: '#8b5cf6' }}>&#9881;</div>
                        <div className="se-kpi-l">Active Projects</div>
                        <div className="se-kpi-v">{activeProjects}</div>
                        <span className="se-kpi-t n">
                            {r.unpaid > 0 ? fmt(r.unpaid) + ' unpaid' : 'All collected'}
                        </span>
                    </div>
                    <div className="se-kpi">
                        <div className="se-kpi-icon" style={{ background: '#fff7ed', color: '#f97316' }}>&#9734;</div>
                        <div className="se-kpi-l">Clients Owned</div>
                        <div className="se-kpi-v">{clientsOwned}</div>
                        <span className="se-kpi-t n">
                            {deals > 0 ? deals + ' active deals' : 'No active deals'}
                        </span>
                    </div>
                </>)}
            </div>

            {/* ── Outreach Metrics (PRD: Today / This Week / This Month) ── */}
            {!isEditor && <div className="se-outreach se-a se-a3">
                <div className="se-out-card">
                    <div className="se-out-v">{o.today}</div>
                    <div className="se-out-l">Emails Today</div>
                </div>
                <div className="se-out-card">
                    <div className="se-out-v">{o.thisWeek}</div>
                    <div className="se-out-l">This Week</div>
                </div>
                <div className="se-out-card">
                    <div className="se-out-v">{o.thisMonth}</div>
                    <div className="se-out-l">This Month</div>
                </div>
            </div>}

            {/* ── CTAs ── */}
            {!isEditor && <div className="se-cta se-a se-a3">
                <Link href="/actions" style={{ background: '#171717' }}>
                    <span style={{ fontSize: 16 }}>{'\u2192'}</span>
                    Action Queue
                    {replyN > 0 && <span style={{ marginLeft: 'auto', fontSize: 12, opacity: .6 }}>{replyN} waiting</span>}
                </Link>
                {r.unpaid > 0 ? (
                    <Link href="/clients" style={{ background: '#ef4444' }}>
                        <span style={{ fontSize: 16 }}>{'\u2192'}</span>
                        Collect {fmt(r.unpaid)}
                        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: .6 }}>outstanding</span>
                    </Link>
                ) : (
                    <Link href="/jarvis" style={{ background: '#171717' }}>
                        <span style={{ fontSize: 16 }}>{'\uD83E\uDD16'}</span>
                        Ask Jarvis
                    </Link>
                )}
            </div>}

            {/* ── Revenue Forecast + Active Campaigns (admin/sales) ── */}
            {!isEditor && addons && (
                <div className="se-row se-r2">
                    {/* Revenue Forecast */}
                    <div className="se-c">
                        <div className="se-c-h">
                            <span className="se-c-t">Revenue Forecast</span>
                            <span style={{
                                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                                background: addons.forecast.trend === 'up' ? '#f0fdf4' : addons.forecast.trend === 'down' ? '#fef2f2' : '#fafafa',
                                color: addons.forecast.trend === 'up' ? '#22c55e' : addons.forecast.trend === 'down' ? '#ef4444' : '#a3a3a3',
                            }}>
                                {addons.forecast.trend === 'up' ? '▲' : addons.forecast.trend === 'down' ? '▼' : '–'} {Math.abs(addons.forecast.trendPct)}% MoM
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.03em', color: '#171717' }}>{fmt(addons.forecast.nextMonthProjected)}</span>
                            <span style={{ fontSize: 12, color: '#a3a3a3' }}>projected next month</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14, padding: '12px 0', borderTop: '1px solid #f5f5f5' }}>
                            <div>
                                <div style={{ fontSize: 11, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: '.04em' }}>3-mo avg</div>
                                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{fmt(addons.forecast.last3MonthAvg)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: '.04em' }}>6-mo avg</div>
                                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{fmt(addons.forecast.last6MonthAvg)}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 48, marginTop: 12 }}>
                            {addons.forecast.monthly.map((m) => {
                                const max = Math.max(...addons.forecast.monthly.map(x => x.revenue), 1);
                                const h = Math.max(2, Math.round((m.revenue / max) * 42));
                                return (
                                    <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                        <div style={{
                                            width: '100%', height: h,
                                            background: m.projected ? 'repeating-linear-gradient(45deg, #0ea5e9, #0ea5e9 4px, #bae6fd 4px, #bae6fd 8px)' : '#0ea5e9',
                                            borderRadius: 3,
                                        }} title={`${m.month}: ${fmt(m.revenue)}${m.projected ? ' (projected)' : ''}`} />
                                        <span style={{ fontSize: 9, color: '#a3a3a3' }}>{m.month.slice(5)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Active Campaigns */}
                    <div className="se-c">
                        <div className="se-c-h">
                            <span className="se-c-t">Active Campaigns</span>
                            <Link href="/campaigns" className="se-c-a">View All →</Link>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                            <div>
                                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.03em', color: '#22c55e' }}>{addons.campaigns.running}</div>
                                <div style={{ fontSize: 11, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: '.04em' }}>Running</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.03em', color: '#f59e0b' }}>{addons.campaigns.paused}</div>
                                <div style={{ fontSize: 11, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: '.04em' }}>Paused</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.03em', color: '#171717' }}>{addons.campaigns.sentToday}</div>
                                <div style={{ fontSize: 11, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: '.04em' }}>Sent today</div>
                            </div>
                        </div>
                        {addons.campaigns.topRunning.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {addons.campaigns.topRunning.map(c => (
                                    <Link key={c.id} href={`/campaigns/${c.id}`} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 12px', background: '#fafafa', borderRadius: 8,
                                        textDecoration: 'none', color: 'inherit', fontSize: 12,
                                    }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                                            <span style={{ fontWeight: 600 }}>{c.name}</span>
                                        </div>
                                        <span style={{ color: '#a3a3a3', fontSize: 11 }}>{c.dailyLimit}/day</span>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div style={{ padding: '18px 16px', textAlign: 'center', borderRadius: 10, background: 'linear-gradient(135deg, #fafafa, #f5f5f5)', border: '1px dashed #e5e5e5' }}>
                                <div style={{ fontSize: 12, color: '#525252', marginBottom: 10, fontWeight: 500 }}>
                                    No running campaigns yet.
                                </div>
                                <Link href="/campaigns/new" style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    background: 'var(--accent, #1a73e8)', color: '#fff',
                                    padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                                    textDecoration: 'none',
                                }}>
                                    Launch Campaign →
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Revenue Chart + Recent Projects Table ── */}
            <div className={`se-row ${isEditor ? 'se-r2' : 'se-r3'} se-a se-a4`}>
                {!isEditor && <div className="se-c">
                    <div className="se-c-h">
                        <span className="se-c-t">Monthly Revenue</span>
                        <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.03em' }}>{fmt(r.thisMonth)}</span>
                    </div>
                    <div style={{ height: 220 }}>
                        {r.chart.length > 0 ? (
                            <RevenueBarChart data={r.chart} paidTotal={r.paid} totalRevenue={r.total} />
                        ) : (
                            <div className="se-empty">
                                <div className="se-empty-icon">&#128200;</div>
                                <div className="se-empty-text">No revenue data yet</div>
                                <div className="se-empty-sub">Revenue will appear as projects are closed</div>
                            </div>
                        )}
                    </div>
                    <div className="se-target">
                        <span className="se-target-label">Monthly Target</span>
                        <div className="se-target-bar">
                            <div className="se-target-fill" style={{
                                width: `${r.targetProgress}%`,
                                background: r.targetProgress >= 100 ? '#22c55e' : r.targetProgress >= 50 ? '#0ea5e9' : '#f59e0b'
                            }}/>
                        </div>
                        <span className="se-target-pct">{r.targetProgress}%</span>
                    </div>
                </div>}

                {/* ── Recent Projects Table (PRD) ── */}
                <div className="se-c" style={{ padding: '24px 0' }}>
                    <div className="se-c-h" style={{ padding: '0 24px' }}>
                        <span className="se-c-t">Recent Projects</span>
                        <Link href="/projects" className="se-c-a">View All &rarr;</Link>
                    </div>
                    {recentProj.length === 0 ? (
                        <div className="se-empty">
                            <div className="se-empty-icon">&#128203;</div>
                            <div className="se-empty-text">No projects yet</div>
                            <div className="se-empty-sub">Your first project will appear here once you close a deal.</div>
                        </div>
                    ) : (
                        <table className="se-tbl">
                            <thead><tr><th>Project</th><th>Status</th>{!isEditor && <><th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }}>Payment</th></>}</tr></thead>
                            <tbody>
                                {recentProj.map((p: any) => {
                                    const pay = PS[p.payment] || PS.UNPAID!;
                                    return (
                                        <tr key={p.id}>
                                            <td>
                                                <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{p.name}</div>
                                                <div style={{ fontSize: 10, color: '#a3a3a3' }}>{isEditor ? `Project – ${(p.id as string)?.slice(0, 6) || ''}` : p.client} &middot; {relDate(p.date)}</div>
                                            </td>
                                            <td><span style={{ fontSize: 11, color: '#525252' }}>{p.status}</span></td>
                                            {!isEditor && <>
                                                <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmt(p.value)}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <span className="se-pay" style={{ color: pay.color, background: pay.bg }}>{pay.label}</span>
                                                </td>
                                            </>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* ── Pipeline Health + Funnel + Top Clients ── */}
            {!isEditor && <div className="se-row se-r4 se-a se-a5">
                <div className="se-c">
                    <div className="se-c-h"><span className="se-c-t">Pipeline Health</span></div>
                    {(() => {
                        const stageKeys = ['COLD_LEAD', 'CONTACTED', 'LEAD', 'OFFER_ACCEPTED', 'CLOSED'];
                        const totalInStages = stageKeys.reduce((s, k) => s + (Number(pl[k]) || 0), 0);
                        if (totalInStages === 0) {
                            return (
                                <div className="se-empty">
                                    <div className="se-empty-icon">&#128200;</div>
                                    <div className="se-empty-text">No leads in your pipeline yet</div>
                                    <div className="se-empty-sub">Start outreach to see stages populate.</div>
                                    <Link href="/campaigns/new" style={{
                                        display: 'inline-block', marginTop: 12,
                                        background: '#171717', color: '#fff',
                                        padding: '8px 16px', borderRadius: 8,
                                        fontSize: 12, fontWeight: 600, textDecoration: 'none',
                                    }}>
                                        Start Outreach →
                                    </Link>
                                </div>
                            );
                        }
                        return (
                            <div className="se-bars">
                                {stageKeys.map(stage => {
                                    const n = Number(pl[stage]) || 0;
                                    const vals = Object.values(pl).map(v => Number(v) || 0);
                                    const max = vals.length > 0 ? Math.max(...vals, 1) : 1;
                                    return (
                                        <div className="se-bar-row" key={stage}>
                                            <span className="se-bar-l">{SL[stage]}</span>
                                            <div className="se-bar-track"><div className="se-bar-fill" style={{ width: `${(n / max) * 100}%`, background: SC[stage] }}/></div>
                                            <span className="se-bar-n">{n}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>

                <div className="se-c">
                    <div className="se-c-h"><span className="se-c-t">Conversion Funnel</span></div>
                    <div className="se-funnel">
                        {funnel.map((f: any, i: number) => (
                            <div key={f.stage} className="se-funnel-s" style={{
                                width: `${[100, 72, 48, 28][i]}%`,
                                background: ['#f97316', '#f59e0b', '#3b82f6', '#22c55e'][i],
                            }}>
                                {f.count > 0 ? `${f.stage} ${f.pct}%` : f.stage}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="se-c">
                    <div className="se-c-h"><span className="se-c-t">Top Clients</span></div>
                    {top.length === 0 ? (
                        <div className="se-empty">
                            <div className="se-empty-icon">&#128101;</div>
                            <div className="se-empty-text">No clients yet</div>
                        </div>
                    ) : top.slice(0, 5).map((c: any, i: number) => (
                        <div className="se-li" key={c.id}>
                            <div className="se-li-rank">{i + 1}</div>
                            <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#171717' }}>{fmt(c.total_revenue)}</div>
                        </div>
                    ))}
                </div>
            </div>}

            {/* ── Pipeline Table + Unpaid ── */}
            {!isEditor && <div className="se-row se-r3 se-a se-a5">
                <div className="se-c" style={{ padding: '24px 0' }}>
                    <div className="se-c-h" style={{ padding: '0 24px' }}>
                        <span className="se-c-t">Pipeline</span>
                        <Link href="/clients" className="se-c-a">View all &rarr;</Link>
                    </div>
                    <table className="se-tbl">
                        <thead><tr><th>Client</th><th>Stage</th><th style={{ textAlign: 'right' }}>Value</th></tr></thead>
                        <tbody>
                            {rows.slice(0, 8).map((c: any) => (
                                <tr key={c.id}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div className="se-av" style={{ background: SC[c.stage] || '#94a3b8' }}>{ini(c.name)}</div>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: 12 }}>{c.name}</div>
                                                {c.location && <div style={{ fontSize: 10, color: '#a3a3a3' }}>{c.location}</div>}
                                            </div>
                                        </div>
                                    </td>
                                    <td><span className="se-stage" style={{ background: (SC[c.stage] || '#94a3b8') + '14', color: SC[c.stage] || '#94a3b8' }}>{SL[c.stage] || c.stage}</span></td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{c.revenue > 0 ? fmt(c.revenue) : '\u2014'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ── Unpaid Clients ── */}
                <div className="se-c">
                    <div className="se-c-h">
                        <span className="se-c-t">Unpaid Invoices</span>
                        {r.unpaid > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.unpaid)}</span>}
                    </div>
                    {unpaidClients.length === 0 ? (
                        <div className="se-empty">
                            <div className="se-empty-icon">&#128176;</div>
                            <div className="se-empty-text">All invoices collected</div>
                        </div>
                    ) : unpaidClients.map((c: any) => (
                        <Link href={`/clients/${c.id}`} className="se-li" key={c.id}>
                            <div className="se-av" style={{ background: '#ef4444' }}>{ini(c.name)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                                <div style={{ fontSize: 10, color: '#a3a3a3' }}>{c.email}</div>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{fmt(c.unpaid_amount)}</span>
                        </Link>
                    ))}
                </div>
            </div>}

            {/* ── Reply Now + Activity ── */}
            {!isEditor && <div className="se-row se-r2 se-a se-a6">
                <div className="se-c">
                    <div className="se-c-h">
                        <span className="se-c-t">Needs Reply</span>
                        {replyN > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, color: '#fff', background: '#ef4444' }}>{replyN}</span>}
                    </div>
                    {reply.length === 0 ? (
                        <div className="se-empty">
                            <div className="se-empty-icon">&#9989;</div>
                            <div className="se-empty-text">All caught up!</div>
                            <div className="se-empty-sub">No pending replies right now</div>
                        </div>
                    ) : reply.map((c: any) => (
                        <Link href={`/clients/${c.id}`} className="se-li" key={c.id}>
                            <div className="se-av" style={{ background: '#171717' }}>{ini(c.name)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                                <div style={{ fontSize: 10, color: '#a3a3a3' }}>{c.email}</div>
                            </div>
                            <span style={{ fontSize: 11, color: c.days_since_last_contact <= 1 ? '#ef4444' : '#a3a3a3', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                {c.days_since_last_contact === 0 ? 'now' : c.days_since_last_contact + 'd'}
                            </span>
                        </Link>
                    ))}
                </div>

                <div className="se-c">
                    <div className="se-c-h"><span className="se-c-t">Recent Activity</span></div>
                    {feed.length === 0 ? (
                        <div className="se-empty">
                            <div className="se-empty-icon">&#128172;</div>
                            <div className="se-empty-text">No activity yet</div>
                            <div className="se-empty-sub">Start sending campaigns to see activity here</div>
                        </div>
                    ) : feed.slice(0, 8).map((a: any) => (
                        <div className="se-feed" key={a.id}>
                            <div className="se-dot" style={{ background: a.direction === 'RECEIVED' ? '#22c55e' : a.opened ? '#3b82f6' : '#d4d4d4' }}/>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {a.direction === 'RECEIVED' ? a.contactName + ' replied' : 'Sent to ' + a.contactName}
                                </div>
                                <div style={{ fontSize: 10, color: '#a3a3a3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.subject}</div>
                            </div>
                            <span style={{ fontSize: 10, color: '#d4d4d4', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{ago(a.sentAt)}</span>
                        </div>
                    ))}
                </div>
            </div>}

        </div></div>
        </>
    );
}
