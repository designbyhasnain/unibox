'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSalesDashboardAction } from '../../src/actions/dashboardActions';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { getDailyBriefingAction, regenerateDailyBriefingAction } from '../../src/actions/jarvisActions';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';
import EditorTodayView from '../components/EditorTodayView';
import { useUndoToast } from '../context/UndoToastContext';
import { usePerfMonitor } from '../hooks/usePerfMonitor';

function fmt(n: number) {
    if (n >= 10000) return '$' + (n / 1000).toFixed(0) + 'k';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
    return '$' + n.toLocaleString();
}

const Spark = ({ points, color = 'var(--ink-muted)' }: { points: number[]; color?: string }) => {
    const w = 64, h = 28;
    const max = Math.max(...points), min = Math.min(...points);
    const step = w / (points.length - 1);
    const d = points.map((p, i) => {
        const x = i * step;
        const y = h - ((p - min) / (max - min || 1)) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return (
        <svg className="kpi-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <path d={d} stroke={color} fill="none" strokeWidth="1.5" />
        </svg>
    );
};

const ICON = {
    spark: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L9 12l-7 0 5.5 5L5 22l7-4.5L19 22l-2.5-5L22 12h-7L12 2z"/></svg>,
    refresh: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
    mic: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
    calendar: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    bell: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
};

export default function Dashboard({ userRole }: { userRole?: string }) {
    // Hooks MUST be called unconditionally on every render — the early return
    // for VIDEO_EDITOR comes after all hooks below. (Caught by react-hooks/
    // rules-of-hooks: returning a different component before hooks would
    // change the hook count between renders if userRole ever changed.)
    const hydrated = useHydrated();
    const router = useRouter();
    const [name, setName] = useState('');
    const [d, setD] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [briefingSummary, setBriefingSummary] = useState<string | null>(null);
    const [briefingLoading, setBriefingLoading] = useState(true);
    const [regenerating, setRegenerating] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const isAdmin = userRole === 'ADMIN' || userRole === 'ACCOUNT_MANAGER';
    const isEditor = userRole === 'VIDEO_EDITOR';
    const { showError, showSuccess } = useUndoToast();
    usePerfMonitor('/dashboard');

    const loadDashboard = useCallback(() => {
        setLoading(true);
        return Promise.all([getCurrentUserAction(), getSalesDashboardAction()])
            .then(([u, dash]) => {
                setName(u?.name?.split(' ')[0] || '');
                setD(dash);
                setLoading(false);
            })
            .catch((err) => {
                setLoading(false);
                showError("Couldn't load dashboard data. Check your connection.", { onRetry: loadDashboard });
                console.error('[Dashboard] load failed', err);
            });
    }, [showError]);

    useEffect(() => { loadDashboard(); }, [loadDashboard]);

    // Load briefing in parallel — cached per-day so warm lambdas return instantly.
    // While in-flight, briefingLoading is true; consumers show a "Jarvis is analyzing…" pulse.
    useEffect(() => {
        getDailyBriefingAction()
            .then(r => { if (r.success && r.briefing?.summary) setBriefingSummary(r.briefing.summary); })
            .catch(() => { /* keep fallback bullets */ })
            .finally(() => setBriefingLoading(false));
    }, []);

    const handleRegenerate = async () => {
        if (regenerating) return;
        setRegenerating(true);
        setBriefingLoading(true);
        const res = await regenerateDailyBriefingAction();
        setRegenerating(false);
        setBriefingLoading(false);
        if (res.success && res.briefing?.summary) {
            setBriefingSummary(res.briefing.summary);
            showSuccess('Briefing refreshed');
        } else {
            showError(res.error || 'Failed to regenerate briefing', { onRetry: handleRegenerate });
        }
    };

    // Build the text we'll speak from the live briefing (if loaded) or the
    // hardcoded fallback bullets — same copy the user sees on screen.
    const getSpeakText = () => {
        if (briefingSummary) return briefingSummary;
        const s2 = d?.stats || {};
        const replyCount = (d?.needReply || []).length;
        if (replyCount > 0) {
            return `Three things to handle before lunch. Reply to the ${Math.min(replyCount, 5)} outstanding emails from yesterday. Send a follow-up to the new lead. Review and analyse the ${s2.replies || 0} replies received in the last twenty-four hours.`;
        }
        return `All caught up — no overdue replies. Great work keeping the inbox clean.`;
    };

    const handleReadAloud = async () => {
        // Stop any in-flight playback first.
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        try { window.speechSynthesis?.cancel(); } catch {}

        if (speaking) { setSpeaking(false); return; }
        const text = getSpeakText();
        if (!text) return;
        setSpeaking(true);

        try {
            const res = await fetch('/api/jarvis/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                audioRef.current = audio;
                audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
                audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url); };
                await audio.play();
                return;
            }
            // 501 (not configured) or any other error → browser fallback.
        } catch {
            // network-level failure → browser fallback too
        }

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            const utter = new SpeechSynthesisUtterance(text);
            utter.rate = 1.0;
            utter.onend = () => setSpeaking(false);
            utter.onerror = () => setSpeaking(false);
            window.speechSynthesis.speak(utter);
        } else {
            setSpeaking(false);
        }
    };

    // Stop audio if the component unmounts mid-playback.
    useEffect(() => () => {
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        try { window.speechSynthesis?.cancel(); } catch {}
    }, []);

    if (isEditor) return <EditorTodayView />;
    if (!hydrated || loading) return <PageLoader isLoading type="grid" count={6} context="dashboard"><div /></PageLoader>;

    const s = d?.stats || { sent: 0, replies: 0, newLeads: 0, replyRate: 0 };
    const pl = d?.pipeline || {};
    const reply = d?.needReply || [];
    const replyRate = s.replyRate || 0;

    const funnelData = [
        { k: 'Cold', v: Number(pl['COLD_LEAD'] || 0) },
        { k: 'Contacted', v: Number(pl['CONTACTED'] || 0) },
        { k: 'Warm', v: Number(pl['WARM_LEAD'] || 0) },
        { k: 'Lead', v: Number(pl['LEAD'] || 0) },
        { k: 'Offer', v: Number(pl['OFFER_ACCEPTED'] || 0) },
        { k: 'Closed', v: Number(pl['CLOSED'] || 0) },
    ];
    const funnelMax = Math.max(...funnelData.map(f => f.v), 1);
    const funnelColors = ['c1', 'c2', 'c3', 'c4', '', ''];

    // Real KPI trends + deltas come from the server now (kpiTrends). No
    // hardcoded sparklines or fake "+X vs yesterday" arithmetic.
    const trends = d?.kpiTrends || { sent: [], replies: [], leads: [], replyRate: [], todayVsYesterday: {}, newestLeadAt: null };
    const tvy = trends.todayVsYesterday || {};
    const fmtDelta = (delta: number, suffix = '') => {
        if (delta === 0) return `flat vs yesterday${suffix ? ' · ' + suffix : ''}`;
        const sign = delta > 0 ? '+' : '';
        return `${sign}${delta} vs yesterday${suffix ? ' · ' + suffix : ''}`;
    };
    const fmtPctDelta = (delta: number) => {
        if (delta === 0) return 'flat vs yesterday';
        return `${delta > 0 ? '+' : ''}${delta} pts vs yesterday`;
    };
    const sinceText = (iso: string | null) => {
        if (!iso) return null;
        const ms = Date.now() - new Date(iso).getTime();
        const h = Math.floor(ms / 3_600_000);
        if (h < 1) return 'just now';
        if (h < 24) return `${h}h ago`;
        const days = Math.floor(h / 24);
        return `${days}d ago`;
    };

    const kpis = [
        {
            k: 'Sent today',
            v: String(tvy.sent?.today ?? 0),
            d: fmtDelta(tvy.sent?.delta ?? 0),
            up: (tvy.sent?.delta ?? 0) >= 0,
            sp: trends.sent && trends.sent.length ? trends.sent : [0,0,0,0,0,0,0,0,0],
        },
        {
            k: 'Replies today',
            v: String(tvy.replies?.today ?? 0),
            d: fmtDelta(tvy.replies?.delta ?? 0),
            up: (tvy.replies?.delta ?? 0) >= 0,
            sp: trends.replies && trends.replies.length ? trends.replies : [0,0,0,0,0,0,0,0,0],
        },
        {
            k: 'New leads today',
            v: String(tvy.leads?.today ?? 0),
            d: trends.newestLeadAt
                ? fmtDelta(tvy.leads?.delta ?? 0, `last added ${sinceText(trends.newestLeadAt)}`)
                : (tvy.leads?.today ? fmtDelta(tvy.leads?.delta ?? 0) : 'Pipeline quiet'),
            up: (tvy.leads?.delta ?? 0) >= 0,
            sp: trends.leads && trends.leads.length ? trends.leads : [0,0,0,0,0,0,0,0,0],
        },
        {
            k: 'Reply rate (week)',
            v: `${replyRate}%`,
            d: fmtPctDelta(tvy.replyRate?.delta ?? 0),
            up: (tvy.replyRate?.delta ?? 0) >= 0,
            sp: trends.replyRate && trends.replyRate.length ? trends.replyRate : [0,0,0,0,0,0,0,0,0],
        },
    ];

    const needReplyRows = reply.slice(0, 4).map((r: any) => {
        const days = Math.max(1, Math.floor((Date.now() - new Date(r.lastEmailAt || r.sent_at || r.last_email_at || Date.now()).getTime()) / 86400000));
        return {
            id: r.id || r.contactId || null,
            n: r.contactName || r.name || 'Unknown',
            s: r.subject || r.lastSubject || '',
            d: `${days}d`,
            p: days >= 7 ? 'high' : days >= 3 ? 'med' : 'low',
        };
    });

    const closers = d?.topClosers || d?.topClients || [];
    const closerRows = closers.slice(0, 4).map((c: any, i: number) => ({
        id: c.id || c.contactId || null,
        n: c.name || c.contactName || 'Unknown',
        d: c.dealCount || c.deals || c.total_projects || 0,
        v: fmt(c.revenue || c.total_revenue || 0),
        av: ['av-a', 'av-c', 'av-e', 'av-b'][i] || 'av-a',
    }));

    const greeting = (() => {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 17) return 'Good afternoon';
        return 'Good evening';
    })();
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const sub = isAdmin
        ? `${reply.length} actions need you today · ${s.replies} new replies · pipeline at ${funnelData.reduce((a, f) => a + f.v, 0).toLocaleString()} contacts`
        : `${reply.length} actions need you today · ${s.replies} new replies overnight`;

    // Revenue chart — no hardcoded fallback; render an empty state instead
    // when the server returned no closed projects in the last 6 months.
    const revenueData: { month: string; revenue: number }[] = d?.revenue?.chart || [];
    const hasRevenueData = revenueData.length > 0 && revenueData.some(m => (m.revenue || 0) > 0);
    const revMaxValue = hasRevenueData ? Math.max(...revenueData.map(m => m.revenue || 1)) : 1;
    const revBars: [number, number][] = hasRevenueData
        ? revenueData.slice(-6).map((m): [number, number] => [
            Math.min(100, Math.round((m.revenue || 0) / revMaxValue * 100)),
            // unpaid bar height: scale by a fraction so it reads as a paired
            // marker, not a real series. Will be replaced when we wire a real
            // unpaid-by-month aggregation.
            Math.min(30, Math.round(((m.revenue || 0) * 0.2) / revMaxValue * 100)),
        ])
        : [];
    const revMonths = hasRevenueData
        ? revenueData.slice(-6).map(m => new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short' }))
        : [];

    return (
        <>
        <style>{`
.db{height:100%;overflow-y:auto;background:var(--shell);font-family:var(--font-ui);color:var(--ink)}
.db-page{padding:22px 26px;flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--hairline) transparent}
.db-page::-webkit-scrollbar{width:8px}
.db-page::-webkit-scrollbar-thumb{background:var(--hairline);border-radius:4px}

.db-head{display:flex;align-items:baseline;gap:14px;margin-bottom:18px}
.db-head h2{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:0;color:var(--ink)}
.db-head h2 span{font-weight:400}
.db-head .sub{color:var(--ink-muted);font-size:13px;margin-top:4px}
.db-head .spacer{flex:1}
.db-head .refresh-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:500;color:var(--ink-2);background:none;border:1px solid var(--hairline-soft);cursor:pointer;font-family:var(--font-ui);transition:background .12s}
.db-head .refresh-btn:hover{background:var(--surface)}

.db-briefing{background:linear-gradient(135deg,color-mix(in oklab,var(--accent-soft),transparent 35%),color-mix(in oklab,var(--surface),transparent 0%));border:1px solid color-mix(in oklab,var(--accent),transparent 80%);border-radius:var(--radius-card,14px);padding:18px 20px;margin-bottom:20px;position:relative;overflow:hidden}
.db-briefing-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.db-briefing-head .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--accent-ink);font-weight:600}
.db-briefing-head .actions{margin-left:auto;display:flex;gap:6px}
.db-briefing h3{font-size:15px;font-weight:600;margin:0 0 10px;letter-spacing:-.01em}
.db-briefing ul{margin:0;padding-left:18px;color:var(--ink-2);font-size:13px;line-height:1.7}
.db-briefing ul b{color:var(--ink);font-weight:600}

.jarvis-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;font-size:11.5px;font-weight:500;border-radius:8px;background:var(--surface-2);color:var(--ink-2);border:1px solid var(--hairline-soft);cursor:pointer;font-family:var(--font-ui);transition:background .12s}
.jarvis-btn:hover{background:var(--surface-hover);color:var(--ink)}
.jarvis-btn:disabled{opacity:.6;cursor:default}
.jarvis-btn[aria-pressed="true"]{background:color-mix(in oklab,var(--accent-soft),transparent 40%);color:var(--accent-ink);border-color:var(--accent-soft)}
.jarvis-spin{display:inline-flex;animation:jarvis-spin .9s linear infinite}
@keyframes jarvis-spin{to{transform:rotate(360deg)}}
.db-briefing-body{color:var(--ink-2);font-size:13px;line-height:1.7}
.db-briefing-body p{margin:0 0 8px;color:var(--ink-2)}
.db-briefing-body p:last-child{margin-bottom:0}
.db-briefing-body p b{color:var(--ink);font-weight:600}

.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.kpi{background:var(--surface);border:1px solid var(--hairline-soft);border-radius:var(--radius-card,14px);padding:14px 16px;position:relative;overflow:hidden}
.kpi .k{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-muted);font-weight:500}
.kpi .v{font-size:26px;font-weight:600;letter-spacing:-.02em;margin:6px 0 2px;color:var(--ink);font-variant-numeric:tabular-nums}
.kpi .d{font-size:11.5px;color:var(--ink-muted)}
.kpi .d .up{color:var(--coach)}
.kpi .d .down{color:var(--danger)}
.kpi-spark{position:absolute;right:10px;top:10px;width:64px;height:28px;opacity:.6}

.card{background:var(--surface);border:1px solid var(--hairline-soft);border-radius:var(--radius-card,14px);padding:16px}
.card h3{font-size:13px;font-weight:600;margin:0 0 12px;display:flex;align-items:center;gap:8px}
.card h3 .sub{color:var(--ink-muted);font-weight:400;font-size:11.5px}

.funnel{display:flex;flex-direction:column;gap:6px}
.funnel-row{display:grid;grid-template-columns:90px 1fr 60px;gap:10px;align-items:center;font-size:12px}
.funnel-row .k{color:var(--ink-muted)}
.funnel-row .v{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.funnel-row .bar{height:22px;border-radius:6px}
.funnel-row .bar.c1{background:linear-gradient(90deg,oklch(0.55 0.13 260),color-mix(in oklab,oklch(0.55 0.13 260),transparent 50%))}
.funnel-row .bar.c2{background:linear-gradient(90deg,oklch(0.6 0.13 230),color-mix(in oklab,oklch(0.6 0.13 230),transparent 50%))}
.funnel-row .bar.c3{background:linear-gradient(90deg,oklch(0.65 0.14 200),color-mix(in oklab,oklch(0.65 0.14 200),transparent 50%))}
.funnel-row .bar.c4{background:linear-gradient(90deg,oklch(0.7 0.14 160),color-mix(in oklab,oklch(0.7 0.14 160),transparent 50%))}
.funnel-row .bar:not(.c1):not(.c2):not(.c3):not(.c4){background:linear-gradient(90deg,var(--accent),color-mix(in oklab,var(--accent),transparent 50%))}

.table{width:100%;border-collapse:collapse}
.table td{padding:11px 14px;text-align:left;font-size:12.5px;border-bottom:1px solid var(--hairline-soft)}
.table tr:last-child td{border-bottom:none}
.table tr:hover td{background:var(--surface-hover)}
.num{font-variant-numeric:tabular-nums}
.chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;font-size:11px;font-weight:500;border-radius:999px;background:var(--surface);color:var(--ink-2);border:1px solid var(--hairline-soft);white-space:nowrap}

.icon-btn{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;color:var(--ink-muted);border:none;background:none;cursor:pointer;transition:background .12s,color .12s}
.icon-btn:hover{background:var(--surface);color:var(--ink)}

@media(max-width:960px){.kpi-grid{grid-template-columns:repeat(2,1fr)}}
        `}</style>

        <div className="db">
            <div className="db-page">

                {/* ── Page Header ── */}
                <div className="db-head">
                    <div>
                        <h2>{greeting}, {name || 'there'} <span>— {dateStr}</span></h2>
                        <div className="sub">{sub}</div>
                    </div>
                    <div className="spacer" />
                    <button className="refresh-btn" onClick={() => loadDashboard()} disabled={loading}>
                        {ICON.refresh} {loading ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>

                {/* ── Jarvis Daily Briefing ── */}
                <div className="db-briefing">
                    <div className="db-briefing-head">
                        <span style={{ color: 'var(--accent-ink)', display: 'inline-flex' }}>{ICON.spark}</span>
                        <span className="label">Jarvis · Daily briefing</span>
                        {briefingLoading && !briefingSummary && (
                            <span className="jarvis-thinking" aria-live="polite">analyzing today&apos;s data…</span>
                        )}
                        <div className="actions">
                            <button
                                className="jarvis-btn"
                                onClick={handleRegenerate}
                                disabled={regenerating}
                                aria-busy={regenerating}
                                title="Re-run Jarvis against today's data"
                            >
                                <span className={regenerating ? 'jarvis-spin' : ''}>{ICON.refresh}</span>
                                {regenerating ? 'Thinking…' : 'Regenerate'}
                            </button>
                            <button
                                className="jarvis-btn"
                                onClick={handleReadAloud}
                                aria-pressed={speaking}
                                title={speaking ? 'Stop' : 'Read the briefing aloud'}
                            >
                                {ICON.mic}
                                {speaking ? 'Stop' : 'Read aloud'}
                            </button>
                        </div>
                    </div>
                    {briefingSummary ? (
                        <div className="db-briefing-body">
                            {briefingSummary.split(/\n+/).map((line, i) => (
                                <p key={i}>{line}</p>
                            ))}
                        </div>
                    ) : (
                        <>
                            <h3>{isAdmin ? 'Three things to handle before lunch.' : 'Three things for you this morning.'}</h3>
                            <ul>
                                {reply.length > 0 ? (
                                    <>
                                        <li>Reply to the <b>{Math.min(reply.length, 5)} outstanding emails</b> from yesterday&apos;s sent emails to maintain open communication with clients.</li>
                                        <li>{trends.newestLeadAt
                                            ? <>Send a follow-up to the new lead added <b>{sinceText(trends.newestLeadAt)}</b> to increase the chances of conversion.</>
                                            : <>Send a follow-up to your most recent lead — no new contacts in the last week.</>}</li>
                                        <li>Review and analyze the <b>{s.replies} replies</b> received in the last 24 hours to gauge customer sentiment and adjust strategies accordingly.</li>
                                    </>
                                ) : (
                                    <>
                                        <li>All caught up — <b>no overdue replies</b>. Great work keeping the inbox clean.</li>
                                        <li>Pipeline has <b>{funnelData.reduce((a, f) => a + f.v, 0).toLocaleString()} contacts</b> across all stages.</li>
                                        <li>Focus on <b>warm leads</b> today — {funnelData[2]?.v || 0} contacts are showing interest.</li>
                                    </>
                                )}
                            </ul>
                        </>
                    )}
                </div>

                {/* ── KPI Grid ── */}
                <div className="kpi-grid">
                    {kpis.map((kpi, i) => (
                        <div className="kpi" key={i}>
                            <div className="k">{kpi.k}</div>
                            <div className="v">{kpi.v}</div>
                            <div className="d"><span className={kpi.up ? 'up' : 'down'}>▲</span> {kpi.d}</div>
                            <Spark points={kpi.sp} color={kpi.up ? 'var(--coach)' : 'var(--danger)'} />
                        </div>
                    ))}
                </div>

                {/* ── Revenue + Funnel Row ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div className="card">
                        <h3>Revenue <span className="sub">last 6 months · $ thousands</span><span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-muted)' }}>Closed · Unpaid</span></h3>
                        {hasRevenueData ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, height: 160, alignItems: 'end', padding: '10px 4px 0' }}>
                                {revBars.map(([a, b], i) => (
                                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'end', gap: 3, height: 130 }}>
                                            <div style={{ width: 18, height: `${a}%`, background: 'var(--accent)', borderRadius: '4px 4px 0 0' }} title="Closed revenue" />
                                            <div style={{ width: 18, height: `${b}%`, background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: '4px 4px 0 0' }} title="Unpaid" />
                                        </div>
                                        <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{revMonths[i]}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ height: 160, display: 'grid', placeItems: 'center', color: 'var(--ink-faint)', fontSize: 13 }}>
                                No closed revenue in the last 6 months
                            </div>
                        )}
                    </div>
                    <div className="card">
                        <h3>Pipeline funnel <span className="sub">{isAdmin ? 'all accounts' : 'my clients'}</span></h3>
                        <div className="funnel">
                            {funnelData.map((f, i) => (
                                <div className="funnel-row" key={f.k}>
                                    <span className="k">{f.k}</span>
                                    <div style={{ background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
                                        <div className={`bar ${funnelColors[i]}`} style={{ width: `${Math.max(2, Math.round((f.v / funnelMax) * 100))}%` }} />
                                    </div>
                                    <span className="v">{f.v.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Need Reply + Top Closers ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="card">
                        <h3>Need reply <span className="sub">overdue</span></h3>
                        {needReplyRows.length > 0 ? (
                            <table className="table">
                                <tbody>
                                    {needReplyRows.map((row: any, i: number) => (
                                        <tr
                                            key={i}
                                            onClick={() => row.id && router.push(`/clients/${row.id}`)}
                                            style={{ cursor: row.id ? 'pointer' : 'default' }}
                                            title={row.id ? `Open ${row.n}` : undefined}
                                        >
                                            <td style={{ width: 140 }}><b>{row.n}</b></td>
                                            <td style={{ color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{row.s}</td>
                                            <td className="num" style={{ textAlign: 'right', width: 60 }}>
                                                <span className="chip" style={{ color: row.p === 'high' ? 'var(--danger)' : row.p === 'med' ? 'var(--warn)' : 'var(--ink-muted)' }}>{row.d} old</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-faint)', fontSize: 13 }}>All caught up — no overdue replies</div>
                        )}
                    </div>
                    <div className="card">
                        <h3>{isAdmin ? 'Top closers this month' : 'Team leaderboard · this month'}</h3>
                        {closerRows.length > 0 ? (
                            <table className="table">
                                <tbody>
                                    {closerRows.map((row: any, i: number) => (
                                        <tr
                                            key={i}
                                            onClick={() => row.id && router.push(`/clients/${row.id}`)}
                                            style={{ cursor: row.id ? 'pointer' : 'default' }}
                                            title={row.id ? `Open ${row.n}` : undefined}
                                        >
                                            <td style={{ width: 210 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div className={`avatar ${row.av}`} style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontSize: 10, fontWeight: 600 }}>
                                                        {(row.n || '').split(' ').map((s: string) => s[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <b>{row.n}</b>
                                                </div>
                                            </td>
                                            <td className="num" style={{ color: 'var(--ink-muted)' }}>{row.d} deals</td>
                                            <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{row.v}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-faint)', fontSize: 13 }}>No closed deals yet this month</div>
                        )}
                    </div>
                </div>

            </div>
        </div>
        </>
    );
}
