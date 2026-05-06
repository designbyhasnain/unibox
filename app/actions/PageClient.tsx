'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getActionQueueAction, snoozeActionAction, markActionDoneAction } from '../../src/actions/actionQueueActions';
import type { ActionItem } from '../../src/actions/actionQueueActions';
import { PageLoader } from '../components/LoadingStates';
import { useUI } from '../context/UIContext';
import { useGlobalFilter } from '../context/FilterContext';
import { useUndoToast } from '../context/UndoToastContext';
import ActionCard from '../components/ActionCard';

const ICON = {
    refresh: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
};

// Map server urgency (4 levels) to filter-tab buckets (3 levels). The
// "med" tab covers both `medium` and `low` because the prior design
// folded them together — keep that contract for badge counts.
function mapUrgencyToDesign(u: string): string {
    if (u === 'critical') return 'critical';
    if (u === 'high') return 'high';
    return 'med';
}

export default function ActionsPage() {
    const [actions, setActions] = useState<ActionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<string>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const { accounts } = useGlobalFilter();
    const ui = useUI();
    const { showError, showSuccess } = useUndoToast();

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

    // Compose-drawer fallback for the "Template" link inside ActionCard's
    // expanded composer — keeps the existing UX where users can pop into
    // the full compose drawer if the inline reply isn't enough.
    const handleQuickEmail = useCallback((action: ActionItem) => {
        if (!ui) return;
        ui.setComposeDefaultTo(action.email);
        ui.setComposeDefaultSubject(action.lastEmailSubject ? `Re: ${action.lastEmailSubject}` : '');
        ui.setComposeOpen(true);
    }, [ui]);

    const handleSnooze = useCallback(async (contactId: string, days: number) => {
        // Optimistic remove from queue.
        const removed = actions.find(a => a.contactId === contactId);
        setActions(prev => prev.filter(a => a.contactId !== contactId));
        setExpandedId(null);
        try {
            const res = await snoozeActionAction(contactId, days);
            if (!res.success) {
                if (removed) setActions(prev => [removed, ...prev]);
                showError(res.error || 'Could not snooze', { onRetry: () => handleSnooze(contactId, days) });
            } else {
                showSuccess(`Snoozed for ${days} day${days > 1 ? 's' : ''}`);
            }
        } catch (e: any) {
            if (removed) setActions(prev => [removed, ...prev]);
            showError(e?.message || 'Could not snooze', { onRetry: () => handleSnooze(contactId, days) });
        }
    }, [actions, showError, showSuccess]);

    const handleDone = useCallback(async (contactId: string) => {
        const removed = actions.find(a => a.contactId === contactId);
        setActions(prev => prev.filter(a => a.contactId !== contactId));
        setExpandedId(null);
        try {
            const res = await markActionDoneAction(contactId);
            if (!res.success) {
                if (removed) setActions(prev => [removed, ...prev]);
                showError(res.error || 'Could not mark done', { onRetry: () => handleDone(contactId) });
            }
        } catch (e: any) {
            if (removed) setActions(prev => [removed, ...prev]);
            showError(e?.message || 'Could not mark done', { onRetry: () => handleDone(contactId) });
        }
    }, [actions, showError]);

    const counts = useMemo<Record<string, number>>(() => ({
        all: actions.length,
        critical: actions.filter(a => a.urgency === 'critical').length,
        high: actions.filter(a => a.urgency === 'high').length,
        med: actions.filter(a => a.urgency === 'medium' || a.urgency === 'low').length,
    }), [actions]);

    const filtered = useMemo(() => (
        filter === 'all' ? actions : actions.filter(a => mapUrgencyToDesign(a.urgency) === filter)
    ), [actions, filter]);

    const onToggleExpand = useCallback((id: string) => {
        setExpandedId(prev => (prev === id ? null : id));
    }, []);

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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {filtered.map(a => (
                            <ActionCard
                                key={a.id}
                                action={a}
                                accounts={accounts}
                                expandedId={expandedId}
                                onToggleExpand={onToggleExpand}
                                onQuickEmail={handleQuickEmail}
                                onSnooze={handleSnooze}
                                onDone={handleDone}
                            />
                        ))}
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
