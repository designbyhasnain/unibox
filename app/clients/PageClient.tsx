'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getClientsAction, removeClientsAction } from '../../src/actions/clientActions';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { useGlobalFilter } from '../context/FilterContext';
import { useUI } from '../context/UIContext';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';
import AddLeadModal from '../components/AddLeadModal';

const ICON = {
    search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
    filter: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    plus: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>,
    x: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>,
    more: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>,
    spark: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L9 12l-7 0 5.5 5L5 22l7-4.5L19 22l-2.5-5L22 12h-7L12 2z"/></svg>,
    mail: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    calendar: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
};

const healthColor: Record<string, string> = { strong: 'var(--coach)', warm: 'var(--accent-ink)', cooling: 'var(--warn)', 'at-risk': 'var(--danger)', dead: 'var(--ink-muted)', cold: 'var(--info)', good: 'var(--coach)', critical: 'var(--danger)' };
const stageClass: Record<string, string> = { COLD_LEAD: 'cold', CONTACTED: 'contacted', WARM_LEAD: 'warm', LEAD: 'lead', OFFER_ACCEPTED: 'closed', CLOSED: 'closed', NOT_INTERESTED: 'dead' };
const stageLabel: Record<string, string> = { COLD_LEAD: 'Cold', CONTACTED: 'Contacted', WARM_LEAD: 'Warm', LEAD: 'Lead', OFFER_ACCEPTED: 'Offer', CLOSED: 'Closed', NOT_INTERESTED: 'Dead' };
const pipelineCols = [
    { key: 'cold', dbKey: 'COLD_LEAD', label: 'Cold Lead', color: 'oklch(0.6 0.13 230)' },
    { key: 'contacted', dbKey: 'CONTACTED', label: 'Contacted', color: 'oklch(0.65 0.008 260)' },
    { key: 'warm', dbKey: 'WARM_LEAD', label: 'Warm Lead', color: 'oklch(0.72 0.14 75)' },
    { key: 'lead', dbKey: 'LEAD', label: 'Lead', color: 'oklch(0.62 0.18 295)' },
    { key: 'offer', dbKey: 'OFFER_ACCEPTED', label: 'Offer', color: 'oklch(0.66 0.15 25)' },
    { key: 'closed', dbKey: 'CLOSED', label: 'Closed', color: 'oklch(0.68 0.14 160)' },
];

function ini(n: string) { return (n || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function fmt(n: number) { return n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + n.toLocaleString(); }
function fmtDate(d: string) {
    if (!d) return '—';
    const dt = new Date(d);
    const now = new Date();
    if (dt.toDateString() === now.toDateString()) return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ClientsPage() {
    const hydrated = useHydrated();
    const { selectedAccountId } = useGlobalFilter();
    const { setComposeOpen, setComposeDefaultTo } = useUI();
    const [clients, setClients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'list' | 'grid' | 'board'>('list');
    const [selected, setSelected] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [totalCount, setTotalCount] = useState(0);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const menuWrapRef = useRef<HTMLDivElement | null>(null);

    const load = useCallback(async () => {
        try {
            const [result, user] = await Promise.all([
                getClientsAction(selectedAccountId, 1, 100, searchTerm || undefined),
                getCurrentUserAction(),
            ]);
            setClients(result.clients);
            setTotalCount(result.totalCount);
            setIsAdmin(user?.role === 'ADMIN' || user?.role === 'ACCOUNT_MANAGER');
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [selectedAccountId, searchTerm]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelected(null); setOpenMenuId(null); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Click-outside closes the row menu.
    useEffect(() => {
        if (!openMenuId) return;
        const onDocClick = (e: MouseEvent) => {
            if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) setOpenMenuId(null);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [openMenuId]);

    const handleDelete = async (contactId: string, name: string) => {
        if (!confirm(`Delete contact "${name}"? Email history will be preserved but the contact will be removed from the list.`)) {
            setOpenMenuId(null);
            return;
        }
        setDeletingId(contactId);
        setOpenMenuId(null);
        const res = await removeClientsAction([contactId]);
        setDeletingId(null);
        if (!res.success) {
            alert(res.error || 'Failed to delete contact');
            return;
        }
        setClients(prev => prev.filter(c => c.id !== contactId));
        setTotalCount(t => Math.max(0, t - 1));
        if (selected?.id === contactId) setSelected(null);
    };

    if (!hydrated || loading) return <PageLoader isLoading type="list" count={10} context="clients"><div /></PageLoader>;

    const avColors = ['av-a', 'av-b', 'av-c', 'av-d', 'av-e', 'av-f', 'av-g', 'av-h'];
    const hotCount = clients.filter(c => c.pipeline_stage === 'LEAD' || c.pipeline_stage === 'OFFER_ACCEPTED').length;
    const warmCount = clients.filter(c => c.pipeline_stage === 'WARM_LEAD').length;
    const openPipeline = clients.reduce((s: number, c: any) => s + (c.estimated_value || 0), 0);

    return (
        <>
        <div className="cl-page">
            <div className="cl-content">

                {/* Page head */}
                <div className="page-head">
                    <div>
                        <h2>{totalCount.toLocaleString()} clients <span style={{ fontWeight: 400, color: 'var(--ink-muted)', fontSize: 14 }}>{isAdmin ? 'across all accounts' : 'in your accounts'}</span></h2>
                        <div className="sub">{hotCount} hot · {warmCount} warming · {fmt(openPipeline)} in open pipeline</div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <div className="tabs">
                        {(['list', 'grid', 'board'] as const).map(v => (
                            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
                        ))}
                    </div>
                    <button className="icon-btn" title="Search">{ICON.search}</button>
                    <button className="icon-btn" title="Filter">{ICON.filter}</button>
                    <button className="btn btn-dark" onClick={() => setIsAddOpen(true)}>{ICON.plus} Add client</button>
                </div>

                {/* List view */}
                {view === 'list' && (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Client</th><th>Stage</th><th>Health</th><th className="num">Open value</th><th className="num">Deals</th><th className="num">LTV</th><th>Last contact</th><th>Account</th><th style={{ width: 1 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {clients.map((c, i) => {
                                const av = avColors[(c.name || '').charCodeAt(0) % avColors.length];
                                const stage = c.pipeline_stage || 'COLD_LEAD';
                                const health = c.relationship_health || 'cold';
                                return (
                                    <tr key={c.id || i} onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div className={`avatar ${av}`} style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontSize: 10.5, fontWeight: 600 }}>{ini(c.name)}</div>
                                                <div><b>{c.name || c.email}</b><div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{c.company || c.email}</div></div>
                                            </div>
                                        </td>
                                        <td><span className={`chip dot ${stageClass[stage] || 'cold'}`}>{stageLabel[stage] || stage}</span></td>
                                        <td><span style={{ fontSize: 11.5, color: healthColor[health] || 'var(--ink-muted)', fontWeight: 500 }}>● {health}</span></td>
                                        <td className="num" style={{ fontWeight: 600 }}>{c.estimated_value ? fmt(c.estimated_value) : '—'}</td>
                                        <td className="num" style={{ color: 'var(--ink-muted)' }}>{c.total_projects || 0}</td>
                                        <td className="num" style={{ color: 'var(--ink-muted)' }}>{c.total_revenue ? fmt(c.total_revenue) : '—'}</td>
                                        <td style={{ color: 'var(--ink-muted)' }}>{fmtDate(c.last_email_at)}</td>
                                        <td style={{ color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{c.account_email?.split('@')[0] || '—'}</td>
                                        <td>
                                            <div
                                                className="row-menu-wrap"
                                                ref={openMenuId === c.id ? menuWrapRef : null}
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <button
                                                    className="icon-btn"
                                                    aria-label="Row actions"
                                                    aria-haspopup="menu"
                                                    aria-expanded={openMenuId === c.id}
                                                    onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)}
                                                >
                                                    {ICON.more}
                                                </button>
                                                {openMenuId === c.id && (
                                                    <div className="row-menu" role="menu">
                                                        <button className="row-menu-item" role="menuitem" onClick={() => { setOpenMenuId(null); setSelected(c); }}>
                                                            Open
                                                        </button>
                                                        <button
                                                            className="row-menu-item danger"
                                                            role="menuitem"
                                                            disabled={deletingId === c.id}
                                                            onClick={() => handleDelete(c.id, c.name || c.email || 'contact')}
                                                        >
                                                            {deletingId === c.id ? 'Deleting…' : 'Delete'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {/* Grid view */}
                {view === 'grid' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                        {clients.map((c, i) => {
                            const av = avColors[(c.name || '').charCodeAt(0) % avColors.length];
                            const stage = c.pipeline_stage || 'COLD_LEAD';
                            const health = c.relationship_health || 'cold';
                            return (
                                <div key={c.id || i} className="card" style={{ padding: 14, cursor: 'pointer' }} onClick={() => setSelected(c)}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                        <div className={`avatar ${av}`} style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontSize: 12, fontWeight: 600 }}>{ini(c.name)}</div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name || c.email}</div>
                                            <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.company || c.email}</div>
                                        </div>
                                        <span className={`chip dot ${stageClass[stage] || 'cold'}`}>{stageLabel[stage] || stage}</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                                        <div><div style={{ color: 'var(--ink-muted)' }}>Open value</div><div style={{ fontWeight: 600, fontSize: 13 }}>{c.estimated_value ? fmt(c.estimated_value) : '—'}</div></div>
                                        <div><div style={{ color: 'var(--ink-muted)' }}>LTV</div><div style={{ fontWeight: 600, fontSize: 13 }}>{c.total_revenue ? fmt(c.total_revenue) : '—'}</div></div>
                                        <div><div style={{ color: 'var(--ink-muted)' }}>Last</div><div style={{ color: 'var(--ink-2)' }}>{fmtDate(c.last_email_at)}</div></div>
                                        <div><div style={{ color: 'var(--ink-muted)' }}>Health</div><div style={{ color: healthColor[health] || 'var(--ink-muted)', fontWeight: 500 }}>● {health}</div></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Board view */}
                {view === 'board' && (
                    <div className="kanban">
                        {pipelineCols.map(col => {
                            const colClients = clients.filter(c => c.pipeline_stage === col.dbKey);
                            return (
                                <div className="kcol" key={col.key}>
                                    <div className="kcol-head">
                                        <span className="dot" style={{ background: col.color }} />
                                        <span className="title">{col.label}</span>
                                        <span className="count">{colClients.length}</span>
                                    </div>
                                    {colClients.map((c, i) => {
                                        const av = avColors[(c.name || '').charCodeAt(0) % avColors.length];
                                        const health = c.relationship_health || 'cold';
                                        return (
                                            <div className="kcard" key={c.id || i} style={{ cursor: 'pointer' }} onClick={() => setSelected(c)}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                    <div className={`avatar ${av}`} style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontSize: 9, fontWeight: 600 }}>{ini(c.name)}</div>
                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <div className="name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || c.email}</div>
                                                        <div className="co" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.company || ''}</div>
                                                    </div>
                                                </div>
                                                <div className="foot">
                                                    <span className="val">{c.estimated_value ? fmt(c.estimated_value) : '—'}</span>
                                                    <span style={{ color: healthColor[health] || 'var(--ink-muted)' }}>● {health}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>

        {/* Detail drawer */}
        {selected && (
            <>
                <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,15,0.32)', zIndex: 40, animation: 'fadeIn 150ms ease' }} />
                <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, zIndex: 41, background: 'var(--surface)', borderLeft: '1px solid var(--hairline)', boxShadow: '-24px 0 48px rgba(14,14,15,0.12)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 220ms cubic-bezier(.2,.8,.2,1)' }}>
                    {/* Header */}
                    <div style={{ padding: '18px 22px 16px', borderBottom: '1px solid var(--hairline-soft)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--ink-muted)', marginBottom: 12 }}>
                            <span>CRM / Clients /</span>
                            <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{selected.name}</span>
                            <div style={{ flex: 1 }} />
                            <button className="icon-btn" onClick={() => setSelected(null)}>{ICON.x}</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                            <div className={`avatar ${avColors[(selected.name || '').charCodeAt(0) % avColors.length]}`} style={{ width: 56, height: 56, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontSize: 18, fontWeight: 600, flexShrink: 0 }}>{ini(selected.name)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{selected.name}</div>
                                <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 8 }}>{selected.company || ''} · {selected.location || ''}</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    <span className={`chip dot ${stageClass[selected.pipeline_stage] || 'cold'}`}>{stageLabel[selected.pipeline_stage] || 'Cold'}</span>
                                    <span className="chip" style={{ color: healthColor[selected.relationship_health] || 'var(--ink-muted)', fontSize: 10.5 }}>● {selected.relationship_health || 'unknown'}</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                            <button className="btn btn-dark" style={{ fontSize: 12 }} onClick={() => { setComposeDefaultTo(selected.email || ''); setComposeOpen(true); }}>{ICON.mail} Compose</button>
                            <button className="btn btn-ghost" style={{ border: '1px solid var(--hairline-soft)', fontSize: 12 }}>{ICON.calendar} Schedule</button>
                            <div style={{ flex: 1 }} />
                            <button className="icon-btn">{ICON.more}</button>
                        </div>
                    </div>

                    {/* Scroll body */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
                        {/* Stats grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>
                            <StatBox label="Open value" val={selected.estimated_value ? fmt(selected.estimated_value) : '—'} />
                            <StatBox label="Lifetime value" val={selected.total_revenue ? fmt(selected.total_revenue) : '—'} />
                            <StatBox label="Projects" val={String(selected.total_projects || 0)} />
                            <StatBox label="Last contact" val={fmtDate(selected.last_email_at)} />
                        </div>

                        {/* Contact info */}
                        <Section title="Contact">
                            <KV k="Email" v={selected.email || '—'} mono />
                            <KV k="Phone" v={selected.phone || '—'} mono />
                            <KV k="Location" v={selected.location || '—'} />
                            <KV k="Company" v={selected.company || '—'} />
                        </Section>

                        {/* Relationship */}
                        <Section title="Relationship">
                            <KV k="Stage" v={stageLabel[selected.pipeline_stage] || 'Cold'} />
                            <KV k="Health" v={selected.relationship_health || 'unknown'} />
                            <KV k="Lead score" v={String(selected.lead_score || 0)} />
                            <KV k="Account" v={selected.account_email || '—'} mono />
                        </Section>
                    </div>
                </div>
            </>
        )}

        {isAddOpen && <AddLeadModal onClose={() => setIsAddOpen(false)} onAddLead={() => { setIsAddOpen(false); load(); }} />}

        <style>{`
.cl-page{height:100%;overflow-y:auto;background:var(--shell);font-family:var(--font-ui);color:var(--ink)}
.cl-content{padding:22px 26px}
.cl-page .page-head{display:flex;align-items:baseline;gap:14px;margin-bottom:18px;flex-wrap:wrap}
.cl-page .page-head h2{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:0}
.cl-page .page-head .sub{color:var(--ink-muted);font-size:13px;margin-top:4px;width:100%}
.cl-page .tabs{display:flex;gap:2px;padding:3px;background:var(--surface);border-radius:8px;border:1px solid var(--hairline-soft)}
.cl-page .tabs button{padding:4px 10px;font-size:12px;font-weight:500;color:var(--ink-muted);border-radius:6px;border:none;background:none;cursor:pointer;font-family:var(--font-ui);transition:background .12s,color .12s}
.cl-page .tabs button.active{background:var(--shell);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.25)}
.cl-page .icon-btn{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;color:var(--ink-muted);border:none;background:none;cursor:pointer;transition:background .12s}
.cl-page .icon-btn:hover{background:var(--surface);color:var(--ink)}
.cl-page .btn{padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:500;display:inline-flex;align-items:center;gap:6px;border:none;cursor:pointer;font-family:var(--font-ui);transition:background .12s}
.cl-page .btn-dark{background:var(--ink);color:var(--canvas)}
.cl-page .btn-dark:hover{opacity:.9}
.cl-page .btn-ghost{background:none;color:var(--ink-2)}
.cl-page .table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--hairline-soft);border-radius:14px;overflow:hidden}
.cl-page .table th,.cl-page .table td{padding:11px 14px;text-align:left;font-size:12.5px}
.cl-page .table th{font-weight:500;color:var(--ink-muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em;background:color-mix(in oklab,var(--surface-2),transparent 20%);border-bottom:1px solid var(--hairline-soft)}
.cl-page .table tbody tr{border-bottom:1px solid var(--hairline-soft);transition:background .12s}
.cl-page .table tbody tr:last-child{border-bottom:0}
.cl-page .table tbody tr:hover{background:var(--surface-hover)}
.cl-page .num{text-align:right;font-variant-numeric:tabular-nums}
.cl-page .chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;font-size:11px;font-weight:500;border-radius:999px;background:var(--surface-2);color:var(--ink-2);border:1px solid var(--hairline-soft);white-space:nowrap}
.cl-page .chip.dot{padding-left:6px}
.cl-page .chip.dot::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}
.cl-page .chip.cold{background:color-mix(in oklab,var(--info-soft),transparent 20%);color:var(--info);border-color:transparent}
.cl-page .chip.contacted{background:var(--surface-2);color:var(--ink-2)}
.cl-page .chip.lead{background:color-mix(in oklab,var(--accent-soft),transparent 15%);color:var(--accent-ink);border-color:transparent}
.cl-page .chip.warm{background:color-mix(in oklab,var(--warn-soft),transparent 20%);color:var(--warn);border-color:transparent}
.cl-page .chip.closed{background:color-mix(in oklab,var(--coach-soft),transparent 20%);color:var(--coach);border-color:transparent}
.cl-page .chip.dead{background:color-mix(in oklab,var(--danger-soft),transparent 20%);color:var(--danger);border-color:transparent}
.cl-page .row-menu-wrap{position:relative;display:inline-block}
.cl-page .row-menu{position:absolute;right:0;top:calc(100% + 4px);min-width:160px;background:var(--surface);border:1px solid var(--hairline-soft);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:4px;z-index:50;display:flex;flex-direction:column}
.cl-page .row-menu-item{background:none;border:none;color:var(--ink);font-family:var(--font-ui);font-size:13px;text-align:left;padding:8px 12px;border-radius:6px;cursor:pointer;transition:background .12s}
.cl-page .row-menu-item:hover{background:var(--surface-hover)}
.cl-page .row-menu-item:disabled{opacity:.5;cursor:default}
.cl-page .row-menu-item.danger{color:var(--danger)}
.cl-page .row-menu-item.danger:hover{background:color-mix(in oklab,var(--danger-soft),transparent 60%)}
.cl-page .card{background:var(--surface);border:1px solid var(--hairline-soft);border-radius:14px;transition:border-color .12s}
.cl-page .card:hover{border-color:var(--hairline)}
.cl-page .kanban{display:grid;grid-template-columns:repeat(6,minmax(210px,1fr));gap:10px;align-items:start;overflow-x:auto}
.cl-page .kcol{background:var(--shell);border:1px solid var(--hairline-soft);border-radius:14px;padding:10px;min-height:360px}
.cl-page .kcol-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:2px 4px}
.cl-page .kcol-head .dot{width:7px;height:7px;border-radius:50%}
.cl-page .kcol-head .title{font-size:12px;font-weight:600}
.cl-page .kcol-head .count{font-size:11px;color:var(--ink-muted);margin-left:auto}
.cl-page .kcard{background:var(--surface);border:1px solid var(--hairline-soft);border-radius:10px;padding:10px;margin-bottom:8px;cursor:grab;transition:border-color .12s,transform .12s}
.cl-page .kcard:hover{border-color:var(--hairline);transform:translateY(-1px)}
.cl-page .kcard .name{font-size:12.5px;font-weight:600;margin-bottom:2px}
.cl-page .kcard .co{font-size:11.5px;color:var(--ink-muted);margin-bottom:8px}
.cl-page .kcard .foot{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ink-muted)}
.cl-page .kcard .val{color:var(--ink);font-weight:600}
@keyframes slideInRight{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
        `}</style>
        </>
    );
}

function StatBox({ label, val }: { label: string; val: string }) {
    return (
        <div>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-muted)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{val}</div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-muted)', fontWeight: 600, marginBottom: 10 }}>{title}</div>
            {children}
        </div>
    );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
    return (
        <div style={{ display: 'flex', gap: 12, padding: '6px 0', fontSize: 12.5, borderBottom: '1px solid var(--hairline-soft)' }}>
            <div style={{ width: 140, color: 'var(--ink-muted)', flexShrink: 0 }}>{k}</div>
            <div style={{ flex: 1, color: 'var(--ink)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', fontSize: mono ? 12 : 12.5, wordBreak: 'break-word' }}>{v}</div>
        </div>
    );
}
