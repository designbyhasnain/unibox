'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { getSalesDashboardAction } from '../../src/actions/dashboardActions';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';

const RevenueChart = dynamic(() => import('../components/RevenueChart'), { ssr: false });
const OnboardingWizard = dynamic(() => import('../components/OnboardingWizard'), { ssr: false });

/* ── Helpers ────────────────────────────────────────────────────────────── */
function fmt(n: number) { return n >= 10000 ? '$' + (n / 1000).toFixed(0) + 'k' : n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + n.toLocaleString(); }
function pct(n: number) { return (n > 0 ? '+' : '') + n + '%'; }
function ago(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); return m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd'; }
function ini(n: string) { return (n || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }

const SC: Record<string, string> = { COLD_LEAD: '#94a3b8', CONTACTED: '#3b82f6', WARM_LEAD: '#f59e0b', LEAD: '#8b5cf6', OFFER_ACCEPTED: '#10b981', CLOSED: '#34d399', NOT_INTERESTED: '#f87171' };
const SL: Record<string, string> = { COLD_LEAD: 'Cold', CONTACTED: 'Contacted', WARM_LEAD: 'Warm', LEAD: 'Lead', OFFER_ACCEPTED: 'Proposal', CLOSED: 'Won', NOT_INTERESTED: 'Lost' };

/* ── Component ──────────────────────────────────────────────────────────── */
export default function Dashboard() {
    const hydrated = useHydrated();
    const [name, setName] = useState('');
    const [d, setD] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [onboard, setOnboard] = useState(false);

    useEffect(() => {
        Promise.all([getCurrentUserAction(), getSalesDashboardAction()])
            .then(([u, dash]) => {
                setName(u?.name?.split(' ')[0] || '');
                setD(dash);
                setLoading(false);
                try { if (!localStorage.getItem('unibox_onboarding_done')) setOnboard(true); } catch {}
            }).catch(() => setLoading(false));
    }, []);

    if (!hydrated || loading) return <PageLoader isLoading type="grid" count={6}><div /></PageLoader>;

    const s = d?.stats || { sent: 0, replies: 0, newLeads: 0, replyRate: 0 };
    const r = d?.revenue || { total: 0, paid: 0, unpaid: 0, projects: 0, collectionRate: 0, thisMonth: 0, lastMonth: 0, monthGrowth: 0, targetProgress: 0, monthlyTarget: 10000, chart: [] };
    const pl = d?.pipeline || {};
    const funnel = d?.funnel || [];
    const reply = d?.needReply || [];
    const top = d?.topClients || [];
    const rows = d?.pipelineContacts || [];
    const feed = d?.recentActivity || [];
    const replyN = d?.replyNowCount || 0;

    const deals = Number(pl['CONTACTED'] || 0) + Number(pl['WARM_LEAD'] || 0) + Number(pl['LEAD'] || 0) + Number(pl['OFFER_ACCEPTED'] || 0);
    const won = Number(pl['CLOSED'] || 0);
    const score = Math.min(100, Math.round((s.replyRate + r.collectionRate + r.targetProgress) / 3));

    return (
        <>
        {onboard && <OnboardingWizard userName={name} onComplete={() => setOnboard(false)} />}

        <style>{`
/* ── Base ── */
.db{height:100%;overflow-y:auto;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#111}
.db-in{max-width:1140px;margin:0 auto;padding:28px 36px 48px}

/* ── Header ── */
.db-hd{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid #f0f0f0}
.db-hd h1{font-size:24px;font-weight:700;letter-spacing:-.025em;margin:0}
.db-hd p{font-size:13px;color:#999;margin:4px 0 0;font-weight:400}
.db-score{display:flex;align-items:center;gap:14px}
.db-ring{position:relative;width:48px;height:48px}
.db-ring svg{transform:rotate(-90deg)}
.db-ring-n{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}

/* ── KPI Strip ── */
.db-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#f0f0f0;border:1px solid #f0f0f0;border-radius:12px;overflow:hidden;margin-bottom:24px}
.db-kpi{background:#fff;padding:20px 22px}
.db-kpi:first-child{border-radius:12px 0 0 12px}
.db-kpi:last-child{border-radius:0 12px 12px 0}
.db-kpi-l{font-size:11px;color:#999;font-weight:500;margin-bottom:8px;letter-spacing:.01em}
.db-kpi-v{font-size:30px;font-weight:700;letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums}
.db-kpi-t{font-size:11px;font-weight:600;margin-top:6px;display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:4px}
.db-kpi-t.g{color:#16a34a;background:#f0fdf4}.db-kpi-t.r{color:#dc2626;background:#fef2f2}.db-kpi-t.n{color:#999;background:#fafafa}

/* ── Cards ── */
.db-row{display:grid;gap:20px;margin-bottom:20px}
.db-row-2{grid-template-columns:1fr 1fr}
.db-row-3{grid-template-columns:5fr 3fr}
.db-row-4{grid-template-columns:3fr 2fr 2fr}
.db-c{background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:22px 24px;transition:box-shadow .15s}
.db-c:hover{box-shadow:0 2px 8px rgba(0,0,0,.03)}
.db-c-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.db-c-t{font-size:13px;font-weight:600;color:#111}
.db-c-a{font-size:12px;color:#888;text-decoration:none;font-weight:500}
.db-c-a:hover{color:#111}
.db-c-badge{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;color:#fff}

/* ── Target ── */
.db-target{display:flex;align-items:center;gap:12px;margin-top:14px;padding-top:14px;border-top:1px solid #f8f8f8}
.db-target-bar{flex:1;height:4px;background:#f5f5f5;border-radius:2px;overflow:hidden}
.db-target-fill{height:100%;border-radius:2px;transition:width .8s cubic-bezier(.4,0,.2,1)}
.db-target-label{font-size:11px;color:#999;font-weight:500;white-space:nowrap}
.db-target-pct{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;min-width:36px;text-align:right}

/* ── Pipeline Bars ── */
.db-bars{display:flex;flex-direction:column;gap:12px}
.db-bar-row{display:grid;grid-template-columns:70px 1fr 36px;align-items:center;gap:10px}
.db-bar-l{font-size:12px;color:#666;font-weight:500}
.db-bar-track{height:6px;background:#f5f5f5;border-radius:3px;overflow:hidden}
.db-bar-fill{height:100%;border-radius:3px;transition:width .6s cubic-bezier(.4,0,.2,1)}
.db-bar-n{font-size:12px;font-weight:600;color:#333;text-align:right;font-variant-numeric:tabular-nums}

/* ── Funnel ── */
.db-funnel{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 0}
.db-funnel-s{display:flex;align-items:center;justify-content:center;padding:10px 12px;border-radius:6px;font-size:11px;font-weight:600;color:#fff;transition:width .6s cubic-bezier(.4,0,.2,1);letter-spacing:.01em}

/* ── Table ── */
.db-tbl{width:100%}
.db-tbl th{font-size:11px;font-weight:500;color:#999;text-align:left;padding:0 12px 10px;letter-spacing:.01em}
.db-tbl td{font-size:13px;padding:10px 12px;border-top:1px solid #f8f8f8}
.db-tbl tr:hover td{background:#fafafa}
.db-av{width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#fff;flex-shrink:0}
.db-stage{font-size:10px;font-weight:600;padding:3px 8px;border-radius:5px;letter-spacing:.01em}
.db-health{width:32px;height:3px;border-radius:1.5px;display:inline-block}

/* ── List ── */
.db-li{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f8f8f8;text-decoration:none;color:inherit;transition:background .1s}
.db-li:last-child{border:none}
.db-li:hover{background:#fafafa;margin:0 -8px;padding-left:8px;padding-right:8px;border-radius:6px}
.db-li-rank{width:22px;height:22px;border-radius:6px;background:#f5f5f5;font-size:10px;font-weight:700;color:#666;display:flex;align-items:center;justify-content:center;flex-shrink:0}

/* ── Feed ── */
.db-feed{display:flex;gap:8px;padding:4px 0;align-items:flex-start}
.db-dot{width:5px;height:5px;border-radius:50%;margin-top:6px;flex-shrink:0}

/* ── CTA ── */
.db-cta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
.db-cta a{display:flex;align-items:center;gap:10px;padding:14px 18px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:600;color:#fff;transition:transform .12s,opacity .12s}
.db-cta a:hover{transform:translateY(-1px);opacity:.92}

/* ── Anim ── */
@keyframes up{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.db-a{animation:up .25s ease both}
.db-a1{animation-delay:0s}.db-a2{animation-delay:30ms}.db-a3{animation-delay:60ms}.db-a4{animation-delay:90ms}.db-a5{animation-delay:120ms}
        `}</style>

        <div className="db"><div className="db-in">

            {/* ── Header ── */}
            <div className="db-hd db-a db-a1">
                <div>
                    <h1>{name ? `${name}\u2019s Dashboard` : 'Dashboard'}</h1>
                    <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
                <div className="db-score">
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>Performance</div>
                        <div style={{ fontSize: 11, color: '#999' }}>{fmt(r.thisMonth)} / {fmt(r.monthlyTarget)}</div>
                    </div>
                    <div className="db-ring">
                        <svg width="48" height="48" viewBox="0 0 48 48">
                            <circle cx="24" cy="24" r="20" fill="none" stroke="#f0f0f0" strokeWidth="3"/>
                            <circle cx="24" cy="24" r="20" fill="none" stroke={score >= 60 ? '#22c55e' : score >= 30 ? '#f59e0b' : '#ef4444'} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${score * 1.257} 125.7`}/>
                        </svg>
                        <div className="db-ring-n">{score}</div>
                    </div>
                </div>
            </div>

            {/* ── KPI Strip ── */}
            <div className="db-kpis db-a db-a2">
                {[
                    { l: 'Active Deals', v: String(deals), t: deals > 0 ? `${won} won` : null, c: 'n' },
                    { l: 'Revenue', v: fmt(r.thisMonth), t: r.monthGrowth !== 0 ? pct(r.monthGrowth) : null, c: r.monthGrowth >= 0 ? 'g' : 'r' },
                    { l: 'Collection', v: r.collectionRate + '%', t: fmt(r.paid) + ' of ' + fmt(r.total), c: r.collectionRate >= 70 ? 'g' : 'r' },
                    { l: 'Emails Sent', v: s.sent.toLocaleString(), t: s.replies > 0 ? s.replies + ' replies' : null, c: s.replyRate > 5 ? 'g' : 'n' },
                ].map(k => (
                    <div className="db-kpi" key={k.l}>
                        <div className="db-kpi-l">{k.l}</div>
                        <div className="db-kpi-v">{k.v}</div>
                        {k.t && <span className={`db-kpi-t ${k.c}`}>{k.t}</span>}
                    </div>
                ))}
            </div>

            {/* ── CTAs ── */}
            <div className="db-cta db-a db-a3">
                <Link href="/actions" style={{ background: '#111' }}>
                    <span style={{ fontSize: 16 }}>{'\u2192'}</span>
                    Action Queue
                    {replyN > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, opacity: .5 }}>{replyN} waiting</span>}
                </Link>
                {r.unpaid > 0 ? (
                    <Link href="/clients" style={{ background: '#dc2626' }}>
                        <span style={{ fontSize: 16 }}>{'\u2192'}</span>
                        Collect {fmt(r.unpaid)}
                        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: .5 }}>outstanding</span>
                    </Link>
                ) : (
                    <Link href="/jarvis" style={{ background: '#111' }}>
                        <span style={{ fontSize: 16 }}>{'\uD83E\uDD16'}</span>
                        Ask Jarvis
                    </Link>
                )}
            </div>

            {/* ── Revenue + Pipeline Table ── */}
            <div className="db-row db-row-3 db-a db-a4">
                <div className="db-c">
                    <div className="db-c-h">
                        <span className="db-c-t">Revenue</span>
                        <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.03em' }}>{fmt(r.thisMonth)}</span>
                    </div>
                    <div style={{ height: 180 }}>
                        {r.chart.length > 0 ? <RevenueChart data={r.chart} /> : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ddd', fontSize: 13 }}>No data yet</div>
                        )}
                    </div>
                    <div className="db-target">
                        <span className="db-target-label">Target</span>
                        <div className="db-target-bar">
                            <div className="db-target-fill" style={{ width: `${r.targetProgress}%`, background: r.targetProgress >= 100 ? '#22c55e' : r.targetProgress >= 50 ? '#111' : '#f59e0b' }}/>
                        </div>
                        <span className="db-target-pct">{r.targetProgress}%</span>
                    </div>
                </div>

                <div className="db-c" style={{ padding: '22px 0' }}>
                    <div className="db-c-h" style={{ padding: '0 24px' }}>
                        <span className="db-c-t">Pipeline</span>
                        <Link href="/clients" className="db-c-a">View all</Link>
                    </div>
                    <table className="db-tbl">
                        <thead><tr><th>Client</th><th>Stage</th><th style={{ textAlign: 'right' }}>Value</th></tr></thead>
                        <tbody>
                            {rows.slice(0, 6).map((c: any) => (
                                <tr key={c.id}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div className="db-av" style={{ background: SC[c.stage] || '#94a3b8' }}>{ini(c.name)}</div>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: 12 }}>{c.name}</div>
                                                {c.location && <div style={{ fontSize: 10, color: '#aaa' }}>{c.location}</div>}
                                            </div>
                                        </div>
                                    </td>
                                    <td><span className="db-stage" style={{ background: (SC[c.stage] || '#94a3b8') + '14', color: SC[c.stage] || '#94a3b8' }}>{SL[c.stage] || c.stage}</span></td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{c.revenue > 0 ? fmt(c.revenue) : '\u2014'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Pipeline Health + Funnel + Top Clients ── */}
            <div className="db-row db-row-4 db-a db-a5">
                <div className="db-c">
                    <div className="db-c-h"><span className="db-c-t">Pipeline Health</span></div>
                    <div className="db-bars">
                        {['COLD_LEAD', 'CONTACTED', 'LEAD', 'OFFER_ACCEPTED', 'CLOSED'].map(stage => {
                            const n = Number(pl[stage]) || 0;
                            const vals = Object.values(pl).map(v => Number(v) || 0);
                            const max = vals.length > 0 ? Math.max(...vals, 1) : 1;
                            return (
                                <div className="db-bar-row" key={stage}>
                                    <span className="db-bar-l">{SL[stage]}</span>
                                    <div className="db-bar-track"><div className="db-bar-fill" style={{ width: `${(n / max) * 100}%`, background: SC[stage] }}/></div>
                                    <span className="db-bar-n">{n}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="db-c">
                    <div className="db-c-h"><span className="db-c-t">Funnel</span></div>
                    <div className="db-funnel">
                        {funnel.map((f: any, i: number) => (
                            <div key={f.stage} className="db-funnel-s" style={{
                                width: `${[100, 72, 48, 28][i]}%`,
                                background: ['#f97316', '#f59e0b', '#3b82f6', '#22c55e'][i],
                                fontSize: i === 0 ? 12 : 10,
                            }}>
                                {f.count > 0 ? `${f.pct}%` : '0'}
                            </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 8, fontSize: 10, color: '#aaa' }}>
                            <span>Leads</span><span>Won</span>
                        </div>
                    </div>
                </div>

                <div className="db-c">
                    <div className="db-c-h"><span className="db-c-t">Top Clients</span></div>
                    {top.length === 0 ? (
                        <div style={{ color: '#ddd', fontSize: 12, padding: 16, textAlign: 'center' }}>No clients yet</div>
                    ) : top.slice(0, 5).map((c: any, i: number) => (
                        <div className="db-li" key={c.id}>
                            <div className="db-li-rank">{i + 1}</div>
                            <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#111' }}>{fmt(c.total_revenue)}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Reply Now + Activity ── */}
            <div className="db-row db-row-2">
                <div className="db-c">
                    <div className="db-c-h">
                        <span className="db-c-t">Needs Reply</span>
                        {replyN > 0 && <span className="db-c-badge" style={{ background: '#ef4444' }}>{replyN}</span>}
                    </div>
                    {reply.length === 0 ? (
                        <div style={{ color: '#ccc', fontSize: 12, padding: 12, textAlign: 'center' }}>All caught up</div>
                    ) : reply.map((c: any) => (
                        <Link href={`/clients/${c.id}`} className="db-li" key={c.id}>
                            <div className="db-av" style={{ background: '#111' }}>{ini(c.name)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                                <div style={{ fontSize: 10, color: '#aaa' }}>{c.email}</div>
                            </div>
                            <span style={{ fontSize: 10, color: c.days_since_last_contact <= 1 ? '#ef4444' : '#999', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                {c.days_since_last_contact === 0 ? 'now' : c.days_since_last_contact + 'd'}
                            </span>
                        </Link>
                    ))}
                </div>

                <div className="db-c">
                    <div className="db-c-h"><span className="db-c-t">Activity</span></div>
                    {feed.length === 0 ? (
                        <div style={{ color: '#ccc', fontSize: 12, padding: 12, textAlign: 'center' }}>No activity yet</div>
                    ) : feed.slice(0, 7).map((a: any) => (
                        <div className="db-feed" key={a.id}>
                            <div className="db-dot" style={{ background: a.direction === 'RECEIVED' ? '#22c55e' : '#ccc' }}/>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {a.direction === 'RECEIVED' ? a.contactName + ' replied' : 'Sent to ' + a.contactName}
                                </div>
                                <div style={{ fontSize: 10, color: '#bbb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.subject}</div>
                            </div>
                            <span style={{ fontSize: 10, color: '#ccc', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{ago(a.sentAt)}</span>
                        </div>
                    ))}
                </div>
            </div>

        </div></div>
        </>
    );
}
