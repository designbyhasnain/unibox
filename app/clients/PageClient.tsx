'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getClientsAction, removeClientsAction } from '../../src/actions/clientActions';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { updateContactAction, transferContactAction } from '../../src/actions/contactDetailActions';
import { listSalesUsersAction, type SalesUser } from '../../src/actions/projectMetadataActions';
import { listEnrollableCampaignsAction } from '../../src/actions/scraperActions';
import { enrollContactsAction } from '../../src/actions/campaignActions';
import { useGlobalFilter } from '../context/FilterContext';
import { useRegisterGlobalSearch } from '../context/GlobalSearchContext';
import { useUI } from '../context/UIContext';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';
import { useUndoToast } from '../context/UndoToastContext';
import { useConfirm } from '../context/ConfirmContext';
import AddLeadModal from '../components/AddLeadModal';
import OwnerPicker from '../components/OwnerPicker';
import SmartSelect from '../../components/projects/cells/SmartSelect';

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
    const router = useRouter();
    const { selectedAccountId, accounts } = useGlobalFilter();
    const { setComposeOpen, setComposeDefaultTo, setComposeDefaultSubject, setComposeDefaultBody } = useUI();
    const { showError, showSuccess } = useUndoToast();
    const confirm = useConfirm();
    const [clients, setClients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    // Board view dropped — `/opportunities` already owns the kanban with DnD.
    // Selecting "Board" now redirects there instead of showing a duplicate.
    const [view, setView] = useState<'list' | 'grid'>('list');
    // Track the selected contact by id rather than a snapshot object so the
    // side panel always reads the LIVE row from `clients` — that way an
    // optimistic cell edit in the table is reflected in the panel and an
    // edit in the panel reflects in the table without manual sync.
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selected = selectedId ? clients.find(c => c.id === selectedId) || null : null;
    const [searchTerm, setSearchTerm] = useState('');
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 100;
    const [isAdmin, setIsAdmin] = useState(false);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
    const menuWrapRef = useRef<HTMLDivElement | null>(null);

    // ── Filter popover (Phase 3) ──────────────────────────────────────────
    // Wires the existing `stageFilter` server-side param + adds client-side
    // filters for owner / last-contact / has-unpaid (already-loaded data).
    const [filterOpen, setFilterOpen] = useState(false);
    const [stageFilter, setStageFilter] = useState<string>('');
    const [recencyFilter, setRecencyFilter] = useState<'' | '7' | '30' | '90'>('');
    const [hasUnpaidOnly, setHasUnpaidOnly] = useState(false);
    const filterPopoverRef = useRef<HTMLDivElement | null>(null);

    // ── Bulk select (Phase 3) ────────────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const toggleSelect = (id: string) => setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const clearSelection = () => setSelectedIds(new Set());

    // ── Inline-edit reference data ───────────────────────────────────────
    // SALES users power the AM dropdown; enrollable campaigns power the
    // kebab "Enroll in Campaign" picker. Both are loaded lazily on first
    // mount and held in state for the lifetime of the page so dropdowns
    // open instantly. Editor users never reach this page (blockEditorAccess
    // gate at the route level), so we don't bother short-circuiting here.
    const [salesUsers, setSalesUsers] = useState<SalesUser[]>([]);
    const [campaigns, setCampaigns] = useState<{ id: string; name: string; status: string }[]>([]);
    const [ownerPickerOpenFor, setOwnerPickerOpenFor] = useState<string | null>(null);
    const [enrollPickerOpenFor, setEnrollPickerOpenFor] = useState<string | null>(null);
    useEffect(() => {
        listSalesUsersAction().then(r => { if (r.success) setSalesUsers(r.users); }).catch(() => {});
        listEnrollableCampaignsAction().then(setCampaigns).catch(() => {});
    }, []);
    const salesUserById = useMemo(() => {
        const m = new Map<string, SalesUser>();
        for (const u of salesUsers) m.set(u.id, u);
        return m;
    }, [salesUsers]);

    // ── Optimistic cell update ───────────────────────────────────────────
    // Used by every editable cell in the table. Mirrors the pattern from
    // the Projects table: flip local state immediately, fire the server
    // write, revert on failure with a retry toast. account_manager_id is
    // routed via transferContactAction (not updateContactAction) so the
    // OWNERSHIP_TRANSFER audit row is always written (CLAUDE.md rule 13).
    const handleCellUpdate = useCallback(async (contactId: string, field: string, value: unknown) => {
        const prev = clients.find(c => c.id === contactId);
        const previousValue = prev ? (prev as Record<string, unknown>)[field] : undefined;
        setClients(cs => cs.map(c => c.id === contactId ? { ...c, [field]: value } : c));
        try {
            if (field === 'account_manager_id') {
                const res = await transferContactAction(contactId, (value as string | null) || null, { source: 'manual' });
                if (!res.success) throw new Error(res.error || 'Transfer failed');
                return;
            }
            const res = await updateContactAction(contactId, { [field]: value });
            if (!res.success) throw new Error(res.error || 'Update failed');
        } catch (e: any) {
            setClients(cs => cs.map(c => c.id === contactId ? { ...c, [field]: previousValue } : c));
            showError(e?.message || `Couldn't update ${field}`, {
                onRetry: () => handleCellUpdate(contactId, field, value),
            });
        }
    }, [clients, showError]);

    const handleEnroll = useCallback(async (contactId: string, campaignId: string) => {
        const res = await enrollContactsAction(campaignId, [contactId]);
        if (!res.success) {
            showError(('error' in res && res.error) || 'Enrollment failed');
        } else {
            const camp = campaigns.find(c => c.id === campaignId);
            showSuccess(`Enrolled in ${camp?.name || 'campaign'}`);
        }
        setEnrollPickerOpenFor(null);
    }, [campaigns, showError, showSuccess]);
    useEffect(() => {
        if (!filterOpen) return;
        const onDocClick = (e: MouseEvent) => {
            if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) setFilterOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [filterOpen]);

    // Debounce search: only refetch 300ms after user stops typing.
    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(id);
    }, [searchTerm]);

    useRegisterGlobalSearch('/clients', {
        placeholder: 'Search name, email, company',
        value: searchTerm,
        onChange: setSearchTerm,
        onClear: () => setSearchTerm(''),
    });

    const load = useCallback(async () => {
        try {
            const [result, user] = await Promise.all([
                getClientsAction(selectedAccountId, page, PAGE_SIZE, debouncedSearch || undefined, undefined, stageFilter || undefined),
                getCurrentUserAction(),
            ]);
            setClients(result.clients);
            setTotalCount(result.totalCount);
            setTotalPages(result.totalPages);
            setIsAdmin(user?.role === 'ADMIN' || user?.role === 'ACCOUNT_MANAGER');
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [selectedAccountId, debouncedSearch, stageFilter, page]);

    // Reset to page 1 whenever the active filter / search / account scope
    // changes — the old page might be out-of-range for the new result set
    // and would land the user on an empty page. Bulk-select state also gets
    // wiped because the IDs the user picked may no longer be visible.
    useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [selectedAccountId, debouncedSearch, stageFilter]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelectedId(null); setOpenMenuId(null); } };
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

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        const ok = await confirm({
            title: `Delete ${ids.length} contact${ids.length === 1 ? '' : 's'}?`,
            message: 'Email history is preserved (messages stay in the inbox), but the contact rows and their project links will be removed.',
            confirmLabel: `Delete ${ids.length}`,
            danger: true,
            requireType: ids.length >= 10 ? `delete ${ids.length}` : undefined,
        });
        if (!ok) return;
        setBulkDeleting(true);
        const res = await removeClientsAction(ids);
        setBulkDeleting(false);
        if (!res.success) {
            showError(res.error || 'Bulk delete failed', { onRetry: handleBulkDelete });
            return;
        }
        setClients(prev => prev.filter(c => !selectedIds.has(c.id)));
        setTotalCount(t => Math.max(0, t - ids.length));
        clearSelection();
    };

    const handleDelete = async (contactId: string, name: string) => {
        const ok = await confirm({
            title: `Delete contact "${name}"?`,
            message: 'Email history is preserved (messages stay in the inbox), but the contact row and any project links will be removed.',
            confirmLabel: 'Delete contact',
            danger: true,
        });
        if (!ok) {
            setOpenMenuId(null);
            return;
        }
        setDeletingId(contactId);
        setOpenMenuId(null);
        const res = await removeClientsAction([contactId]);
        setDeletingId(null);
        if (!res.success) {
            showError(res.error || 'Failed to delete contact', { onRetry: () => handleDelete(contactId, name) });
            return;
        }
        setClients(prev => prev.filter(c => c.id !== contactId));
        setTotalCount(t => Math.max(0, t - 1));
        if (selectedId === contactId) setSelectedId(null);
    };

    if (!hydrated || loading) return <PageLoader isLoading type="list" count={10} context="clients"><div /></PageLoader>;

    const avColors = ['av-a', 'av-b', 'av-c', 'av-d', 'av-e', 'av-f', 'av-g', 'av-h'];
    // Apply client-side filters on top of the server-filtered list.
    const recencyCutoff = recencyFilter ? Date.now() - parseInt(recencyFilter, 10) * 86_400_000 : null;
    const filteredClients = clients.filter((c: any) => {
        if (recencyCutoff !== null) {
            const t = c.last_email_at ? new Date(c.last_email_at).getTime() : 0;
            if (!t || t < recencyCutoff) return false;
        }
        if (hasUnpaidOnly && !c.unpaid_amount) return false;
        return true;
    });
    const activeFilterCount = (stageFilter ? 1 : 0) + (recencyFilter ? 1 : 0) + (hasUnpaidOnly ? 1 : 0);
    const hotCount = filteredClients.filter(c => c.pipeline_stage === 'LEAD' || c.pipeline_stage === 'OFFER_ACCEPTED').length;
    const warmCount = filteredClients.filter(c => c.pipeline_stage === 'WARM_LEAD').length;
    const openPipeline = filteredClients.reduce((s: number, c: any) => s + (c.estimated_value || 0), 0);

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
                        {(['list', 'grid'] as const).map(v => (
                            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
                        ))}
                        <button onClick={() => router.push('/opportunities')} title="Open the pipeline kanban">Board</button>
                    </div>
                    <div ref={filterPopoverRef} style={{ position: 'relative' }}>
                        <button className="icon-btn" title="Filter" aria-haspopup="menu" aria-expanded={filterOpen} onClick={() => setFilterOpen(o => !o)}>
                            {ICON.filter}
                            {activeFilterCount > 0 && <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 600, color: 'var(--accent-ink)' }}>{activeFilterCount}</span>}
                        </button>
                        {filterOpen && (
                            <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 240, background: 'var(--surface)', border: '1px solid var(--hairline-soft)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.18)', padding: 12, zIndex: 50 }}>
                                <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: 6 }}>Stage</div>
                                <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: 12.5, border: '1px solid var(--hairline)', borderRadius: 6, background: 'var(--canvas)', color: 'var(--ink)', marginBottom: 12 }}>
                                    <option value="">All stages</option>
                                    <option value="COLD_LEAD">Cold Lead</option>
                                    <option value="CONTACTED">Contacted</option>
                                    <option value="WARM_LEAD">Warm Lead</option>
                                    <option value="LEAD">Lead</option>
                                    <option value="OFFER_ACCEPTED">Offer</option>
                                    <option value="CLOSED">Closed</option>
                                    <option value="NOT_INTERESTED">Not interested</option>
                                </select>
                                <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: 6 }}>Last contact</div>
                                <select value={recencyFilter} onChange={e => setRecencyFilter(e.target.value as any)} style={{ width: '100%', padding: '6px 8px', fontSize: 12.5, border: '1px solid var(--hairline)', borderRadius: 6, background: 'var(--canvas)', color: 'var(--ink)', marginBottom: 12 }}>
                                    <option value="">Any time</option>
                                    <option value="7">Last 7 days</option>
                                    <option value="30">Last 30 days</option>
                                    <option value="90">Last 90 days</option>
                                </select>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginBottom: 12, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={hasUnpaidOnly} onChange={e => setHasUnpaidOnly(e.target.checked)} />
                                    Has unpaid balance
                                </label>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                    <button
                                        onClick={() => { setStageFilter(''); setRecencyFilter(''); setHasUnpaidOnly(false); }}
                                        style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', fontSize: 12, cursor: 'pointer' }}
                                    >Clear</button>
                                    <button
                                        onClick={() => setFilterOpen(false)}
                                        className="btn btn-dark"
                                        style={{ padding: '5px 10px', fontSize: 12 }}
                                    >Done</button>
                                </div>
                            </div>
                        )}
                    </div>
                    <button className="btn btn-dark" onClick={() => setIsAddOpen(true)}>{ICON.plus} Add client</button>
                </div>

                {/* Bulk action bar */}
                {selectedIds.size > 0 && (
                    <div style={{
                        position: 'sticky', top: 0, zIndex: 10,
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', marginBottom: 10,
                        background: 'var(--surface)', border: '1px solid var(--accent)',
                        borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                            {selectedIds.size} selected
                        </span>
                        <button
                            className="btn btn-ghost"
                            style={{ border: '1px solid var(--hairline-soft)', fontSize: 12 }}
                            onClick={clearSelection}
                            disabled={bulkDeleting}
                        >Clear</button>
                        <div style={{ flex: 1 }} />
                        <button
                            className="btn"
                            style={{ background: 'var(--danger)', color: 'white', fontSize: 12 }}
                            onClick={handleBulkDelete}
                            disabled={bulkDeleting}
                        >
                            {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
                        </button>
                    </div>
                )}

                {/* List view */}
                {view === 'list' && (
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: 30 }}>
                                    <input
                                        type="checkbox"
                                        aria-label="Select all visible"
                                        checked={filteredClients.length > 0 && selectedIds.size > 0 && filteredClients.every(c => selectedIds.has(c.id))}
                                        ref={el => {
                                            if (el) el.indeterminate = selectedIds.size > 0 && !filteredClients.every(c => selectedIds.has(c.id));
                                        }}
                                        onChange={e => {
                                            if (e.target.checked) setSelectedIds(new Set(filteredClients.map(c => c.id)));
                                            else clearSelection();
                                        }}
                                        style={{ accentColor: 'var(--accent)' }}
                                    />
                                </th>
                                <th>Client</th><th>Stage</th><th>Health</th><th className="num">Open value</th><th className="num">Deals</th><th className="num">LTV</th><th>Last contact</th><th>Owner</th><th style={{ width: 1 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredClients.length === 0 && (
                                <tr><td colSpan={10}>
                                    <div className="empty-state-v2">
                                        <div className="empty-illu" aria-hidden="true">
                                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                        </div>
                                        <h3>{activeFilterCount > 0 ? 'No matches' : 'No clients yet'}</h3>
                                        <p>{activeFilterCount > 0 ? 'Try removing or relaxing your filters.' : 'Replies from cold outreach surface here as warm leads. Or add a client manually with the “+ New” button.'}</p>
                                    </div>
                                </td></tr>
                            )}
                            {filteredClients.map((c, i) => {
                                const av = avColors[(c.name || '').charCodeAt(0) % avColors.length];
                                const stage = c.pipeline_stage || 'COLD_LEAD';
                                const health = c.relationship_health || 'cold';
                                const amUser = c.account_manager_id ? salesUserById.get(c.account_manager_id) : null;
                                const lastContactIso = c.last_email_at ? new Date(c.last_email_at).toISOString().slice(0, 16) : '';
                                return (
                                    <tr key={c.id || i} onClick={() => router.push(`/clients/${c.id}`)} style={{ cursor: 'pointer' }}>
                                        <td onClick={e => e.stopPropagation()} style={{ width: 30 }}>
                                            <input
                                                type="checkbox"
                                                aria-label={`Select ${c.name || c.email}`}
                                                checked={selectedIds.has(c.id)}
                                                onChange={() => toggleSelect(c.id)}
                                                style={{ accentColor: 'var(--accent)' }}
                                            />
                                        </td>
                                        {/* Client name + company. Click opens the side panel. */}
                                        <td onClick={() => setSelectedId(c.id)} style={{ cursor: 'pointer' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div className={`avatar ${av}`} style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontSize: 10.5, fontWeight: 600 }}>{ini(c.name)}</div>
                                                <div><b>{c.name || c.email}</b><div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{c.company || c.email}</div></div>
                                            </div>
                                        </td>
                                        {/* Stage — SmartSelect, creatable. New stages persist as plain
                                            text but won't appear in the funnel filters (those use the
                                            6 enum values). User-aware tradeoff per the spec. */}
                                        <td onClick={e => e.stopPropagation()}>
                                            <SmartSelect
                                                value={stage}
                                                onChange={(v) => v && handleCellUpdate(c.id, 'pipeline_stage', v)}
                                                creatable
                                                pillClass={`chip dot ${stageClass[stage] || 'cold'}`}
                                                options={[
                                                    { value: 'COLD_LEAD', label: 'Cold' },
                                                    { value: 'CONTACTED', label: 'Contacted' },
                                                    { value: 'WARM_LEAD', label: 'Warm' },
                                                    { value: 'LEAD', label: 'Lead' },
                                                    { value: 'OFFER_ACCEPTED', label: 'Offer' },
                                                    { value: 'CLOSED', label: 'Closed' },
                                                    { value: 'NOT_INTERESTED', label: 'Dead' },
                                                    ...(stage && !['COLD_LEAD','CONTACTED','WARM_LEAD','LEAD','OFFER_ACCEPTED','CLOSED','NOT_INTERESTED'].includes(stage)
                                                        ? [{ value: stage, label: stage }] : []),
                                                ]}
                                            />
                                        </td>
                                        {/* Health — SmartSelect, creatable. */}
                                        <td onClick={e => e.stopPropagation()}>
                                            <SmartSelect
                                                value={health}
                                                onChange={(v) => v && handleCellUpdate(c.id, 'relationship_health', v)}
                                                creatable
                                                options={[
                                                    { value: 'strong', label: 'strong', bg: 'transparent', fg: healthColor.strong },
                                                    { value: 'warm', label: 'warm', bg: 'transparent', fg: healthColor.warm },
                                                    { value: 'good', label: 'good', bg: 'transparent', fg: healthColor.good },
                                                    { value: 'neutral', label: 'neutral', bg: 'transparent', fg: 'var(--ink-muted)' },
                                                    { value: 'cooling', label: 'cooling', bg: 'transparent', fg: healthColor.cooling },
                                                    { value: 'cold', label: 'cold', bg: 'transparent', fg: healthColor.cold },
                                                    { value: 'at-risk', label: 'at-risk', bg: 'transparent', fg: healthColor['at-risk'] },
                                                    { value: 'critical', label: 'critical', bg: 'transparent', fg: healthColor.critical },
                                                    { value: 'dead', label: 'dead', bg: 'transparent', fg: healthColor.dead },
                                                ]}
                                            />
                                        </td>
                                        {/* Open value — editable numeric with $ prefix. */}
                                        <td className="num" onClick={e => e.stopPropagation()}>
                                            <NumericCell
                                                value={c.estimated_value}
                                                onCommit={(n) => handleCellUpdate(c.id, 'estimated_value', n)}
                                            />
                                        </td>
                                        {/* Deals (total_projects) — usually a derived count, but the
                                            user wants it editable for manual override on imported leads. */}
                                        <td className="num" onClick={e => e.stopPropagation()}>
                                            <NumericCell
                                                value={c.total_projects}
                                                onCommit={(n) => handleCellUpdate(c.id, 'total_projects', n)}
                                                noPrefix
                                            />
                                        </td>
                                        {/* LTV (total_revenue) — editable numeric with $ prefix. */}
                                        <td className="num" onClick={e => e.stopPropagation()}>
                                            <NumericCell
                                                value={c.total_revenue}
                                                onCommit={(n) => handleCellUpdate(c.id, 'total_revenue', n)}
                                            />
                                        </td>
                                        {/* Last contact — datetime-local picker. Browser-native, no
                                            extra deps. We round-trip ISO ↔ "yyyy-MM-ddTHH:mm" so the
                                            input controls the value cleanly. */}
                                        <td onClick={e => e.stopPropagation()}>
                                            <input
                                                type="datetime-local"
                                                value={lastContactIso}
                                                onChange={(e) => {
                                                    const iso = e.target.value ? new Date(e.target.value).toISOString() : null;
                                                    handleCellUpdate(c.id, 'last_email_at', iso);
                                                }}
                                                style={{
                                                    background: 'transparent', border: '1px solid transparent',
                                                    color: 'var(--ink-muted)', fontSize: 12, padding: '4px 6px',
                                                    borderRadius: 6, fontFamily: 'inherit', cursor: 'pointer',
                                                    width: '100%',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--hairline-soft)')}
                                                onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                                            />
                                        </td>
                                        {/* Owner — SmartSelect with SALES users only. Writes via
                                            transferContactAction so the audit log fires. */}
                                        <td onClick={e => e.stopPropagation()}>
                                            <SmartSelect
                                                value={c.account_manager_id || null}
                                                onChange={(v) => handleCellUpdate(c.id, 'account_manager_id', v)}
                                                clearable
                                                clearLabel="Unassigned"
                                                placeholder="Unassigned"
                                                pillClass="ep-pill"
                                                options={salesUsers.map(u => ({
                                                    value: u.id,
                                                    label: u.name,
                                                    subtitle: u.email,
                                                    avatar: u.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase(),
                                                }))}
                                            />
                                        </td>
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
                                                        <button className="row-menu-item" role="menuitem" onClick={() => { setOpenMenuId(null); router.push(`/clients/${c.id}`); }}>

                                                            Open
                                                        </button>
                                                        {isAdmin && (
                                                            <button className="row-menu-item" role="menuitem" onClick={() => { setOpenMenuId(null); setOwnerPickerOpenFor(c.id); }}>
                                                                Transfer owner…
                                                            </button>
                                                        )}
                                                        <button className="row-menu-item" role="menuitem" onClick={() => { setOpenMenuId(null); setEnrollPickerOpenFor(c.id); }}>
                                                            Enroll in campaign…
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
                        {filteredClients.map((c, i) => {
                            const av = avColors[(c.name || '').charCodeAt(0) % avColors.length];
                            const stage = c.pipeline_stage || 'COLD_LEAD';
                            const health = c.relationship_health || 'cold';
                            return (
                                <div key={c.id || i} className="card" style={{ padding: 14, cursor: 'pointer' }} onClick={() => router.push(`/clients/${c.id}`)}>
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

                {/* Pagination footer — shown only when the dataset is
                    multi-page. Server-side: each click swaps in the next
                    100 rows via getClientsAction(page=N). filteredClients
                    is the *page-local* client-side filtered slice, so the
                    "showing X–Y of Z" range is computed off the raw page
                    count, not the filtered count. */}
                {totalPages > 1 && view === 'list' && (
                    <div className="cl-pager">
                        <div className="cl-pager-info">
                            Showing <b>{((page - 1) * PAGE_SIZE) + 1}</b>–<b>{Math.min(page * PAGE_SIZE, totalCount)}</b> of <b>{totalCount.toLocaleString()}</b>
                        </div>
                        <div className="cl-pager-ctrl">
                            <button
                                className="cl-pager-btn"
                                disabled={page <= 1}
                                onClick={() => { setPage(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                title="First page"
                            >« First</button>
                            <button
                                className="cl-pager-btn"
                                disabled={page <= 1}
                                onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            >‹ Prev</button>
                            <span className="cl-pager-num">
                                Page <b>{page}</b> of {totalPages.toLocaleString()}
                            </span>
                            <button
                                className="cl-pager-btn"
                                disabled={page >= totalPages}
                                onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            >Next ›</button>
                            <button
                                className="cl-pager-btn"
                                disabled={page >= totalPages}
                                onClick={() => { setPage(totalPages); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                title="Last page"
                            >Last »</button>
                        </div>
                    </div>
                )}

                {/* Board view removed Phase 3 — `/opportunities` owns the pipeline kanban. */}
            </div>
        </div>

        {/* Detail drawer */}
        {selected && (
            <>
                <div onClick={() => setSelectedId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,15,0.32)', zIndex: 40, animation: 'fadeIn 150ms ease' }} />
                <div className="cl-drawer" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, zIndex: 41, background: 'var(--surface)', borderLeft: '1px solid var(--hairline)', boxShadow: '-24px 0 48px rgba(14,14,15,0.12)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 220ms cubic-bezier(.2,.8,.2,1)' }}>
                    {/* Header */}
                    <div style={{ padding: '18px 22px 16px', borderBottom: '1px solid var(--hairline-soft)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--ink-muted)', marginBottom: 12 }}>
                            <span>CRM / Clients /</span>
                            <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{selected.name}</span>
                            <div style={{ flex: 1 }} />
                            <button className="icon-btn" onClick={() => setSelectedId(null)}>{ICON.x}</button>
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
                        <div style={{ display: 'flex', gap: 8, marginTop: 14, position: 'relative' }}>
                            <button className="btn btn-dark" style={{ fontSize: 12 }} onClick={() => {
                                setComposeDefaultTo(selected.email || '');
                                setComposeDefaultSubject('');
                                setComposeDefaultBody('');
                                setComposeOpen(true);
                            }}>{ICON.mail} Compose</button>
                            {/* Schedule — opens compose pre-filled with a quick-meeting
                                template. The user can paste in a Calendly link or pick
                                slots; we just save them the empty draft. */}
                            <button
                                className="btn btn-ghost"
                                style={{ border: '1px solid var(--hairline-soft)', fontSize: 12 }}
                                onClick={() => {
                                    const firstNm = (selected.name || '').split(' ')[0] || 'there';
                                    setComposeDefaultTo(selected.email || '');
                                    setComposeDefaultSubject(`Quick call?`);
                                    setComposeDefaultBody(
                                        `Hi ${firstNm},<br><br>Could we do a quick 15-minute call this week to align on next steps? Here are a few times that work for me — let me know what's good for you:<br><br>• <br>• <br>• <br><br>Or if you'd rather, here's my calendar: <a href="">paste link</a>.<br><br>Thanks!`
                                    );
                                    setComposeOpen(true);
                                }}
                            >
                                {ICON.calendar} Schedule
                            </button>
                            <div style={{ flex: 1 }} />
                            {/* Detail-panel kebab — same actions as the row kebab. */}
                            <div style={{ position: 'relative' }}>
                                <button
                                    className="icon-btn"
                                    aria-haspopup="menu"
                                    aria-expanded={openMenuId === `detail-${selected.id}`}
                                    onClick={() => setOpenMenuId(openMenuId === `detail-${selected.id}` ? null : `detail-${selected.id}`)}
                                >
                                    {ICON.more}
                                </button>
                                {openMenuId === `detail-${selected.id}` && (
                                    <div className="row-menu" role="menu" style={{ right: 0, left: 'auto' }}>
                                        {isAdmin && (
                                            <button className="row-menu-item" role="menuitem" onClick={() => { setOpenMenuId(null); setOwnerPickerOpenFor(selected.id); }}>
                                                Transfer owner…
                                            </button>
                                        )}
                                        <button className="row-menu-item" role="menuitem" onClick={() => { setOpenMenuId(null); setEnrollPickerOpenFor(selected.id); }}>
                                            Enroll in campaign…
                                        </button>
                                        <button
                                            className="row-menu-item danger"
                                            role="menuitem"
                                            disabled={deletingId === selected.id}
                                            onClick={() => { setOpenMenuId(null); handleDelete(selected.id, selected.name || selected.email || 'contact'); }}
                                        >
                                            {deletingId === selected.id ? 'Deleting…' : 'Delete'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Scroll body */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
                        {/* Stats grid — Open Value / LTV are editable
                            NumericCells matching the table; Projects + Last
                            Contact stay informational (Last Contact still
                            edits via the table). */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>
                            <StatBox
                                label="Open value"
                                val={
                                    <NumericCell
                                        value={selected.estimated_value}
                                        onCommit={(n) => handleCellUpdate(selected.id, 'estimated_value', n)}
                                    />
                                }
                            />
                            <StatBox
                                label="Lifetime value"
                                val={
                                    <NumericCell
                                        value={selected.total_revenue}
                                        onCommit={(n) => handleCellUpdate(selected.id, 'total_revenue', n)}
                                    />
                                }
                            />
                            <StatBox
                                label="Deals"
                                val={
                                    <NumericCell
                                        value={selected.total_projects}
                                        onCommit={(n) => handleCellUpdate(selected.id, 'total_projects', n)}
                                        noPrefix
                                    />
                                }
                            />
                            <StatBox label="Last contact" val={fmtDate(selected.last_email_at)} />
                        </div>

                        {/* Contact info — every field is click-to-edit and
                            saves optimistically via handleCellUpdate. */}
                        <Section title="Contact">
                            <KVCell k="Email">
                                <TextCell
                                    value={selected.email}
                                    onCommit={(v) => handleCellUpdate(selected.id, 'email', v)}
                                    mono
                                    type="email"
                                    placeholder="add email…"
                                />
                            </KVCell>
                            <KVCell k="Phone">
                                <TextCell
                                    value={selected.phone}
                                    onCommit={(v) => handleCellUpdate(selected.id, 'phone', v)}
                                    mono
                                    type="tel"
                                    placeholder="add phone…"
                                />
                            </KVCell>
                            <KVCell k="Location">
                                <TextCell
                                    value={selected.location}
                                    onCommit={(v) => handleCellUpdate(selected.id, 'location', v)}
                                    placeholder="add location…"
                                />
                            </KVCell>
                            <KVCell k="Company">
                                <TextCell
                                    value={selected.company}
                                    onCommit={(v) => handleCellUpdate(selected.id, 'company', v)}
                                    placeholder="add company…"
                                />
                            </KVCell>
                        </Section>

                        {/* Relationship — Stage/Health/Owner are now interactive
                            SmartSelects matching the table cell behaviour. The
                            "Source Gmail Account" surfaces last_gmail_account_id
                            (read-only — set when the first email arrives or
                            via Add Client). */}
                        <Section title="Relationship">
                            <KVCell k="Stage">
                                <SmartSelect
                                    value={selected.pipeline_stage || 'COLD_LEAD'}
                                    onChange={(v) => v && handleCellUpdate(selected.id, 'pipeline_stage', v)}
                                    creatable
                                    pillClass={`chip dot ${stageClass[selected.pipeline_stage] || 'cold'}`}
                                    options={[
                                        { value: 'COLD_LEAD', label: 'Cold' },
                                        { value: 'CONTACTED', label: 'Contacted' },
                                        { value: 'WARM_LEAD', label: 'Warm' },
                                        { value: 'LEAD', label: 'Lead' },
                                        { value: 'OFFER_ACCEPTED', label: 'Offer' },
                                        { value: 'CLOSED', label: 'Closed' },
                                        { value: 'NOT_INTERESTED', label: 'Dead' },
                                    ]}
                                />
                            </KVCell>
                            <KVCell k="Health">
                                <SmartSelect
                                    value={selected.relationship_health || 'neutral'}
                                    onChange={(v) => v && handleCellUpdate(selected.id, 'relationship_health', v)}
                                    creatable
                                    options={[
                                        { value: 'neutral', label: 'neutral' },
                                        { value: 'strong', label: 'strong' },
                                        { value: 'warm', label: 'warm' },
                                        { value: 'good', label: 'good' },
                                        { value: 'cooling', label: 'cooling' },
                                        { value: 'cold', label: 'cold' },
                                        { value: 'at-risk', label: 'at-risk' },
                                        { value: 'critical', label: 'critical' },
                                        { value: 'dead', label: 'dead' },
                                    ]}
                                />
                            </KVCell>
                            <KVCell k="Lead score">
                                <NumericCell
                                    value={selected.lead_score}
                                    onCommit={(n) => handleCellUpdate(selected.id, 'lead_score', n)}
                                    noPrefix
                                />
                            </KVCell>
                            <KVCell k="Account manager">
                                <SmartSelect
                                    value={selected.account_manager_id || null}
                                    onChange={(v) => handleCellUpdate(selected.id, 'account_manager_id', v)}
                                    clearable
                                    clearLabel="Unassigned"
                                    placeholder="Unassigned"
                                    options={salesUsers.map(u => ({
                                        value: u.id,
                                        label: u.name,
                                        subtitle: u.email,
                                        avatar: u.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase(),
                                    }))}
                                />
                            </KVCell>
                            {/* Source Gmail account — SmartSelect lets the user
                                reassign which inbox the contact is attributed to.
                                The sync pipeline still overwrites this on the next
                                inbound email (see CONTACT_UPDATABLE_FIELDS comment
                                in contactDetailActions.ts). */}
                            <KVCell k="Source Gmail account">
                                <SmartSelect
                                    value={selected.last_gmail_account_id || null}
                                    onChange={(v) => handleCellUpdate(selected.id, 'last_gmail_account_id', v)}
                                    clearable
                                    clearLabel="None"
                                    placeholder="No source"
                                    options={accounts.map(a => ({
                                        value: a.id,
                                        label: a.email,
                                    }))}
                                />
                            </KVCell>
                        </Section>
                    </div>
                </div>
            </>
        )}

        {isAddOpen && (
            <AddLeadModal
                onClose={() => setIsAddOpen(false)}
                onAddLead={() => { setIsAddOpen(false); load(); }}
                /* Skip the modal's own listSalesUsersAction round-trip — the
                   parent has already loaded the SALES roster, so the AM
                   dropdown is populated the moment the modal opens. */
                presetSalesUsers={salesUsers}
                presetIsAdmin={isAdmin}
            />
        )}

        {/* Owner-transfer picker — modal-style. Renders on top of the
            page so it's reachable from both the row kebab and the
            detail-panel kebab. transferContactAction handles the audit
            row + RBAC enforcement. */}
        {ownerPickerOpenFor && (() => {
            const target = clients.find(c => c.id === ownerPickerOpenFor);
            if (!target) return null;
            return (
                <div onClick={() => setOwnerPickerOpenFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,15,0.5)', zIndex: 60, display: 'grid', placeItems: 'center' }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 14, padding: 20, width: 480, maxWidth: '90vw' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Transfer owner</div>
                        <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginBottom: 14 }}>
                            Reassign <b style={{ color: 'var(--ink)' }}>{target.name || target.email}</b> to a different account manager. The change is logged for audit.
                        </div>
                        <OwnerPicker
                            contactId={ownerPickerOpenFor}
                            currentOwnerId={target.account_manager_id || null}
                            currentOwnerName={salesUserById.get(target.account_manager_id || '')?.name || null}
                            layout="inline"
                            open
                            onCancel={() => setOwnerPickerOpenFor(null)}
                            onTransferred={(next) => {
                                setClients(cs => cs.map(c => c.id === ownerPickerOpenFor ? { ...c, account_manager_id: next.id } : c));
                                setOwnerPickerOpenFor(null);
                                showSuccess(next.id ? `Transferred to ${next.name}` : 'Set to unassigned');
                            }}
                        />
                    </div>
                </div>
            );
        })()}

        {/* Campaign-enroll picker — small modal listing running + draft
            campaigns. Click to enroll the contact. */}
        {enrollPickerOpenFor && (
            <div onClick={() => setEnrollPickerOpenFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,15,0.5)', zIndex: 60, display: 'grid', placeItems: 'center' }}>
                <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 14, padding: 20, width: 420, maxWidth: '90vw' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Enroll in campaign</div>
                    {campaigns.length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--ink-muted)', padding: '16px 0' }}>
                            No enrollable campaigns. Start one in <Link href="/campaigns" style={{ color: 'var(--accent)' }}>Campaigns</Link>.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {campaigns.map(camp => (
                                <button
                                    key={camp.id}
                                    onClick={() => handleEnroll(enrollPickerOpenFor, camp.id)}
                                    style={{
                                        textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                                        background: 'var(--surface-2)', border: '1px solid var(--hairline-soft)',
                                        color: 'var(--ink)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    }}
                                >
                                    <span>{camp.name}</span>
                                    <span style={{ fontSize: 10.5, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{camp.status}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <div style={{ marginTop: 14, textAlign: 'right' }}>
                        <button className="btn btn-ghost" style={{ border: '1px solid var(--hairline-soft)', fontSize: 12 }} onClick={() => setEnrollPickerOpenFor(null)}>Close</button>
                    </div>
                </div>
            </div>
        )}

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
/* Don't clip the table — the absolute-positioned .row-menu dropdown sits
   on the rightmost cell and was being chopped against the rounded corner.
   Border-radius still works because there's no background overflow. */
.cl-page .table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--hairline-soft);border-radius:14px}
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
.cl-drawer .row-menu-wrap{position:relative;display:inline-block}
/* Unscoped: the table kebab and the slide-out drawer kebab both use the
   same .row-menu/.row-menu-item classes, but the drawer is rendered as
   a sibling of .cl-page (not inside it) so a .cl-page .row-menu rule
   never reached it — items rendered with the browser's default inline
   button styling, which is what produced the
   "Transfer owner…Enroll in campaign…Delete" run-on-line bug.
   z-index 70 so the menu floats above the drawer (z-index 41) AND its
   own backdrop scrim. */
.row-menu{
    position:absolute;
    right:0;
    top:calc(100% + 6px);
    min-width:180px;
    background:var(--surface-2);
    border:1px solid var(--hairline);
    border-radius:10px;
    box-shadow:0 10px 28px rgba(0,0,0,.32);
    padding:6px;
    z-index:70;
    display:flex;
    flex-direction:column;
    gap:2px;
}
.row-menu-item{
    display:block;
    width:100%;
    background:none;
    border:none;
    color:var(--ink);
    font-family:var(--font-ui);
    font-size:13px;
    text-align:left;
    padding:8px 12px;
    border-radius:6px;
    cursor:pointer;
    /* keep each label on a single line — was wrapping inline before */
    white-space:nowrap;
    transition:background .12s, color .12s;
}
.row-menu-item:hover{background:var(--surface-hover);color:var(--ink)}
.row-menu-item:disabled{opacity:.5;cursor:default}
.row-menu-item.danger{color:var(--danger)}
.row-menu-item.danger:hover{background:color-mix(in oklab,var(--danger-soft),transparent 60%);color:var(--danger)}

/* Detail-panel editable affordance — show the pencil + a soft hover
   background on the value column so the user knows the row is
   interactive (Stage/Health/Owner pills look identical to read-only
   labels otherwise). The hover state covers the entire value cell, so
   a click anywhere in that area lands on the SmartSelect/NumericCell. */
.cl-drawer .kv-cell-editable:hover .kv-cell-pencil { opacity: 0.6; }
.cl-drawer .kv-cell-editable:hover .kv-cell-value { background: var(--surface-hover); }
.cl-drawer .kv-cell-value { cursor: pointer; }
.cl-drawer .ep-ss-trigger { cursor: pointer; width: 100%; }
.cl-page .card{background:var(--surface);border:1px solid var(--hairline-soft);border-radius:14px;transition:border-color .12s}
.cl-page .card:hover{border-color:var(--hairline)}
.cl-page .cl-pager{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:14px;padding:12px 14px;background:var(--surface);border:1px solid var(--hairline-soft);border-radius:12px;flex-wrap:wrap}
.cl-page .cl-pager-info{font-size:12px;color:var(--ink-muted)}
.cl-page .cl-pager-info b{color:var(--ink);font-variant-numeric:tabular-nums;font-weight:600}
.cl-page .cl-pager-ctrl{display:flex;align-items:center;gap:6px}
.cl-page .cl-pager-num{font-size:12px;color:var(--ink-muted);padding:0 8px;font-variant-numeric:tabular-nums}
.cl-page .cl-pager-num b{color:var(--ink);font-weight:600}
.cl-page .cl-pager-btn{padding:5px 10px;font-size:12px;font-weight:500;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--hairline-soft);border-radius:7px;cursor:pointer;font-family:var(--font-ui);transition:background .12s,color .12s,border-color .12s}
.cl-page .cl-pager-btn:hover:not(:disabled){background:var(--surface-hover);color:var(--ink);border-color:var(--hairline)}
.cl-page .cl-pager-btn:disabled{opacity:.4;cursor:not-allowed}
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

function StatBox({ label, val }: { label: string; val: React.ReactNode }) {
    return (
        <div>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-muted)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{val}</div>
        </div>
    );
}

// Editable KV row — wraps a SmartSelect/control. The whole right side has
// a hover background so the user immediately sees the field is interactive
// (no "toggle to edit" mode — clicking the value opens the dropdown).
function KVCell({ k, children }: { k: string; children: React.ReactNode }) {
    return (
        <div
            className="kv-cell-editable"
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', fontSize: 12.5, borderBottom: '1px solid var(--hairline-soft)', minHeight: 32 }}
        >
            <div style={{ width: 140, color: 'var(--ink-muted)', flexShrink: 0 }}>{k}</div>
            <div className="kv-cell-value" style={{ flex: 1, minWidth: 0, position: 'relative', padding: '4px 8px', margin: '-4px -8px', borderRadius: 6, transition: 'background 0.12s' }}>
                {children}
                <span
                    aria-hidden="true"
                    className="kv-cell-pencil"
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--ink-faint)', pointerEvents: 'none', opacity: 0, transition: 'opacity 0.12s' }}
                >
                    ✎
                </span>
            </div>
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

// Inline text editor for free-form fields (Email, Phone, Location,
// Company in the drawer). Click to edit, save on Enter or blur, Escape
// to revert. Commits only when the value actually changed so we don't
// fire pointless server writes on every focus/blur cycle.
function TextCell({ value, onCommit, mono, placeholder, type }: {
    value: string | null | undefined;
    onCommit: (s: string | null) => void;
    mono?: boolean;
    placeholder?: string;
    type?: 'text' | 'email' | 'tel';
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<string>(value ?? '');
    useEffect(() => { if (!editing) setDraft(value ?? ''); }, [value, editing]);

    const commit = () => {
        setEditing(false);
        const trimmed = draft.trim();
        const next = trimmed === '' ? null : trimmed;
        if (next !== (value ?? null)) onCommit(next);
    };

    if (editing) {
        return (
            <input
                type={type ?? 'text'}
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commit(); }
                    else if (e.key === 'Escape') { setEditing(false); setDraft(value ?? ''); }
                }}
                placeholder={placeholder}
                style={{
                    width: '100%', background: 'var(--canvas)',
                    border: '1px solid var(--accent)', borderRadius: 6,
                    padding: '4px 8px', fontSize: mono ? 12 : 12.5,
                    color: 'var(--ink)', fontFamily: mono ? 'var(--font-mono)' : 'inherit',
                    outline: 'none',
                }}
            />
        );
    }
    const display = value && value.trim() !== ''
        ? <span style={{ color: 'var(--ink)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', fontSize: mono ? 12 : 12.5, wordBreak: 'break-word' }}>{value}</span>
        : <span style={{ color: 'var(--ink-faint)' }}>{placeholder ?? '—'}</span>;
    return (
        <span
            tabIndex={0}
            role="button"
            onClick={() => setEditing(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); } }}
            style={{ display: 'block', minHeight: 18, cursor: 'text', outline: 'none' }}
        >
            {display}
        </span>
    );
}

// Inline numeric editor used by the Open Value / Deals / LTV columns.
// Edits are committed on blur or Enter — matching the user's mental
// model from the Projects table cells. The $ prefix is decorative; the
// number persists as a plain numeric, blank parses to null.
function NumericCell({ value, onCommit, noPrefix }: { value: number | null | undefined; onCommit: (n: number | null) => void; noPrefix?: boolean }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<string>(value != null ? String(value) : '');
    useEffect(() => { if (!editing) setDraft(value != null ? String(value) : ''); }, [value, editing]);

    const fmtDisplay = (n: number) => n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + n.toLocaleString();
    const display = value == null
        ? <span style={{ color: 'var(--ink-muted)' }}>—</span>
        : noPrefix
            ? <span style={{ color: 'var(--ink-muted)' }}>{value.toLocaleString()}</span>
            : <span style={{ fontWeight: 600 }}>{fmtDisplay(value)}</span>;

    const commit = () => {
        setEditing(false);
        const trimmed = draft.trim();
        if (!trimmed) {
            if (value != null) onCommit(null);
            return;
        }
        const parsed = Number(trimmed.replace(/[$,]/g, ''));
        if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
    };

    if (editing) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                {!noPrefix && <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>$</span>}
                <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commit(); }
                        else if (e.key === 'Escape') { setEditing(false); setDraft(value != null ? String(value) : ''); }
                    }}
                    style={{
                        background: 'var(--canvas)', border: '1px solid var(--accent)',
                        borderRadius: 6, padding: '3px 6px', fontSize: 12,
                        color: 'var(--ink)', width: 90, fontFamily: 'inherit',
                    }}
                />
            </span>
        );
    }
    return (
        <span
            tabIndex={0}
            role="button"
            onClick={() => setEditing(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); } }}
            style={{
                display: 'inline-block', minWidth: 50, padding: '3px 6px',
                borderRadius: 6, cursor: 'pointer',
                border: '1px solid transparent',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--hairline-soft)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
        >
            {display}
        </span>
    );
}
