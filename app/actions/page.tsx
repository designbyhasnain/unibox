'use client';

import { useState, useEffect, useCallback } from 'react';
import { getActionQueueAction, snoozeActionAction, markActionDoneAction } from '../../src/actions/actionQueueActions';
import type { ActionItem } from '../../src/actions/actionQueueActions';
import ActionCard from '../components/ActionCard';
import QuickActions from '../components/QuickActions';
import { PageLoader } from '../components/LoadingStates';
import { useUI } from '../context/UIContext';
import { useGlobalFilter } from '../context/FilterContext';

export default function ActionsPage() {
    const [actions, setActions] = useState<ActionItem[]>([]);
    const [counts, setCounts] = useState({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('ALL');
    const [quickAction, setQuickAction] = useState<ActionItem | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const { accounts } = useGlobalFilter();
    let ui: ReturnType<typeof useUI> | null = null;
    try { ui = useUI(); } catch { /* outside UIContext */ }

    const load = useCallback(async () => {
        try {
            const result = await getActionQueueAction();
            setActions(result.actions);
            setCounts(result.counts);
        } catch (e) {
            console.error('Failed to load action queue:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleQuickEmail = (action: ActionItem) => {
        setQuickAction(action);
    };

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

    // Map accounts for ActionCard — need id + email
    const accountList = (accounts || []).map((a: any) => ({
        id: a.id,
        email: a.email || a.gmail_email || '',
        name: a.name || a.display_name || '',
    }));

    if (loading) return <PageLoader isLoading={true} type="list" count={6}><div /></PageLoader>;

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
                .aq-page { font-family: 'DM Sans', system-ui, sans-serif; flex: 1; min-height: 0; overflow-y: auto; background: #f8fafc; }
                .aq-mono { font-family: 'DM Mono', monospace; }
                .aq-filter { padding: 6px 14px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; color: #64748b; }
                .aq-filter:hover { border-color: #2563eb; color: #2563eb; }
                .aq-filter-active { background: #2563eb !important; color: #fff !important; border-color: #2563eb !important; }
                @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
                .action-spin { animation: action-spin 1s linear infinite; }
                @keyframes action-spin { to { transform: rotate(360deg); } }
            `}</style>

            <div className="aq-page">
                {/* Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #fef2f2 0%, #f8fafc 40%, #eff6ff 100%)',
                    borderBottom: '1px solid #e2e8f0', padding: '20px 32px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div>
                        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.02em' }}>
                            {'\uD83C\uDFAF'} Today&apos;s Actions
                        </h1>
                        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', fontWeight: 500 }}>
                            {counts.total} contacts need your attention — click any card to reply inline
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {counts.critical > 0 && (
                            <div className="aq-mono" style={{
                                background: '#dc2626', color: '#fff', padding: '4px 12px', borderRadius: 6,
                                fontSize: 13, fontWeight: 700, animation: 'pulse 2s ease-in-out infinite',
                            }}>
                                {counts.critical} URGENT
                            </div>
                        )}
                        <button onClick={() => { setLoading(true); load(); }} style={{
                            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
                            padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#64748b',
                        }}>
                            {'\uD83D\uDD04'} Refresh
                        </button>
                    </div>
                </div>

                {/* Summary Strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '12px 32px' }}>
                    {[
                        { n: actions.filter(a => a.actionType === 'REPLY_NOW').length, l: 'Reply Now', color: '#dc2626', bg: '#fef2f2' },
                        { n: actions.filter(a => a.actionType === 'NEW_LEAD').length, l: 'New Leads', color: '#7c3aed', bg: '#faf5ff' },
                        { n: actions.filter(a => a.actionType === 'FOLLOW_UP').length, l: 'Follow Up', color: '#2563eb', bg: '#eff6ff' },
                        { n: actions.filter(a => a.actionType === 'WIN_BACK').length, l: 'Win Back', color: '#d97706', bg: '#fffbeb' },
                    ].map(s => (
                        <div key={s.l} style={{
                            background: s.bg, borderRadius: 8, padding: '10px 16px', textAlign: 'center',
                            border: `1px solid ${s.color}20`, cursor: 'pointer',
                        }} onClick={() => setFilter(s.l === 'Reply Now' ? 'REPLY_NOW' : s.l === 'New Leads' ? 'NEW_LEAD' : s.l === 'Follow Up' ? 'FOLLOW_UP' : 'WIN_BACK')}>
                            <div className="aq-mono" style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.n}</div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', letterSpacing: '.04em' }}>{s.l.toUpperCase()}</div>
                        </div>
                    ))}
                </div>

                {/* Filter Bar */}
                <div style={{ padding: '0 32px 12px', display: 'flex', gap: 6 }}>
                    {[
                        { key: 'ALL', label: `All (${counts.total})` },
                        { key: 'REPLY_NOW', label: 'Reply Now' },
                        { key: 'NEW_LEAD', label: 'New Leads' },
                        { key: 'FOLLOW_UP', label: 'Follow Up' },
                        { key: 'WIN_BACK', label: 'Win Back' },
                    ].map(f => (
                        <button key={f.key}
                            className={`aq-filter ${filter === f.key ? 'aq-filter-active' : ''}`}
                            onClick={() => setFilter(f.key)}
                        >{f.label}</button>
                    ))}
                </div>

                {/* Action List */}
                <div style={{ padding: '0 32px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>{'\uD83C\uDF89'}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>All caught up!</div>
                            <div style={{ fontSize: 13, color: '#94a3b8' }}>No actions needed right now. Check back later.</div>
                        </div>
                    ) : filtered.map(action => (
                        <ActionCard
                            key={action.id}
                            action={action}
                            onQuickEmail={handleQuickEmail}
                            onSnooze={handleSnooze}
                            onDone={handleDone}
                            accounts={accountList}
                            expandedId={expandedId}
                            onToggleExpand={handleToggleExpand}
                        />
                    ))}
                </div>
            </div>

            {/* Quick Actions Template Picker */}
            {quickAction && (
                <QuickActions
                    contactEmail={quickAction.email}
                    contactName={quickAction.name}
                    actionType={quickAction.actionType}
                    onSendWithTemplate={(template) => {
                        openCompose(quickAction.email, quickAction.name, template.subject, template.body);
                        setQuickAction(null);
                    }}
                    onSendBlank={() => {
                        openCompose(quickAction.email, quickAction.name);
                        setQuickAction(null);
                    }}
                    onClose={() => setQuickAction(null)}
                />
            )}
        </>
    );
}
