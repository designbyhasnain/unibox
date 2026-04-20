'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { getCampaignsAction } from '../../src/actions/campaignActions';

const ICON = {
    filter: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    plus: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>,
    more: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>,
};

const Spark = ({ points, color = 'var(--ink-muted)' }: { points: number[]; color?: string }) => {
    const w = 64, h = 28;
    const max = Math.max(...points), min = Math.min(...points);
    const step = w / (points.length - 1);
    const d = points.map((p, i) => {
        const x = i * step;
        const y = h - ((p - min) / (max - min || 1)) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return <svg className="kpi-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}><path d={d} stroke={color} fill="none" strokeWidth="1.5" /></svg>;
};

type Campaign = {
    id: string; name: string; goal: string; status: string;
    contactCount: number; sentCount: number; openRate: number; replyRate: number;
    createdBy: { id: string; name: string } | null;
    sendingAccount: { id: string; email: string } | null;
};

const statusClass: Record<string, string> = { RUNNING: 'closed', PAUSED: 'warm', COMPLETED: 'lead', DRAFT: 'contacted', ARCHIVED: 'dead' };
const statusLabel: Record<string, string> = { RUNNING: 'running', PAUSED: 'paused', COMPLETED: 'completed', DRAFT: 'draft', ARCHIVED: 'archived' };

export default function CampaignsPage() {
    const hydrated = useHydrated();
    const router = useRouter();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getCampaignsAction()
            .then(data => setCampaigns(data as unknown as Campaign[]))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (!hydrated || loading) return <PageLoader isLoading type="list" count={6} context="inbox"><div /></PageLoader>;

    const running = campaigns.filter(c => c.status === 'RUNNING').length;
    const totalSent = campaigns.reduce((s, c) => s + (c.sentCount || 0), 0);
    const totalOpened = campaigns.reduce((s, c) => s + Math.round((c.sentCount || 0) * (c.openRate || 0) / 100), 0);
    const totalReplied = campaigns.reduce((s, c) => s + Math.round((c.sentCount || 0) * (c.replyRate || 0) / 100), 0);
    const avgOpen = totalSent ? ((totalOpened / totalSent) * 100).toFixed(1) : '0';
    const avgReply = totalSent ? ((totalReplied / totalSent) * 100).toFixed(1) : '0';

    const kpis = [
        { k: 'Active', v: String(running), d: `of ${campaigns.length} total`, sp: [3,4,5,5,6,6,7] },
        { k: 'Sent this week', v: totalSent.toLocaleString(), d: 'all campaigns', sp: [4,5,6,7,6,8,9] },
        { k: 'Open rate', v: `${avgOpen}%`, d: 'across campaigns', sp: [5,6,6,7,7,8,9] },
        { k: 'Reply rate', v: `${avgReply}%`, d: 'top metric', sp: [3,4,5,6,6,7,8] },
    ];

    return (
        <div className="cp-page">
            <div className="cp-content">
                <div className="page-head">
                    <div>
                        <h2>All campaigns</h2>
                        <div className="sub">{campaigns.length} total · {running} running · {campaigns.filter(c => c.status === 'PAUSED').length} paused</div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <button className="icon-btn" title="Filter">{ICON.filter}</button>
                    <Link href="/campaigns/new" className="btn btn-dark">{ICON.plus} New campaign</Link>
                </div>

                <div className="kpi-grid">
                    {kpis.map((k, i) => (
                        <div className="kpi" key={i}>
                            <div className="k">{k.k}</div>
                            <div className="v">{k.v}</div>
                            <div className="d"><span className="up">▲</span> {k.d}</div>
                            <Spark points={k.sp} color="var(--coach)" />
                        </div>
                    ))}
                </div>

                <table className="table">
                    <thead>
                        <tr>
                            <th>Campaign</th><th>Goal</th><th>Status</th>
                            <th className="num">Sent</th><th className="num">Opened</th><th className="num">Replied</th><th className="num">Reply %</th>
                            <th>Owner</th><th style={{ width: 1 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {campaigns.map(c => {
                            const rr = c.sentCount ? ((c.sentCount * (c.replyRate || 0) / 100) / c.sentCount * 100).toFixed(1) : '—';
                            const opened = Math.round((c.sentCount || 0) * (c.openRate || 0) / 100);
                            const replied = Math.round((c.sentCount || 0) * (c.replyRate || 0) / 100);
                            return (
                                <tr key={c.id} onClick={() => router.push(`/campaigns/${c.id}`)} style={{ cursor: 'pointer' }}>
                                    <td><b>{c.name}</b></td>
                                    <td style={{ color: 'var(--ink-muted)' }}>{c.goal?.replace(/_/g, ' ') || '—'}</td>
                                    <td><span className={`chip dot ${statusClass[c.status] || 'contacted'}`}>{statusLabel[c.status] || c.status}</span></td>
                                    <td className="num">{(c.sentCount || 0).toLocaleString()}</td>
                                    <td className="num" style={{ color: 'var(--ink-muted)' }}>{opened.toLocaleString()}</td>
                                    <td className="num">{replied}</td>
                                    <td className="num" style={{ fontWeight: 600 }}>{rr === '—' ? '—' : rr + '%'}</td>
                                    <td style={{ color: 'var(--ink-muted)' }}>{c.createdBy?.name || '—'}</td>
                                    <td><button className="icon-btn" onClick={e => e.stopPropagation()}>{ICON.more}</button></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <style>{`
.cp-page{height:100%;overflow-y:auto;background:var(--shell);font-family:var(--font-ui);color:var(--ink)}
.cp-content{padding:22px 26px}
.cp-page .page-head{display:flex;align-items:baseline;gap:14px;margin-bottom:18px;flex-wrap:wrap}
.cp-page .page-head h2{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:0}
.cp-page .page-head .sub{color:var(--ink-muted);font-size:13px;margin-top:4px;width:100%}
.cp-page .icon-btn{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;color:var(--ink-muted);border:none;background:none;cursor:pointer;transition:background .12s}
.cp-page .icon-btn:hover{background:var(--surface);color:var(--ink)}
.cp-page .btn{padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:500;display:inline-flex;align-items:center;gap:6px;border:none;cursor:pointer;font-family:var(--font-ui);text-decoration:none;transition:background .12s}
.cp-page .btn-dark{background:var(--ink);color:var(--canvas)}
.cp-page .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.cp-page .kpi{background:var(--surface);border:1px solid var(--hairline-soft);border-radius:14px;padding:14px 16px;position:relative;overflow:hidden}
.cp-page .kpi .k{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-muted);font-weight:500}
.cp-page .kpi .v{font-size:26px;font-weight:600;letter-spacing:-.02em;margin:6px 0 2px;font-variant-numeric:tabular-nums}
.cp-page .kpi .d{font-size:11.5px;color:var(--ink-muted)}
.cp-page .kpi .d .up{color:var(--coach)}
.cp-page .kpi-spark{position:absolute;right:10px;top:10px;width:64px;height:28px;opacity:.6}
.cp-page .table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--hairline-soft);border-radius:14px;overflow:hidden}
.cp-page .table th,.cp-page .table td{padding:11px 14px;text-align:left;font-size:12.5px}
.cp-page .table th{font-weight:500;color:var(--ink-muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em;background:color-mix(in oklab,var(--surface-2),transparent 20%);border-bottom:1px solid var(--hairline-soft)}
.cp-page .table tbody tr{border-bottom:1px solid var(--hairline-soft);transition:background .12s}
.cp-page .table tbody tr:last-child{border-bottom:0}
.cp-page .table tbody tr:hover{background:var(--surface-hover)}
.cp-page .num{text-align:right;font-variant-numeric:tabular-nums}
.cp-page .chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;font-size:11px;font-weight:500;border-radius:999px;background:var(--surface-2);color:var(--ink-2);border:1px solid var(--hairline-soft);white-space:nowrap}
.cp-page .chip.dot{padding-left:6px}
.cp-page .chip.dot::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}
.cp-page .chip.closed{background:color-mix(in oklab,var(--coach-soft),transparent 20%);color:var(--coach);border-color:transparent}
.cp-page .chip.warm{background:color-mix(in oklab,var(--warn-soft),transparent 20%);color:var(--warn);border-color:transparent}
.cp-page .chip.lead{background:color-mix(in oklab,var(--accent-soft),transparent 15%);color:var(--accent-ink);border-color:transparent}
.cp-page .chip.contacted{background:var(--surface-2);color:var(--ink-2)}
.cp-page .chip.dead{background:color-mix(in oklab,var(--danger-soft),transparent 20%);color:var(--danger);border-color:transparent}
            `}</style>
        </div>
    );
}
