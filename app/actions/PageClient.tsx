'use client';

import { useState, useEffect, useCallback } from 'react';
import { getActionQueueAction } from '../../src/actions/actionQueueActions';
import type { ActionItem } from '../../src/actions/actionQueueActions';
import { PageLoader } from '../components/LoadingStates';
import { useUI } from '../context/UIContext';
import { useGlobalFilter } from '../context/FilterContext';

const ICON = {
    filter: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
    refresh: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
    arrowRight: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>,
};

const pColor: Record<string, string> = { critical: 'var(--danger)', high: 'var(--warn)', medium: 'var(--ink-muted)', low: 'var(--ink-dim)' };
const pLabel: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

function mapUrgencyToDesign(u: string): string {
    if (u === 'critical') return 'critical';
    if (u === 'high') return 'high';
    return 'med';
}

function getActionLabel(a: ActionItem): string {
    if (a.actionType === 'REPLY_NOW') return 'Draft reply';
    if (a.actionType === 'NEW_LEAD') return 'Send intro';
    if (a.actionType === 'FOLLOW_UP') return 'Follow up';
    if (a.actionType === 'WIN_BACK') return 'Re-engage';
    return 'View';
}

function getDueLabel(a: ActionItem): string {
    const days = a.daysSinceContact || 0;
    if (days >= 7) return `Overdue · ${days}d`;
    if (days >= 2) return `${days}d ago`;
    if (days === 1) return 'Yesterday';
    return 'Today';
}

export default function ActionsPage() {
    const [actions, setActions] = useState<ActionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<string>('all');

    useGlobalFilter();
    const ui = useUI();

    const load = useCallback(async () => {
        try {
            const result = await getActionQueueAction();
            setActions(result.actions);
        } catch (e) {
            console.error('Failed to load action queue:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleRefresh = () => { setRefreshing(true); load(); };

    const handleQuickEmail = (action: ActionItem) => {
        if (ui) {
            ui.setComposeDefaultTo(action.email);
            ui.setComposeDefaultSubject(action.lastEmailSubject ? `Re: ${action.lastEmailSubject}` : '');
            ui.setComposeOpen(true);
        }
    };

    const counts: Record<string, number> = {
        all: actions.length,
        critical: actions.filter(a => a.urgency === 'critical').length,
        high: actions.filter(a => a.urgency === 'high').length,
        med: actions.filter(a => a.urgency === 'medium' || a.urgency === 'low').length,
    };

    const filtered = filter === 'all' ? actions : actions.filter(a => {
        const mapped = mapUrgencyToDesign(a.urgency);
        return mapped === filter;
    });

    const avColors = ['av-a', 'av-b', 'av-c', 'av-d', 'av-e', 'av-f', 'av-g', 'av-h'];

    if (loading) return <PageLoader isLoading={true} type="list" count={6} context="inbox"><div /></PageLoader>;

    return (
        <div className="aq-page">
            {/* ── Page content ── */}
            <div className="aq-content">

                {/* ── Page Head ── */}
                <div className="page-head">
                    <div>
                        <h2>Priority queue</h2>
                        <div className="sub">{actions.length} items · Jarvis ranked by stage + urgency + deal value</div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <button className="aq-refresh-btn" onClick={handleRefresh}>
                        <span className={refreshing ? 'aq-spin' : ''}>{ICON.refresh}</span> Refresh
                    </button>
                </div>

                {/* ── Filter Tabs ── */}
                <div className="tabs" style={{ marginBottom: 14 }}>
                    {([['all', 'All'], ['critical', 'Critical'], ['high', 'High'], ['med', 'Medium']] as const).map(([k, l]) => (
                        <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
                            {k !== 'all' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: k === 'critical' ? 'var(--danger)' : k === 'high' ? 'var(--warn)' : 'var(--ink-muted)' }} />}
                            {l}
                            <span className="mini-badge">{counts[k]}</span>
                        </button>
                    ))}
                </div>

                {/* ── Action List ── */}
                {filtered.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', margin: '0 auto 14px', background: 'color-mix(in oklab, var(--coach-soft), transparent 20%)', display: 'grid', placeItems: 'center' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--coach)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Nothing needs your attention</div>
                        <div style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                            You&apos;ve responded to every client{filter !== 'all' ? ' in this category' : ''}.
                        </div>
                    </div>
                ) : (
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        {filtered.map((a, i) => {
                            const initials = (a.name || '?').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
                            const avClass = avColors[(a.name || '').charCodeAt(0) % avColors.length];
                            const dueLabel = getDueLabel(a);
                            const isOverdue = dueLabel.startsWith('Overdue');
                            const actionLabel = getActionLabel(a);

                            return (
                                <div key={a.id || i} className="aq-row"
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--hairline-soft)' : 'none' }}
                                >
                                    {/* Priority bar + Avatar */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ width: 6, height: 36, borderRadius: 3, background: pColor[a.urgency] || 'var(--ink-dim)', flexShrink: 0 }} />
                                        <div className={`avatar ${avClass}`} style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                                            {initials}
                                        </div>
                                    </div>

                                    {/* Task content */}
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {a.reason || a.lastEmailSubject || 'Follow up'}
                                        </div>
                                        <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {a.name} · {a.company || a.email} {a.estimatedValue ? `· ${a.estimatedValue > 0 ? '$' + a.estimatedValue.toLocaleString() : ''}` : ''}
                                        </div>
                                    </div>

                                    {/* Priority + Due */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                                        <span className="chip" style={{ color: pColor[a.urgency], fontSize: 10.5 }}>{pLabel[a.urgency] || 'Medium'}</span>
                                        <span style={{ fontSize: 11, color: isOverdue ? 'var(--danger)' : 'var(--ink-muted)', fontWeight: isOverdue ? 600 : 400 }}>{dueLabel}</span>
                                    </div>

                                    {/* Action button */}
                                    <button className="aq-action-btn" onClick={(e) => { e.stopPropagation(); handleQuickEmail(a); }}>
                                        {actionLabel} {ICON.arrowRight}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <style>{`
.aq-page{height:100%;overflow-y:auto;background:var(--shell);font-family:var(--font-ui);color:var(--ink)}
.aq-content{padding:22px 26px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--hairline) transparent}
.aq-content::-webkit-scrollbar{width:8px}
.aq-content::-webkit-scrollbar-thumb{background:var(--hairline);border-radius:4px}

.aq-page .page-head{display:flex;align-items:baseline;gap:14px;margin-bottom:18px}
.aq-page .page-head h2{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:0;color:var(--ink)}
.aq-page .page-head .sub{color:var(--ink-muted);font-size:13px;margin-top:4px}

.aq-refresh-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:500;color:var(--ink-2);background:none;border:1px solid var(--hairline-soft);cursor:pointer;font-family:var(--font-ui);transition:background .12s}
.aq-refresh-btn:hover{background:var(--surface)}
.aq-spin{display:inline-flex;animation:aq-spin-anim .8s linear infinite}
@keyframes aq-spin-anim{to{transform:rotate(360deg)}}

.aq-page .tabs{display:flex;gap:2px;padding:3px;background:var(--surface);border-radius:8px;border:1px solid var(--hairline-soft);width:fit-content}
.aq-page .tabs button{padding:4px 10px;font-size:12px;font-weight:500;color:var(--ink-muted);border-radius:6px;transition:background .12s,color .12s;display:inline-flex;align-items:center;gap:6px;border:none;background:none;cursor:pointer;font-family:var(--font-ui)}
.aq-page .tabs button.active{background:var(--shell);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.25)}
.aq-page .tabs button:hover:not(.active){color:var(--ink-2)}
.aq-page .tabs .mini-badge{font-size:10px;padding:0 5px;border-radius:999px;background:color-mix(in oklab,var(--ink),transparent 85%)}

.aq-page .card{background:var(--surface);border:1px solid var(--hairline-soft);border-radius:var(--radius-card,14px);overflow:hidden}

.aq-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:14px;align-items:center;padding:14px 18px;cursor:pointer;transition:background .12s}

.aq-page .chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;font-size:11px;font-weight:500;border-radius:999px;background:var(--surface-2);border:1px solid var(--hairline-soft);white-space:nowrap}

.aq-action-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:500;color:var(--ink-2);background:none;border:1px solid var(--hairline-soft);cursor:pointer;font-family:var(--font-ui);transition:background .12s,color .12s;white-space:nowrap}
.aq-action-btn:hover{background:var(--surface-hover);color:var(--ink)}

.aq-page .avatar{flex-shrink:0}
            `}</style>
        </div>
    );
}
