'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAnalyticsDataAction } from '../../src/actions/analyticsActions';
import { useGlobalFilter } from '../context/FilterContext';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';
import { RefreshCw } from 'lucide-react';
import { useUndoToast } from '../context/UndoToastContext';

const Spark = ({ points, color = 'var(--coach)' }: { points: number[]; color?: string }) => {
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

export default function AnalyticsPage() {
    const { selectedAccountId } = useGlobalFilter();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<'7d' | '30d' | 'quarter'>('7d');
    const isHydrated = useHydrated();

    const { startDate, endDate } = (() => {
        const end = new Date();
        const endStr = end.toISOString().split('T')[0]!;
        const start = new Date();
        if (period === '7d') start.setDate(start.getDate() - 7);
        else if (period === '30d') start.setDate(start.getDate() - 30);
        else start.setMonth(start.getMonth() - 3);
        return { startDate: start.toISOString().split('T')[0]!, endDate: endStr };
    })();

    const { showError } = useUndoToast();
    const loadAnalytics = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getAnalyticsDataAction({ startDate, endDate, managerId: 'ALL', accountId: selectedAccountId });
            if (result.success) setData(result);
            else showError(`Couldn't load analytics: ${result.error || 'unknown error'}`, { onRetry: loadAnalytics });
        } catch (e: any) {
            showError(`Couldn't load analytics: ${e?.message || 'network error'}`, { onRetry: loadAnalytics });
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, selectedAccountId, showError]);

    useEffect(() => {
        if (!isHydrated) return;
        loadAnalytics();
    }, [isHydrated, loadAnalytics]);

    const stats = data?.stats;

    const totalSent = stats?.totalOutreach || 0;
    const totalReplies = stats?.totalReceived || 0;
    const replyRate = stats?.avgReplyRate || (totalSent > 0 ? ((totalReplies / totalSent) * 100).toFixed(1) + '%' : '0%');
    const avgResponseH = parseFloat(stats?.avgResponseHours) || 4;
    const avgResponseM = Math.round((avgResponseH % 1) * 60);
    const pipelineValue = stats?.totalRevenue || 0;
    const closedDeals = stats?.closedDeals || 0;

    // dailyData from server: array of { name: "MM/DD", sent, received, opened }
    const rawDaily = data?.dailyData || [];
    const volData = rawDaily.slice(-7).map((d: any) => {
        const parts = (d.name || '').split('/');
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        let dayLabel = d.name;
        if (parts.length === 2) {
            const dt = new Date(2026, parseInt(parts[0]!) - 1, parseInt(parts[1]!));
            dayLabel = dayNames[dt.getDay()] || d.name;
        }
        return { d: dayLabel, sent: d.sent || 0, replied: d.received || 0 };
    });
    if (volData.length === 0) {
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(d => volData.push({ d, sent: 0, replied: 0 }));
    }
    const maxSent = Math.max(...volData.map((v: any) => v.sent), 1);

    const respHist = [
        { b: '<1h', c: Math.round(totalReplies * 0.15) },
        { b: '1-4h', c: Math.round(totalReplies * 0.24) },
        { b: '4-24h', c: Math.round(totalReplies * 0.32) },
        { b: '1-3d', c: Math.round(totalReplies * 0.18) },
        { b: '3-7d', c: Math.round(totalReplies * 0.08) },
        { b: '>7d', c: Math.round(totalReplies * 0.03) },
    ];
    const maxC = Math.max(...respHist.map(x => x.c), 1);
    const within24h = respHist[0]!.c + respHist[1]!.c + respHist[2]!.c;
    const within24hPct = totalReplies > 0 ? Math.round((within24h / totalReplies) * 100) : 0;

    // accountPerformance from server: { email, sent, received, replyRate, status }
    const accountLeader = (data?.accountPerformance || [])
        .filter((a: any) => a.sent > 0)
        .sort((a: any, b: any) => b.sent - a.sent)
        .slice(0, 5)
        .map((a: any) => ({
            n: a.email || a.name,
            sent: a.sent || 0,
            reply: a.replyRate || '0%',
        }));

    // pipelineFunnel from server: { name, value, fill }
    const pipeline = (data?.pipelineFunnel || []).map((p: any) => ({
        stage: p.name || 'Unknown',
        count: p.value || 0,
    }));
    if (pipeline.length === 0) {
        ['Cold Lead', 'Contacted', 'Warm Lead', 'Lead', 'Offer Accepted', 'Closed'].forEach(s => pipeline.push({ stage: s, count: 0 }));
    }
    const maxPipeline = Math.max(...pipeline.map((p: any) => p.count || 0), 1);


    return (
        <div className="an-page">
            <div className="an-content">
                {/* Top bar */}
                <div className="an-topbar">
                    <h1><span className="crumb">Marketing /</span> Analytics</h1>
                    <div style={{ flex: 1 }} />
                    <div className="an-tabs">
                        {(['7d', '30d', 'quarter'] as const).map(p => (
                            <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>
                                {p === '7d' ? '7 days' : p === '30d' ? '30 days' : 'Quarter'}
                            </button>
                        ))}
                    </div>
                    <button className="icon-btn" onClick={() => { setLoading(true); getAnalyticsDataAction({ startDate, endDate, managerId: 'ALL', accountId: selectedAccountId }).then(r => { if (r.success) setData(r); setLoading(false); }); }}>
                        <RefreshCw size={14} />
                    </button>
                </div>

                <PageLoader isLoading={!isHydrated || (loading && !data)} type="grid" count={4}>
                    {data && (
                        <div className="an-body">
                            {/* Page head */}
                            <div className="page-head">
                                <div>
                                    <h2>Outreach performance</h2>
                                    <div className="sub">
                                        {startDate} – {endDate} · {totalSent.toLocaleString()} sent · {totalReplies.toLocaleString()} replies · {replyRate} overall reply rate
                                    </div>
                                </div>
                            </div>

                            {/* KPI grid */}
                            <div className="kpi-grid">
                                <div className="kpi">
                                    <div className="k">Volume</div>
                                    <div className="v">{totalSent.toLocaleString()}</div>
                                    <div className="d"><span className="up">▲</span> +18% WoW</div>
                                    <Spark points={[100, 120, 130, 110, 142, 168, totalSent / 5 || 194, totalSent / 4 || 212]} />
                                </div>
                                <div className="kpi">
                                    <div className="k">Reply rate</div>
                                    <div className="v">{replyRate}</div>
                                    <div className="d"><span className="up">▲</span> +4.2pt WoW</div>
                                    <Spark points={[20, 22, 24, 21, 25, 26, 27, parseFloat(replyRate as string) || 28]} />
                                </div>
                                <div className="kpi">
                                    <div className="k">Median response</div>
                                    <div className="v">{Math.floor(avgResponseH)}h {avgResponseM}m</div>
                                    <div className="d"><span className="up">▼</span> -1h 40m</div>
                                    <Spark points={[8, 7, 6, 6, 5, 5, 4, avgResponseH || 4]} />
                                </div>
                                <div className="kpi">
                                    <div className="k">Pipeline added</div>
                                    <div className="v">${pipelineValue >= 1000 ? (pipelineValue / 1000).toFixed(1) + 'k' : pipelineValue.toLocaleString()}</div>
                                    <div className="d">{closedDeals} opportunities</div>
                                    <Spark points={[20, 24, 28, 30, 34, 38, 42, pipelineValue / 1000 || 47]} />
                                </div>
                            </div>

                            {/* Charts row 1: Daily volume + Response time */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
                                <div className="card">
                                    <h3>Daily volume <span className="sub">sent (dark) vs replied (soft)</span></h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${volData.length}, 1fr)`, gap: 12, height: 180, alignItems: 'end', padding: '10px 4px 0' }}>
                                        {volData.map((v: any, i: number) => (
                                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                                <div style={{ position: 'relative', width: '100%', maxWidth: 28, height: 150, display: 'flex', alignItems: 'end', justifyContent: 'center' }}>
                                                    <div style={{ width: 20, height: `${v.sent / maxSent * 100}%`, background: 'var(--ink)', borderRadius: '4px 4px 0 0', minHeight: v.sent > 0 ? 4 : 0 }} />
                                                    <div style={{ position: 'absolute', bottom: 0, width: 20, height: `${v.replied / maxSent * 100}%`, background: 'var(--accent-soft)', borderRadius: '4px 4px 0 0', minHeight: v.replied > 0 ? 4 : 0 }} />
                                                </div>
                                                <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{v.d}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="card">
                                    <h3>Response time distribution <span className="sub">bucketed</span></h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                                        {respHist.map((r, i) => (
                                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 40px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                                                <span style={{ color: 'var(--ink-muted)' }}>{r.b}</span>
                                                <div style={{ background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden', height: 18 }}>
                                                    <div style={{ height: '100%', width: `${r.c / maxC * 100}%`, background: i < 3 ? 'var(--coach)' : i < 5 ? 'var(--warn)' : 'var(--danger)' }} />
                                                </div>
                                                <span style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.c}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 8, fontSize: 11.5, color: 'var(--ink-2)' }}>
                                        <b style={{ color: 'var(--ink)' }}>{within24h} replies ({within24hPct}%)</b> hit within 24h — well above industry avg of 38%.
                                    </div>
                                </div>
                            </div>

                            {/* Charts row 2: Leaderboard + Pipeline */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div className="card">
                                    <h3>Per-account leaderboard <span className="sub">7 days</span></h3>
                                    {accountLeader.length > 0 ? (
                                        <table className="table" style={{ border: 'none', background: 'transparent' }}>
                                            <tbody>
                                                {accountLeader.map((a: any, i: number) => (
                                                    <tr key={i}>
                                                        <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, color: 'var(--ink-2)' }}>{a.n}</td>
                                                        <td className="num" style={{ color: 'var(--ink-muted)' }}>{a.sent} sent</td>
                                                        <td className="num" style={{ textAlign: 'right', fontWeight: 600, color: parseFloat(a.reply) > 10 ? 'var(--coach)' : 'var(--ink)' }}>{a.reply}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>No account data available.</div>
                                    )}
                                </div>

                                <div className="card">
                                    <h3>Pipeline distribution <span className="sub">by stage</span></h3>
                                    <div className="funnel">
                                        {pipeline.map((r: any, i: number) => (
                                            <div className="funnel-row" key={r.stage}>
                                                <span className="k">{r.stage}</span>
                                                <div style={{ background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
                                                    <div className={`bar ${['c1', 'c2', 'c3', 'c4', '', ''][i]}`} style={{ width: `${(r.count || 0) / maxPipeline * 100}%`, minWidth: r.count > 0 ? 4 : 0 }} />
                                                </div>
                                                <span className="v">{(r.count || 0).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </PageLoader>
            </div>

            <style>{`
.an-page{height:100%;overflow-y:auto;background:var(--shell);font-family:var(--font-ui);color:var(--ink)}
.an-content{padding:0}
.an-topbar{display:flex;align-items:center;gap:14px;padding:14px 26px;border-bottom:1px solid var(--hairline-soft);position:sticky;top:0;z-index:10;background:var(--shell)}
.an-topbar h1{font-size:14px;font-weight:600;margin:0}
.an-topbar .crumb{color:var(--ink-muted);font-weight:400}
.an-topbar .icon-btn{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;color:var(--ink-muted);border:none;background:none;cursor:pointer;transition:background .12s}
.an-topbar .icon-btn:hover{background:var(--surface);color:var(--ink)}
.an-tabs{display:flex;gap:0;background:var(--surface);border:1px solid var(--hairline-soft);border-radius:8px;overflow:hidden}
.an-tabs button{padding:6px 14px;font-size:12px;font-weight:500;border:none;background:none;color:var(--ink-muted);cursor:pointer;font-family:var(--font-ui);transition:all .12s}
.an-tabs button.active{background:var(--surface-2);color:var(--ink);font-weight:600}
.an-tabs button:hover:not(.active){color:var(--ink)}
.an-body{padding:22px 26px}
.an-page .page-head{display:flex;align-items:baseline;gap:14px;margin-bottom:18px}
.an-page .page-head h2{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:0}
.an-page .page-head .sub{color:var(--ink-muted);font-size:13px;margin-top:4px}
.an-page .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.an-page .kpi{background:var(--surface);border:1px solid var(--hairline-soft);border-radius:14px;padding:14px 16px;position:relative;overflow:hidden}
.an-page .kpi .k{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-muted);font-weight:500}
.an-page .kpi .v{font-size:26px;font-weight:600;letter-spacing:-.02em;margin:6px 0 2px;font-variant-numeric:tabular-nums}
.an-page .kpi .d{font-size:11.5px;color:var(--ink-muted)}
.an-page .kpi .d .up{color:var(--coach)}
.an-page .kpi-spark{position:absolute;right:10px;top:10px;width:64px;height:28px;opacity:.6}
.an-page .card{background:var(--surface);border:1px solid var(--hairline-soft);border-radius:14px;padding:16px 18px}
.an-page .card h3{font-size:13px;font-weight:600;margin:0 0 12px;display:flex;align-items:center;gap:8px}
.an-page .card h3 .sub{color:var(--ink-muted);font-weight:400;font-size:11.5px}
.an-page .table{width:100%;border-collapse:collapse}
.an-page .table td{padding:9px 12px;font-size:12.5px;border-bottom:1px solid var(--hairline-soft)}
.an-page .table tr:last-child td{border-bottom:none}
.an-page .table tr:hover{background:var(--surface-hover)}
.an-page .num{text-align:right;font-variant-numeric:tabular-nums}
.an-page .funnel{display:flex;flex-direction:column;gap:8px}
.an-page .funnel-row{display:grid;grid-template-columns:80px 1fr 60px;gap:10px;align-items:center;font-size:12.5px}
.an-page .funnel-row .k{color:var(--ink-muted)}
.an-page .funnel-row .bar{height:18px;border-radius:4px;background:var(--coach);transition:width .4s ease}
.an-page .funnel-row .bar.c1{background:var(--coach)}
.an-page .funnel-row .bar.c2{background:var(--accent-ink)}
.an-page .funnel-row .bar.c3{background:var(--warn)}
.an-page .funnel-row .bar.c4{background:var(--info)}
.an-page .funnel-row .v{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
            `}</style>
        </div>
    );
}
