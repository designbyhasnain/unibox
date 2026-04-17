'use client';

import { useState, useEffect, useCallback } from 'react';
import { getActionQueueAction, snoozeActionAction, markActionDoneAction, getAIRecommendationsAction } from '../../src/actions/actionQueueActions';
import type { ActionItem, AIRecommendation } from '../../src/actions/actionQueueActions';
import ActionCard from '../components/ActionCard';
import QuickActions from '../components/QuickActions';
import { PageLoader } from '../components/LoadingStates';
import { useUI } from '../context/UIContext';
import { useGlobalFilter } from '../context/FilterContext';
import { RefreshCw, Check, Sparkles, TrendingUp } from 'lucide-react';

const CATEGORIES = [
    { key: 'ALL', label: 'All', filterKey: '' },
    { key: 'REPLY_NOW', label: 'Reply', filterKey: 'REPLY_NOW', color: '#DC2626' },
    { key: 'NEW_LEAD', label: 'New', filterKey: 'NEW_LEAD', color: '#7C3AED' },
    { key: 'FOLLOW_UP', label: 'Follow up', filterKey: 'FOLLOW_UP', color: '#2563EB' },
    { key: 'WIN_BACK', label: 'Win back', filterKey: 'WIN_BACK', color: '#D97706' },
] as const;

export default function ActionsPage() {
    const [actions, setActions] = useState<ActionItem[]>([]);
    const [counts, setCounts] = useState({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<string>('ALL');
    const [quickAction, setQuickAction] = useState<ActionItem | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);

    const { accounts } = useGlobalFilter();
    const ui = useUI();

    const load = useCallback(async () => {
        try {
            const result = await getActionQueueAction();
            setActions(result.actions);
            setCounts(result.counts);
            // If the queue is empty, pull AI recommendations in the background
            if (result.actions.length === 0) {
                const rec = await getAIRecommendationsAction();
                if (rec.success) setRecommendations(rec.recommendations);
            } else {
                setRecommendations([]);
            }
        } catch (e) {
            console.error('Failed to load action queue:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleRefresh = () => { setRefreshing(true); load(); };
    const handleQuickEmail = (action: ActionItem) => { setQuickAction(action); };

    const handleSnooze = async (contactId: string, days: number) => {
        setActions(prev => prev.filter(a => a.contactId !== contactId));
        setCounts(prev => ({ ...prev, total: prev.total - 1 }));
        await snoozeActionAction(contactId, days);
    };

    const handleDone = async (contactId: string) => {
        setActions(prev => prev.filter(a => a.contactId !== contactId));
        setCounts(prev => ({ ...prev, total: prev.total - 1 }));
        await markActionDoneAction(contactId);
    };

    const openCompose = (to: string, _name: string, subject?: string, body?: string) => {
        if (ui) {
            ui.setComposeDefaultTo(to);
            if (subject) ui.setComposeDefaultSubject(subject);
            if (body) ui.setComposeDefaultBody(body);
            ui.setComposeOpen(true);
        }
    };

    const handleToggleExpand = (id: string) => {
        setExpandedId(prev => prev === id ? null : id);
    };

    const filtered = filter === 'ALL' ? actions : actions.filter(a => a.actionType === filter);
    const accountList = (accounts || []).map((a: Record<string, string>) => ({
        id: a.id || '',
        email: a.email || a.gmail_email || '',
        name: a.name || a.display_name || '',
    })).filter(a => a.id);

    const catCounts: Record<string, number> = {
        ALL: actions.length,
        REPLY_NOW: actions.filter(a => a.actionType === 'REPLY_NOW').length,
        NEW_LEAD: actions.filter(a => a.actionType === 'NEW_LEAD').length,
        FOLLOW_UP: actions.filter(a => a.actionType === 'FOLLOW_UP').length,
        WIN_BACK: actions.filter(a => a.actionType === 'WIN_BACK').length,
    };
    const replyCount = catCounts.REPLY_NOW ?? 0;

    if (loading) return <PageLoader isLoading={true} type="list" count={6}><div /></PageLoader>;

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=DM+Mono:wght@400;500&display=swap');
                .aq-page { font-family: 'DM Sans', system-ui, -apple-system, sans-serif; flex: 1; min-height: 0; overflow-y: auto; background: #FAFAFA; }
                .aq-mono { font-family: 'DM Mono', monospace; }
                .aq-seg { display: flex; background: #F1F5F9; border-radius: 10px; padding: 3px; gap: 2px; }
                .aq-seg-btn { padding: 7px 16px; border-radius: 8px; border: none; font-size: 13px; font-weight: 500; cursor: pointer; transition: all .2s; color: #64748b; background: transparent; display: flex; align-items: center; gap: 6px; font-family: 'DM Sans', system-ui, sans-serif; }
                .aq-seg-btn:hover { color: #0f172a; }
                .aq-seg-btn-active { background: #fff !important; color: #0f172a !important; box-shadow: 0 1px 3px rgba(0,0,0,.08); font-weight: 600; }
                .aq-seg-count { font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 10px; background: rgba(0,0,0,.06); min-width: 18px; text-align: center; }
                .aq-seg-btn-active .aq-seg-count { background: rgba(0,0,0,.08); }
                .aq-seg-zero { opacity: 0.4; }
                .aq-refresh { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #E2E8F0; background: #fff; color: #94A3B8; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .2s; }
                .aq-refresh:hover { border-color: #CBD5E1; color: #64748b; }
                .aq-refresh-spin { animation: aq-spin .8s linear infinite; }
                @keyframes aq-spin { to { transform: rotate(360deg); } }
                .action-spin { animation: aq-spin 1s linear infinite; }
                @keyframes aq-card-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                .aq-card-item { animation: aq-card-enter .3s ease both; }
                .aq-hero { background: linear-gradient(135deg, #FEF2F2 0%, #FFFFFF 100%); border: 1px solid rgba(220,38,38,.12); border-radius: 16px; padding: 24px 28px; flex: 2; min-width: 200px; }
                .aq-hero-zero { background: linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 100%); border-color: rgba(22,163,74,.12); }
                .aq-stat-card { background: #fff; border: 1px solid #E2E8F0; border-radius: 16px; padding: 20px 24px; flex: 1; min-width: 120px; cursor: pointer; transition: all .2s; }
                .aq-stat-card:hover { border-color: #CBD5E1; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
                .aq-stat-zero { opacity: 0.35; }
            `}</style>

            <div className="aq-page">
                <div style={{ padding: '28px 32px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>Today</h1>
                        <p style={{ fontSize: 14, color: '#64748B', margin: '4px 0 0', fontWeight: 400 }}>
                            {counts.total} contacts{replyCount > 0 ? ` \u00B7 ${replyCount} need your reply` : ''}
                        </p>
                    </div>
                    <button className={`aq-refresh ${refreshing ? 'aq-refresh-spin' : ''}`} onClick={handleRefresh} title="Refresh">
                        <RefreshCw size={15} />
                    </button>
                </div>

                <div style={{ display: 'flex', gap: 12, padding: '20px 32px', flexWrap: 'wrap' }}>
                    <div className={`aq-hero ${replyCount === 0 ? 'aq-hero-zero' : ''}`} onClick={() => setFilter('REPLY_NOW')} style={{ cursor: 'pointer' }}>
                        <div className="aq-mono" style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: replyCount > 0 ? '#DC2626' : '#16A34A' }}>
                            {replyCount > 0 ? replyCount : <Check size={36} strokeWidth={3} />}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: replyCount > 0 ? '#991B1B' : '#15803D', marginTop: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            {replyCount > 0 ? 'Need your reply' : 'All replies sent'}
                        </div>
                    </div>
                    {[
                        { key: 'NEW_LEAD', label: 'New leads', color: '#7C3AED' },
                        { key: 'FOLLOW_UP', label: 'Follow up', color: '#2563EB' },
                        { key: 'WIN_BACK', label: 'Win back', color: '#D97706' },
                    ].map(s => {
                        const n = catCounts[s.key] ?? 0;
                        return (
                            <div key={s.key} className={`aq-stat-card ${n === 0 ? 'aq-stat-zero' : ''}`} onClick={() => setFilter(s.key)}>
                                <div className="aq-mono" style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: n > 0 ? s.color : '#94A3B8' }}>
                                    {n > 0 ? n : '\u2014'}
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginTop: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{s.label}</div>
                            </div>
                        );
                    })}
                </div>

                <div style={{ padding: '0 32px 16px' }}>
                    <div className="aq-seg">
                        {CATEGORIES.map(cat => {
                            const n = catCounts[cat.key];
                            const isActive = filter === cat.key;
                            const isZero = n === 0 && cat.key !== 'ALL';
                            return (
                                <button key={cat.key} className={`aq-seg-btn ${isActive ? 'aq-seg-btn-active' : ''} ${isZero ? 'aq-seg-zero' : ''}`} onClick={() => setFilter(cat.key)}>
                                    {cat.label}
                                    <span className="aq-seg-count">{n}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div style={{ padding: '0 32px 32px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {filtered.length === 0 ? (
                        <div>
                            <div style={{ textAlign: 'center', padding: '40px 20px 8px' }}>
                                <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px', background: 'linear-gradient(135deg, #DCFCE7, #F0FDF4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Check size={28} color="#16A34A" strokeWidth={2.5} />
                                </div>
                                <div style={{ fontSize: 17, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>Nothing needs your attention</div>
                                <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.5 }}>
                                    You&apos;ve responded to every client{filter !== 'ALL' ? ' in this category' : ''}.
                                </div>
                            </div>

                            {filter === 'ALL' && recommendations.length > 0 && (
                                <div style={{ marginTop: 24 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#7C3AED', fontWeight: 600, fontSize: 13 }}>
                                        <Sparkles size={16} />
                                        <span>Jarvis recommends — your best next moves</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
                                        {recommendations.map(r => (
                                            <div key={r.contactId} style={{
                                                border: '1px solid #e5e7eb', borderRadius: 10, padding: 14,
                                                background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.03), rgba(59, 130, 246, 0.02))',
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 6 }}>
                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <div style={{ fontWeight: 600, fontSize: 14, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                                                        <div style={{ fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}{r.company ? ` · ${r.company}` : ''}</div>
                                                    </div>
                                                    <span style={{
                                                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                                                        background: '#7C3AED', color: '#fff',
                                                    }}>{r.suggestedAction.replace(/_/g, ' ')}</span>
                                                </div>
                                                <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.45, marginBottom: 10 }}>{r.reason}</div>
                                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#64748B' }}>
                                                        <span><TrendingUp size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> {r.leadScore ?? 0}</span>
                                                        {r.totalRevenue && r.totalRevenue > 0 && <span>${Math.round(r.totalRevenue).toLocaleString()} past</span>}
                                                        <span style={{ opacity: 0.6 }}>{r.pipelineStage.replace(/_/g, ' ')}</span>
                                                    </div>
                                                    <button onClick={() => openCompose(r.email, r.name)} style={{
                                                        fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                                                        background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer',
                                                    }}>Email →</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : filtered.map((action, i) => (
                        <div key={action.id} className="aq-card-item" style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
                            <ActionCard action={action} onQuickEmail={handleQuickEmail} onSnooze={handleSnooze} onDone={handleDone} accounts={accountList} expandedId={expandedId} onToggleExpand={handleToggleExpand} />
                        </div>
                    ))}
                </div>
            </div>

            {quickAction && (
                <QuickActions contactEmail={quickAction.email} contactName={quickAction.name} actionType={quickAction.actionType}
                    onSendWithTemplate={(template) => { openCompose(quickAction.email, quickAction.name, template.subject, template.body); setQuickAction(null); }}
                    onSendBlank={() => { openCompose(quickAction.email, quickAction.name); setQuickAction(null); }}
                    onClose={() => setQuickAction(null)}
                />
            )}
        </>
    );
}
