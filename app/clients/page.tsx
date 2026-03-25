'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Topbar from '../components/Topbar';
import { useUI } from '../context/UIContext';
import AddProjectModal from '../components/AddProjectModal';
import { getClientsAction, getClientProjectsAction, updateClientAction } from '../../src/actions/clientActions';
import { getManagersAction } from '../../src/actions/projectActions';
import { EmailRow, EmailDetail } from '../components/InboxComponents';
import InlineReply from '../components/InlineReply';
import AddLeadModal from '../components/AddLeadModal';
import { useGlobalFilter } from '../context/FilterContext';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';
import { avatarColor, initials, cleanPreview } from '../utils/helpers';
import { STAGE_COLORS, STAGE_LABELS } from '../constants/stages';
import { saveToLocalCache, getFromLocalCache } from '../utils/localCache';
import { markClientEmailsAsReadAction } from '../../src/actions/emailActions';
import { useMailbox } from '../hooks/useMailbox';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for module-level caches
const CACHE_MAX_SIZE = 100; // Max entries before clearing

let globalClientsCache: any[] | null = null;
let globalManagersCache: any[] | null = null;
let globalClientsCacheTimestamp = 0;
let globalClientDetailsCache: Record<string, { emails: any[]; projects: any[]; timestamp: number }> = {};

if (typeof window !== 'undefined') {
    const savedClients = getFromLocalCache('clients_data');
    if (savedClients) {
        globalClientsCache = savedClients.clients;
        globalManagersCache = savedClients.managers;
        globalClientsCacheTimestamp = 0; // Treat restored cache as stale
    }
}

function isClientsCacheValid(): boolean {
    if (!globalClientsCache) return false;
    if (Date.now() - globalClientsCacheTimestamp > CACHE_TTL_MS) return false;
    if (globalClientsCache.length > CACHE_MAX_SIZE) {
        globalClientsCache = null;
        globalClientsCacheTimestamp = 0;
        return false;
    }
    // Also prune details cache if it grows too large
    const detailKeys = Object.keys(globalClientDetailsCache);
    if (detailKeys.length > CACHE_MAX_SIZE) {
        globalClientDetailsCache = {};
    }
    return true;
}

export default function ClientsPage() {
    const isHydrated = useHydrated();
    const { selectedAccountId, setSelectedAccountId, accounts } = useGlobalFilter();
    const [clients, setClients] = useState<any[]>(() => globalClientsCache || []);
    const [managers, setManagers] = useState<{ id: string, name: string }[]>(() => globalManagersCache || []);
    const [selectedClient, setSelectedClient] = useState<any>(null);
    const [clientProjects, setClientProjects] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'emails' | 'projects'>('emails');
    const [isLoading, setIsLoading] = useState(() => !globalClientsCache);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const { setComposeOpen, setComposeDefaultTo } = useUI();
    const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
    const [projectDefaultName, setProjectDefaultName] = useState('');
    const [isReplyingInline, setIsReplyingInline] = useState(false);
    const [isAddClientOpen, setIsAddClientOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'grid' | 'board'>('list');
    const [filterType, setFilterType] = useState<'ALL' | 'LEADS' | 'CLIENTS'>('ALL');

    // ── Inline Editing State ─────────────────────────────────────────────────
    const [editingCell, setEditingCell] = useState<{ clientId: string; field: string } | null>(null);
    const [editValue, setEditValue] = useState('');
    const editInputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

    const startEditing = (clientId: string, field: string, currentValue: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Don't trigger row click (detail view)
        setEditingCell({ clientId, field });
        setEditValue(currentValue || '');
    };

    useEffect(() => {
        if (editingCell && editInputRef.current) {
            editInputRef.current.focus();
            if (editInputRef.current instanceof HTMLInputElement) {
                editInputRef.current.select();
            }
        }
    }, [editingCell]);

    const saveEdit = async () => {
        if (!editingCell) return;
        const { clientId, field } = editingCell;
        const client = clients.find((c: any) => c.id === clientId);
        if (!client) { setEditingCell(null); return; }

        // Check if value actually changed
        const oldValue = String(client[field] || '');
        if (editValue === oldValue) { setEditingCell(null); return; }

        const updates: any = {};
        if (field === 'estimated_value') {
            updates[field] = editValue ? parseFloat(editValue) : null;
        } else if (field === 'expected_close_date') {
            updates[field] = editValue || null;
        } else {
            updates[field] = editValue || null;
        }

        // Optimistic update
        setClients(prev => prev.map(c => c.id === clientId ? { ...c, ...updates, ...(field === 'account_manager_id' ? { manager_name: managers.find(m => m.id === editValue)?.name || 'Unassigned' } : {}) } : c));
        setEditingCell(null);

        // Save to server
        const res = await updateClientAction(clientId, updates);
        if (!res.success) {
            // Revert on failure
            setClients(prev => prev.map(c => c.id === clientId ? { ...c, [field]: client[field] } : c));
        }
    };

    const cancelEdit = () => setEditingCell(null);

    const handleEditKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
        if (e.key === 'Escape') cancelEdit();
        if (e.key === 'Tab') { e.preventDefault(); saveEdit(); }
    };

    // ── Use Universal Mailbox Hook ───────────────────────────────────────────
    const {
        emails: clientEmails,
        selectedEmail,
        threadMessages,
        isThreadLoading,
        selectedEmailIds,
        handleSelectEmail,
        handleToggleRead,
        handleDelete: handleDeleteEmail,
        toggleSelectEmail,
        toggleSelectAll,
        handleBulkMarkAsRead: handleBulkMarkRead,
        handleBulkDelete,
        setSelectedEmail,
        loadEmails,
        prefetchThread
    } = useMailbox({
        type: 'client',
        clientEmail: selectedClient?.email,
        selectedAccountId,
        enabled: !!selectedClient,
        accounts
    });

    const loadClients = useCallback(async () => {
        if (!isClientsCacheValid()) setIsLoading(true);
        try {
            const [data, mData] = await Promise.all([
                getClientsAction(selectedAccountId),
                getManagersAction()
            ]);

            globalClientsCache = data;
            globalManagersCache = mData;
            globalClientsCacheTimestamp = Date.now();
            saveToLocalCache('clients_data', { clients: data, managers: mData });

            setClients(data);
            setManagers(mData);
        } catch (err) {
            console.error('Failed to load clients:', err);
        } finally {
            setIsLoading(false);
        }
    }, [selectedAccountId]);

    useEffect(() => { loadClients(); }, [loadClients]);

    // Reset to list view when sidebar nav is clicked on same page
    useEffect(() => {
        const handleNavReset = () => {
            setSelectedClient(null);
            setSelectedEmail(null);
            setFilterType('ALL');
            setViewMode('list');
        };
        window.addEventListener('nav-reset', handleNavReset);
        return () => window.removeEventListener('nav-reset', handleNavReset);
    }, []);

    const handleSelectClient = async (client: any) => {
        setSelectedClient(client);
        setSelectedEmail(null); // Reset email view

        const cached = globalClientDetailsCache[client.id];
        const isCachedValid = cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS;
        if (isCachedValid) {
            setClientProjects(cached.projects);
            setIsDetailLoading(false);
        } else {
            setClientProjects([]);
            setIsDetailLoading(true);
        }

        setActiveTab('emails');

        if (client.unread_count > 0) {
            setClients(prev => prev.map(c => c.id === client.id ? { ...c, unread_count: 0 } : c));
            markClientEmailsAsReadAction(client.email).catch(console.error);
        }

        try {
            const projects = await getClientProjectsAction(client.id);
            setClientProjects(projects);
            // Emails are automatically loaded by useMailbox hook due to clientEmail dependency
        } catch (err) {
            console.error('Failed to load client details:', err);
        } finally {
            setIsDetailLoading(false);
        }
    };

    const handleUpdateClient = async (updates: any) => {
        if (!selectedClient) return;
        const res = await updateClientAction(selectedClient.id, updates);
        if (res.success && res.client) {
            const clientData: any = res.client;
            const updated = { ...selectedClient, ...clientData, manager_name: clientData.account_manager?.name || 'Unassigned' };
            setClients(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
            setSelectedClient(updated);
        }
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        if (isToday) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const filteredClients = useMemo(() => {
        let result = clients.filter((c: any) => {
            const sl = searchTerm.toLowerCase().trim();
            return !sl ||
                (c.name && c.name.toLowerCase().includes(sl)) ||
                (c.email && c.email.toLowerCase().includes(sl)) ||
                (c.company && c.company.toLowerCase().includes(sl));
        });

        return result;
    }, [clients, searchTerm]);

    const STAGE_ORDER = ['COLD_LEAD', 'LEAD', 'OFFER_ACCEPTED', 'CLOSED', 'NOT_INTERESTED'];

    const groupedByStatus = useMemo(() => {
        if (filterType !== 'LEADS') return [];
        const groups: { stage: string; label: string; color: string; clients: any[] }[] = [];
        for (const stage of STAGE_ORDER) {
            const items = filteredClients.filter((c: any) => (c.pipeline_stage || 'COLD_LEAD') === stage);
            if (items.length > 0) {
                groups.push({
                    stage,
                    label: STAGE_LABELS[stage] || stage,
                    color: STAGE_COLORS[stage] || 'badge-gray',
                    clients: items,
                });
            }
        }
        // Catch any with unknown stages
        const knownStages = new Set(STAGE_ORDER);
        const unknown = filteredClients.filter((c: any) => c.pipeline_stage && !knownStages.has(c.pipeline_stage));
        if (unknown.length > 0) {
            groups.push({ stage: 'OTHER', label: 'Other', color: 'badge-gray', clients: unknown });
        }
        return groups;
    }, [filteredClients, filterType]);

    const priorityColors: Record<string, string> = {
        HIGH: 'badge-red', MEDIUM: 'badge-yellow', LOW: 'badge-green', URGENT: 'badge-red',
    };

    const totalEstimatedValue = useMemo(() => {
        return filteredClients.reduce((sum: number, c: any) => sum + (c.estimated_value || 0), 0);
    }, [filteredClients]);

    const formatCurrency = (val: number | null | undefined) => {
        if (!val) return '';
        return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatShortDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const isEditing = (clientId: string, field: string) => editingCell?.clientId === clientId && editingCell?.field === field;

    const renderEditableText = (client: any, field: string, display: string, placeholder?: string) => {
        if (isEditing(client.id, field)) {
            return (
                <input
                    ref={editInputRef as React.RefObject<HTMLInputElement>}
                    className="ncell-input"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={handleEditKeyDown}
                    placeholder={placeholder}
                    onClick={e => e.stopPropagation()}
                />
            );
        }
        return (
            <span className={`cell-text cell-editable ${!display ? 'cell-placeholder' : ''}`} onClick={e => startEditing(client.id, field, client[field] || '', e)}>
                {display || placeholder || '\u2014'}
            </span>
        );
    };

    const renderEditableSelect = (client: any, field: string, options: { value: string; label: string }[], display: React.ReactNode) => {
        if (isEditing(client.id, field)) {
            return (
                <select
                    ref={editInputRef as React.RefObject<HTMLSelectElement>}
                    className="ncell-select"
                    value={editValue}
                    onChange={e => { setEditValue(e.target.value); setTimeout(saveEdit, 0); }}
                    onBlur={saveEdit}
                    onKeyDown={handleEditKeyDown}
                    onClick={e => e.stopPropagation()}
                >
                    <option value="">None</option>
                    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            );
        }
        return (
            <span className="cell-editable" onClick={e => startEditing(client.id, field, client[field] || '', e)}>
                {display}
            </span>
        );
    };

    const renderClientRow = (client: any) => (
        <div
            key={client.id}
            className={`notion-row ${client.unread_count > 0 ? 'unread' : ''}`}
            onClick={() => handleSelectClient(client)}
        >
            <div className="notion-cell ncell-date">
                <span className="cell-text">{formatShortDate(client.created_at)}</span>
            </div>
            <div className="notion-cell ncell-name">
                <div className="avatar avatar-sm" style={{ background: avatarColor(client.email || client.name || 'x') }}>
                    {initials(client.name || client.email || '?')}
                </div>
                {renderEditableText(client, 'name', client.name || client.email, 'Name')}
            </div>
            <div className="notion-cell ncell-company">
                {renderEditableText(client, 'company', client.company, 'Company')}
            </div>
            <div className="notion-cell ncell-status">
                {renderEditableSelect(client, 'pipeline_stage',
                    [{ value: 'COLD_LEAD', label: 'Cold' }, { value: 'LEAD', label: 'Lead' }, { value: 'OFFER_ACCEPTED', label: 'Offer Accepted' }, { value: 'CLOSED', label: 'Closed' }, { value: 'NOT_INTERESTED', label: 'Not Interested' }],
                    client.pipeline_stage ? (
                        <span className={`notion-badge ${STAGE_COLORS[client.pipeline_stage] || 'badge-gray'}`}>
                            {STAGE_LABELS[client.pipeline_stage] || client.pipeline_stage}
                        </span>
                    ) : <span className="cell-placeholder">{'\u2014'}</span>
                )}
            </div>
            <div className="notion-cell ncell-priority">
                {renderEditableSelect(client, 'priority',
                    [{ value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HIGH', label: 'High' }, { value: 'URGENT', label: 'Urgent' }],
                    client.priority ? (
                        <span className={`notion-badge ${priorityColors[client.priority] || 'badge-gray'}`}>
                            {client.priority}
                        </span>
                    ) : <span className="cell-placeholder">{'\u2014'}</span>
                )}
            </div>
            <div className="notion-cell ncell-value">
                {isEditing(client.id, 'estimated_value') ? (
                    <input
                        ref={editInputRef as React.RefObject<HTMLInputElement>}
                        className="ncell-input"
                        type="number"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={handleEditKeyDown}
                        placeholder="0.00"
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <span className={`cell-text cell-editable ${!client.estimated_value ? 'cell-placeholder' : ''}`} onClick={e => startEditing(client.id, 'estimated_value', client.estimated_value ? String(client.estimated_value) : '', e)}>
                        {formatCurrency(client.estimated_value) || '\u2014'}
                    </span>
                )}
            </div>
            <div className="notion-cell ncell-manager">
                {isEditing(client.id, 'account_manager_id') ? (
                    <select
                        ref={editInputRef as React.RefObject<HTMLSelectElement>}
                        className="ncell-select"
                        value={editValue}
                        onChange={e => { setEditValue(e.target.value); setTimeout(saveEdit, 0); }}
                        onBlur={saveEdit}
                        onKeyDown={handleEditKeyDown}
                        onClick={e => e.stopPropagation()}
                    >
                        <option value="">Unassigned</option>
                        {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                ) : (
                    <div className="manager-chip cell-editable" onClick={e => startEditing(client.id, 'account_manager_id', client.account_manager_id || '', e)}>
                        <div className="avatar avatar-xs" style={{ background: avatarColor(client.manager_name || 'U') }}>
                            {initials(client.manager_name || 'U')}
                        </div>
                        <span>{client.manager_name || 'Unassigned'}</span>
                    </div>
                )}
            </div>
            <div className="notion-cell ncell-email">
                {renderEditableText(client, 'email', client.email, 'Email')}
            </div>
            <div className="notion-cell ncell-phone">
                {renderEditableText(client, 'phone', client.phone, 'Phone')}
            </div>
            <div className="notion-cell ncell-close">
                {isEditing(client.id, 'expected_close_date') ? (
                    <input
                        ref={editInputRef as React.RefObject<HTMLInputElement>}
                        className="ncell-input"
                        type="date"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={handleEditKeyDown}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <span className={`cell-text cell-editable ${!client.expected_close_date ? 'cell-placeholder' : ''}`} onClick={e => startEditing(client.id, 'expected_close_date', client.expected_close_date ? new Date(client.expected_close_date).toISOString().split('T')[0] || '' : '', e)}>
                        {formatShortDate(client.expected_close_date) || '\u2014'}
                    </span>
                )}
            </div>
            <div className="notion-cell ncell-gmail">
                <span className="cell-text cell-email-text">
                    {client.account_email && client.account_email !== 'No Recent Mail' ? client.account_email : ''}
                </span>
            </div>
        </div>
    );

    return (
        <div className="mailbox-wrapper">

            <div className="mailbox-main">
                <Topbar
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    placeholder="Search by name, email or company..."
                    onSearch={() => { }}
                    onClearSearch={() => setSearchTerm('')}
                    leftContent={
                        <h1 className="clients-page-title">Clients</h1>
                    }
                    rightContent={
                        <div className="topbar-actions">
                            <button className="btn btn-primary sm" onClick={() => setIsAddClientOpen(true)} aria-label="Add new client">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M12 5v14M5 12h14" /></svg>
                                New Client
                            </button>
                            <div className="avatar-btn" title="Admin">A</div>
                        </div>
                    }
                />

                {/* Notion-style Filter Tabs */}
                <div className="notion-toolbar">
                    <div className="notion-tabs" role="tablist" aria-label="Client view tabs">
                        <button
                            className={`notion-tab ${filterType === 'ALL' ? 'active' : ''}`}
                            onClick={() => { setFilterType('ALL'); setSelectedClient(null); setSelectedEmail(null); }}
                            role="tab"
                            aria-selected={filterType === 'ALL'}
                        >
                            All Records
                        </button>
                        <button
                            className={`notion-tab ${filterType === 'LEADS' ? 'active' : ''}`}
                            onClick={() => { setFilterType('LEADS'); setSelectedClient(null); setSelectedEmail(null); }}
                            role="tab"
                            aria-selected={filterType === 'LEADS'}
                        >
                            By Status
                        </button>
                        <button
                            className={`notion-tab ${viewMode === 'board' ? 'active' : ''}`}
                            onClick={() => { setFilterType('ALL'); setViewMode(viewMode === 'board' ? 'list' : 'board'); setSelectedClient(null); setSelectedEmail(null); }}
                            role="tab"
                            aria-selected={viewMode === 'board'}
                        >
                            Board View
                        </button>
                    </div>
                    <div className="notion-toolbar-right">
                        <button className="notion-icon-btn" onClick={loadClients} title="Refresh" aria-label="Refresh clients">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
                        </button>
                        <button className="notion-icon-btn" title="Search" aria-label="Search">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                        </button>
                    </div>
                </div>

                <div className="content-split content-split-bg">
                    {/* Client List — Notion Table */}
                    {!selectedClient ? (
                        <div className="list-panel list-panel-flex">
                            <PageLoader isLoading={!isHydrated || isLoading} type="list" count={12}>
                                {filteredClients.length === 0 ? (
                                    <div className="empty-state">
                                        <div className="empty-state-icon">
                                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
                                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                                            </svg>
                                        </div>
                                        <div className="empty-state-title">No contacts found</div>
                                        <div className="empty-state-desc">Try a different search term or adjust your filters to find contacts.</div>
                                    </div>
                                ) : viewMode === 'board' ? (
                                    <div className="board-view">
                                        {(['COLD_LEAD', 'LEAD', 'OFFER_ACCEPTED', 'WON', 'CLOSED'] as const).map(stage => (
                                            <div key={stage} className="board-column">
                                                <div className="column-header">
                                                    <div className="column-title">
                                                         {STAGE_LABELS[stage] || stage.replace('_', ' ')}
                                                        <span className="column-count">
                                                            {filteredClients.filter((c: any) => (c.pipeline_stage === stage) || (stage === 'WON' && !c.pipeline_stage && c.project_count > 0)).length}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="column-content">
                                                    {filteredClients.filter((c: any) => (c.pipeline_stage === stage) || (stage === 'WON' && !c.pipeline_stage && c.project_count > 0)).map((client: any) => (
                                                        <div
                                                            key={client.id}
                                                            className="board-card"
                                                            onClick={() => handleSelectClient(client)}
                                                        >
                                                            <div className="board-card-header">
                                                                <div className="avatar avatar-board" style={{ background: avatarColor(client.email || client.name || 'x') }}>
                                                                    {initials(client.name || client.email || '?')}
                                                                </div>
                                                                <div className="board-card-info">
                                                                    <div className="board-card-name">{client.name}</div>
                                                                    <div className="board-card-email">{client.email}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="notion-table-wrapper">
                                        <div className="notion-table">
                                            {/* Table Header */}
                                            <div className="notion-header">
                                                <div className="notion-cell ncell-date">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                                                    Date
                                                </div>
                                                <div className="notion-cell ncell-name">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                                    Name
                                                </div>
                                                <div className="notion-cell ncell-company">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                                                    Company
                                                </div>
                                                <div className="notion-cell ncell-status">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>
                                                    Status
                                                </div>
                                                <div className="notion-cell ncell-priority">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                                                    Priority
                                                </div>
                                                <div className="notion-cell ncell-value">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
                                                    Estimated Value
                                                </div>
                                                <div className="notion-cell ncell-manager">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                                                    Account Manager
                                                </div>
                                                <div className="notion-cell ncell-email">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                                                    Email
                                                </div>
                                                <div className="notion-cell ncell-phone">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
                                                    Phone
                                                </div>
                                                <div className="notion-cell ncell-close">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                                                    Expected Close
                                                </div>
                                                <div className="notion-cell ncell-gmail">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                                                    Gmail Account
                                                </div>
                                            </div>

                                            {/* Table Rows */}
                                            <div className="notion-body">
                                                {filterType === 'LEADS' ? (
                                                    /* Grouped by Status */
                                                    groupedByStatus.map(group => (
                                                        <div key={group.stage} className="notion-group">
                                                            <div className="notion-group-header">
                                                                <span className={`notion-badge ${group.color}`}>{group.label}</span>
                                                                <span className="notion-group-count">{group.clients.length}</span>
                                                            </div>
                                                            {group.clients.map((client: any) => renderClientRow(client))}
                                                        </div>
                                                    ))
                                                ) : (
                                                    /* Flat list */
                                                    filteredClients.map((client: any) => renderClientRow(client))
                                                )}
                                            </div>

                                            {/* Table Footer — SUM */}
                                            {totalEstimatedValue > 0 && (
                                                <div className="notion-footer">
                                                    <span className="notion-sum">SUM {formatCurrency(totalEstimatedValue)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </PageLoader>
                        </div>
                    ) : (

                        /* Client Detail */
                        <div className="detail-panel">
                            {/* Detail Header */}
                            <div className="detail-header detail-header-styled">
                                <div className="detail-actions detail-actions-layout">
                                    <div className="detail-actions-left detail-actions-left-flex">
                                        <button className="icon-btn sm" onClick={() => setSelectedClient(null)} title="Back" aria-label="Back to client list" style={{ width: 32, height: 32, borderRadius: '8px' }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M19 12H5M12 19l-7-7 7-7" />
                                            </svg>
                                        </button>
                                        <div className="divider-v" style={{ height: 20 }} />
                                        <span className="detail-section-label">Client Profile</span>
                                    </div>
                                    <div className="detail-actions-buttons">
                                        <button
                                            className="btn btn-secondary sm"
                                            onClick={() => { setProjectDefaultName(''); setIsAddProjectOpen(true); }}
                                            aria-label="Add project"
                                            style={{ height: 34, padding: '0 1rem', borderRadius: '8px' }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M12 5v14M5 12h14" /></svg>
                                            Project
                                        </button>
                                        <button
                                            className="btn btn-primary sm"
                                            onClick={() => { setComposeDefaultTo(selectedClient.email); setComposeOpen(true); }}
                                            aria-label="Send message"
                                            style={{ height: 34, padding: '0 1rem', borderRadius: '8px' }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                            Message
                                        </button>
                                    </div>
                                </div>

                                <div className="detail-client-hero hero-layout">
                                    <div className="avatar-hero" style={{
                                        background: avatarColor(selectedClient.email || selectedClient.name || 'x'),
                                    }} title={selectedClient.name || selectedClient.email}>
                                        {initials(selectedClient.name || selectedClient.email || '?')}
                                    </div>
                                    <div className="hero-info">
                                        <div className="hero-name-row">
                                            <h1 className="hero-name">
                                                {selectedClient.name || selectedClient.email}
                                            </h1>
                                            <div className="hero-badges">
                                                <span className={`badge ${selectedClient.status === 'ACTIVE' ? 'badge-green' : 'badge-gray'}`}>
                                                    {selectedClient.pipeline_stage || 'CLIENT'}
                                                </span>
                                                {selectedClient.project_count > 0 && (
                                                    <span className="badge badge-purple">{selectedClient.project_count} PROJECTS</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="hero-meta-row">
                                            <div className="hero-meta-item">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                                                {selectedClient.email}
                                            </div>
                                            <div className="divider-v" style={{ height: 12, background: 'var(--border-subtle)' }} />
                                            <div className="hero-meta-item">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                                <select
                                                    className="manager-select-modern"
                                                    aria-label="Assign account manager"
                                                    value={selectedClient.account_manager_id || ''}
                                                    onChange={(e) => handleUpdateClient({ account_manager_id: e.target.value || null })}
                                                >
                                                    <option value="">Unassigned</option>
                                                    {managers.map(m => (
                                                        <option key={m.id} value={m.id}>{m.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            {selectedClient.account_email && selectedClient.account_email !== 'No Recent Mail' && (
                                                <>
                                                    <div className="divider-v" style={{ height: 12, background: 'var(--border-subtle)' }} />
                                                    <div className="hero-meta-item text-muted">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 000 20 14.5 14.5 0 000-20z" /><path d="M2 12h20" /></svg>
                                                        {selectedClient.account_email}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tabs Bar */}
                            <div className="tabs-bar" role="tablist" aria-label="Client detail tabs">
                                <div
                                    className={`tab ${activeTab === 'emails' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('emails')}
                                    role="tab"
                                    aria-selected={activeTab === 'emails'}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                                    <span>Emails</span>
                                    {isHydrated && clientEmails.length > 0 && <span className="tab-count">{clientEmails.length}</span>}
                                </div>
                                <div
                                    className={`tab ${activeTab === 'projects' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('projects')}
                                    role="tab"
                                    aria-selected={activeTab === 'projects'}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 3h18v18H3zM9 3v18m6-18v18" /></svg>
                                    <span>Projects</span>
                                    {isHydrated && clientProjects.length > 0 && <span className="tab-count">{clientProjects.length}</span>}
                                </div>
                            </div>

                            {/* Tab Content */}
                            <div className="tab-content-area">
                                {isDetailLoading ? (
                                    <div className="empty-state loading-state">
                                        <div className="spinner spinner-lg" />
                                        <span className="loading-text">Loading details...</span>
                                    </div>
                                ) : activeTab === 'emails' ? (
                                    <div className="inner-split inner-split-flex">
                                        {!selectedEmail ? (
                                            <div className="inner-list-panel inner-list-full">
                                                <div className="list-toolbar">
                                                    <div className="list-toolbar-left">
                                                        <label className="check-container">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedEmailIds.size > 0 && selectedEmailIds.size === clientEmails.length}
                                                                onChange={toggleSelectAll}
                                                            />
                                                            <span className="checkmark" />
                                                        </label>
                                                        {selectedEmailIds.size > 0 && (
                                                            <button className="icon-btn sm danger" title="Delete selected" aria-label="Delete selected emails" onClick={handleBulkDelete}>
                                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                                            </button>
                                                        )}
                                                        <div className="divider-v" />
                                                        <button className="icon-btn sm" title="Mark Read" aria-label="Mark as read" onClick={handleBulkMarkRead} disabled={selectedEmailIds.size === 0}>
                                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                                <circle cx="12" cy="12" r="3" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                    <div className="list-toolbar-right">
                                                        {clientEmails.length > 0 && (
                                                            <span className="count-label">
                                                                1&ndash;{clientEmails.length} of {clientEmails.length}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div id="client-email-list-scroll" className="email-list-scroll">
                                                    <div className="gmail-list-header">
                                                        <div className="gmail-lh-check" />
                                                        <div className="gmail-lh-star" />
                                                        <div className="gmail-lh-sender">Sender</div>
                                                        <div className="gmail-lh-body">Subject / Preview</div>
                                                        <div className="gmail-lh-account">Gmail Account</div>
                                                        <div className="gmail-lh-manager">Manager</div>
                                                        <div className="gmail-lh-date">Date</div>
                                                    </div>
                                                    {clientEmails.length === 0 ? (
                                                        <div className="empty-state loading-state">
                                                            <div className="empty-state-icon">
                                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                            </div>
                                                            <div className="empty-state-title">No emails</div>
                                                            <div className="empty-state-desc">No email history with this client yet.</div>
                                                        </div>
                                                    ) : (
                                                        clientEmails.map((email: any) => (
                                                            <EmailRow
                                                                key={email.id}
                                                                email={email}
                                                                isSelected={false}
                                                                isRowChecked={selectedEmailIds.has(email.id)}
                                                                showBadge={true}
                                                                 onClick={() => handleSelectEmail(email)}
                                                                 onToggleSelect={toggleSelectEmail}
                                                                 onPrefetch={() => prefetchThread(email.thread_id)}
                                                             />
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="inner-detail-panel inner-detail-flex">
                                                <EmailDetail
                                                    email={selectedEmail}
                                                    threadMessages={threadMessages}
                                                    isThreadLoading={isThreadLoading}
                                                    isReplyingInline={isReplyingInline}
                                                    onBack={() => setSelectedEmail(null)}
                                                    onStageChange={() => { }}
                                                    onReply={() => setIsReplyingInline(true)}
                                                    onForward={() => setComposeOpen(true)}
                                                    totalCount={clientEmails.length}
                                                    replySlot={
                                                        <InlineReply
                                                            threadId={selectedEmail.thread_id}
                                                            to={selectedEmail.from_email?.match(/<([^>]+)>/)?.[1] || selectedEmail.from_email}
                                                            subject={selectedEmail.subject}
                                                            accountId={selectedEmail.gmail_account_id}
                                                            onSuccess={() => setIsReplyingInline(false)}
                                                            onCancel={() => setIsReplyingInline(false)}
                                                        />
                                                    }
                                                />
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="inner-projects inner-projects-styled">
                                        {clientProjects.length === 0 ? (
                                            <div className="empty-state empty-state-padded">
                                                <div className="empty-state-icon empty-state-icon-large">
                                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><path d="M3 3h18v18H3zM9 3v18m6-18v18" /></svg>
                                                </div>
                                                <div className="empty-state-title" style={{ marginTop: '1.5rem' }}>No projects found</div>
                                                <div className="empty-state-desc">
                                                    Start by creating a new project for this client to track progress.
                                                    <div style={{ marginTop: '1.25rem' }}>
                                                        <button className="btn btn-primary btn-sm" onClick={() => setIsAddProjectOpen(true)}>
                                                            Create First Project
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="projects-grid">
                                                {clientProjects.map((project: any) => (
                                                    <div
                                                        key={project.id}
                                                        className="project-card-premium"
                                                        onClick={() => window.location.href = `/projects?project_id=${project.id}`}
                                                    >
                                                        <div className="project-card-top">
                                                            <h3 className="project-card-title" title={project.project_name}>
                                                                {project.project_name}
                                                            </h3>
                                                            <span className={`badge ${priorityColors[project.priority] || 'badge-yellow'}`}>
                                                                {project.priority || 'MEDIUM'}
                                                            </span>
                                                        </div>

                                                        <div className="project-card-meta">
                                                            <div className="project-meta-item">
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                                                Manager: <span className="meta-value">{selectedClient?.manager_name || 'Unassigned'}</span>
                                                            </div>
                                                            <div className="project-meta-item">
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                                                                Account: <span className="meta-value">{selectedClient?.account_email || 'No Account'}</span>
                                                            </div>
                                                            <div className="project-meta-item">
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                                                                Due Date: <span className="meta-value">{formatDate(project.due_date)}</span>
                                                            </div>
                                                        </div>

                                                        <div className="project-card-bottom">
                                                            <span className={`badge ${project.paid_status === 'PAID' ? 'badge-green' : project.paid_status === 'PARTIALLY_PAID' ? 'badge-yellow' : 'badge-red'}`}>
                                                                {project.paid_status?.replace('_', ' ') || 'UNPAID'}
                                                            </span>
                                                            <div className="project-card-link">
                                                                <span className="link-text">Details</span>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6" /></svg>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isAddClientOpen && (
                <AddLeadModal
                    onClose={() => setIsAddClientOpen(false)}
                    onAddLead={() => {
                        setIsAddClientOpen(false);
                        loadClients();
                    }}
                />
            )}



            {isAddProjectOpen && selectedClient && (
                <AddProjectModal
                    client={selectedClient}
                    initialProjectName={projectDefaultName}
                    onClose={() => setIsAddProjectOpen(false)}
                    onCreated={() => {
                        setIsAddProjectOpen(false);
                        // Refresh projects after creation
                        getClientProjectsAction(selectedClient.id).then(setClientProjects).catch(console.error);
                    }}
                />
            )}

        </div>
    );
}
