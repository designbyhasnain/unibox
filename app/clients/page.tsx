'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
                (c.email && c.email.toLowerCase().includes(sl));
        });

        if (filterType === 'LEADS') {
            result = result.filter((c: any) => c.pipeline_stage && c.pipeline_stage !== 'CLOSED');
        } else if (filterType === 'CLIENTS') {
            result = result.filter((c: any) => c.project_count > 0 || c.pipeline_stage === 'WON');
        }

        return result;
    }, [clients, searchTerm, filterType]);

    const priorityColors: Record<string, string> = {
        HIGH: 'badge-red', MEDIUM: 'badge-yellow', LOW: 'badge-green',
    };

    const statusColors: Record<string, string> = {
        ACTIVE: 'badge-green', COMPLETED: 'badge-blue', ON_HOLD: 'badge-yellow', CANCELLED: 'badge-red',
    };

    return (
        <div className="mailbox-wrapper">

            <div className="mailbox-main">
                <Topbar
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    placeholder="Search by name, email or manager..."
                    onSearch={() => { }}
                    onClearSearch={() => setSearchTerm('')}
                    leftContent={
                        <h1 className="page-title">Clients</h1>
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

                {/* Filter Tabs & Toolbar */}
                <div className="filter-toolbar-wrapper">
                    <div className="tabs-bar tabs-bar-inner" role="tablist" aria-label="Client filter tabs">
                        <div
                            className={`tab ${filterType === 'ALL' ? 'active' : ''}`}
                            onClick={() => setFilterType('ALL')}
                            role="tab"
                            aria-selected={filterType === 'ALL'}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                            All Contacts
                            <span className="tab-count-inline">{clients.length}</span>
                        </div>
                        <div
                            className={`tab ${filterType === 'LEADS' ? 'active' : ''}`}
                            onClick={() => setFilterType('LEADS')}
                            role="tab"
                            aria-selected={filterType === 'LEADS'}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                            Leads
                        </div>
                        <div
                            className={`tab ${filterType === 'CLIENTS' ? 'active' : ''}`}
                            onClick={() => setFilterType('CLIENTS')}
                            role="tab"
                            aria-selected={filterType === 'CLIENTS'}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                            Active Clients
                        </div>
                    </div>

                    <div className="list-toolbar toolbar-sub">
                        <div className="list-toolbar-left toolbar-left-flex">
                            <span className="count-label toolbar-count">
                                Showing {filteredClients.length} results
                            </span>
                        </div>
                        <div className="list-toolbar-right toolbar-right-flex">
                            <div className="view-mode-switcher">
                                <button
                                    className={`icon-btn sm ${viewMode === 'list' ? 'active' : ''}`}
                                    onClick={() => setViewMode('list')}
                                    title="List View"
                                    aria-label="List view"
                                    style={{ width: 32, height: 32 }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
                                </button>
                                <button
                                    className={`icon-btn sm ${viewMode === 'grid' ? 'active' : ''}`}
                                    onClick={() => setViewMode('grid')}
                                    title="Grid View"
                                    aria-label="Grid view"
                                    style={{ width: 32, height: 32 }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                                </button>
                                <button
                                    className={`icon-btn sm ${viewMode === 'board' ? 'active' : ''}`}
                                    onClick={() => setViewMode('board')}
                                    title="Board View"
                                    aria-label="Board view"
                                    style={{ width: 32, height: 32 }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 3h18v18H3zM9 3v18m6-18v18" /></svg>
                                </button>
                            </div>
                            <div className="divider-v" />
                            <button className="icon-btn sm" onClick={loadClients} title="Refresh" aria-label="Refresh clients">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="content-split content-split-bg">
                    {/* Client List */}
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
                                ) : viewMode === 'list' ? (
                                    <div className="list-view-container">
                                        <div className="universal-grid grid-table grid-header list-grid-header">
                                            <div className="grid-col col-client">Client / Contact</div>
                                            <div className="grid-col col-account">Latest Gmail Account</div>
                                            <div className="grid-col col-manager">Account Manager</div>
                                            <div className="grid-col col-metrics right">Projects & Activity</div>
                                        </div>
                                        <div className="list-scroll-area">
                                            {filteredClients.map((client: any) => (
                                                <div
                                                    key={client.id}
                                                    className={`universal-grid grid-table grid-row ${selectedClient?.id === client.id ? 'selected' : ''} ${client.unread_count > 0 ? 'unread' : ''}`}
                                                    onClick={() => handleSelectClient(client)}
                                                >
                                                    <div className="grid-col col-client">
                                                        <div className="avatar avatar-list" style={{ background: avatarColor(client.email || client.name || 'x') }} title={client.name || client.email}>
                                                            {initials(client.name || client.email || '?')}
                                                        </div>
                                                        <div className="sender-info">
                                                            <div className="sender-name" title={client.name || client.email}>{client.name || client.email}</div>
                                                            <div className="sender-email" title={client.email}>{client.email}</div>
                                                        </div>
                                                    </div>

                                                    <div className="grid-col col-account account-col-text">
                                                        {client.account_email && client.account_email !== 'No Recent Mail' ? (
                                                            <span className="text-secondary" title={client.account_email}>{client.account_email}</span>
                                                        ) : (
                                                            <span className="text-faded">&mdash;</span>
                                                        )}
                                                    </div>

                                                    <div className="grid-col col-manager">
                                                        <span className="badge badge-gray">
                                                            {client.manager_name || 'Unassigned'}
                                                        </span>
                                                    </div>

                                                    <div className="grid-col col-metrics right">
                                                        <div className="metrics-row">
                                                            {client.project_count > 0 && (
                                                                <div className="metric-item">
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 3h18v18H3zM9 3v18m6-18v18" /></svg>
                                                                    <span>{client.project_count}</span>
                                                                </div>
                                                            )}
                                                            {client.unread_count > 0 && (
                                                                <span className="nav-badge" style={{ margin: 0 }}>{client.unread_count}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : viewMode === 'grid' ? (
                                    <div className="grid-view-container">
                                        {filteredClients.map((client: any) => (
                                            <div
                                                key={client.id}
                                                className={`client-tile-card ${selectedClient?.id === client.id ? 'selected' : ''} ${client.unread_count > 0 ? 'unread' : ''}`}
                                                onClick={() => handleSelectClient(client)}
                                            >
                                                <div className="tile-header-row">
                                                    <div className="avatar avatar-grid" style={{ background: avatarColor(client.email || client.name || 'x') }} title={client.name || client.email}>
                                                        {initials(client.name || client.email || '?')}
                                                    </div>
                                                    <div className="tile-info">
                                                        <div className="tile-name" title={client.name}>{client.name}</div>
                                                        <div className="tile-email" title={client.email}>{client.email}</div>
                                                    </div>
                                                </div>
                                                <div className="tile-badges">
                                                    <span className="badge badge-gray">{client.manager_name}</span>
                                                    {client.account_email && client.account_email !== 'No Recent Mail' && (
                                                        <span className="badge badge-gray" title={client.account_email}>{client.account_email}</span>
                                                    )}
                                                     {client.pipeline_stage && (
                                                         <span className={`badge ${STAGE_COLORS[client.pipeline_stage] || 'badge-blue'}`}>
                                                             {STAGE_LABELS[client.pipeline_stage] || client.pipeline_stage}
                                                         </span>
                                                     )}
                                                    {client.project_count > 0 && (
                                                        <span className="badge badge-purple">{client.project_count} Projects</span>
                                                    )}
                                                </div>
                                                {client.unread_count > 0 && (
                                                    <div className="tile-unread-badge">
                                                        <span className="nav-badge">{client.unread_count}</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
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
                                                            className={`board-card ${selectedClient?.id === client.id ? 'selected' : ''} ${client.unread_count > 0 ? 'unread' : ''}`}
                                                            onClick={() => handleSelectClient(client)}
                                                        >
                                                            <div className="board-card-header">
                                                                <div className="avatar avatar-board" style={{ background: avatarColor(client.email || client.name || 'x') }} title={client.name || client.email}>
                                                                    {initials(client.name || client.email || '?')}
                                                                </div>
                                                                <div className="board-card-info">
                                                                    <div className="board-card-name" title={client.name}>{client.name}</div>
                                                                    <div className="board-card-email" title={client.email}>{client.email}</div>
                                                                    <div className="board-card-manager" title={`${client.manager_name}${client.account_email && client.account_email !== 'No Recent Mail' ? ` - ${client.account_email}` : ''}`}>
                                                                        {client.manager_name}
                                                                        {client.account_email && client.account_email !== 'No Recent Mail' && ` \u2022 ${client.account_email}`}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {client.project_count > 0 && (
                                                                <div className="board-card-footer">
                                                                    <span>Projects</span>
                                                                    <span className="board-card-count">{client.project_count}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
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

            <style jsx>{`
                .page-title {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin: 0;
                }
                .filter-toolbar-wrapper {
                    background: var(--bg-surface);
                    border-bottom: 1px solid var(--border);
                }
                .tabs-bar-inner {
                    padding: 0 1.5rem;
                    border-bottom: none;
                }
                .tab-count-inline {
                    font-size: 0.75rem;
                    opacity: 0.5;
                    margin-left: 2px;
                }
                .toolbar-sub {
                    border-top: 1px solid var(--border-subtle);
                    padding: 0.6rem 1.5rem;
                }
                .toolbar-left-flex {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                .toolbar-count {
                    font-size: 0.8125rem;
                    color: var(--text-muted);
                    font-weight: 500;
                }
                .toolbar-right-flex {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .view-mode-switcher {
                    display: flex;
                    background: var(--bg-elevated);
                    padding: 3px;
                    border-radius: 8px;
                    border: 1px solid var(--border);
                }
                .content-split-bg {
                    background: var(--bg-base);
                }
                .list-panel-flex {
                    display: flex;
                    flex-direction: column;
                }
                .list-view-container {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                }
                .list-grid-header {
                    padding: 0.75rem 1.5rem;
                    background: var(--bg-surface);
                    border-bottom: 1px solid var(--border);
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    font-weight: 700;
                    color: var(--text-muted);
                }
                .list-scroll-area {
                    flex: 1;
                    overflow-y: auto;
                }
                .avatar-list {
                    width: 34px;
                    height: 34px;
                    font-size: 0.86rem;
                }
                .avatar-grid {
                    width: 44px;
                    height: 44px;
                    font-size: 1rem;
                }
                .avatar-board {
                    width: 28px;
                    height: 28px;
                    font-size: 0.75rem;
                }
                .account-col-text {
                    font-size: 0.8125rem;
                }
                .text-secondary {
                    color: var(--text-secondary);
                }
                .text-faded {
                    opacity: 0.3;
                }
                .text-muted {
                    color: var(--text-muted);
                }
                .metrics-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    justify-content: flex-end;
                }
                .metric-item {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }
                .grid-view-container {
                    padding: 1.5rem;
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 1.25rem;
                    overflow-y: auto;
                }
                .tile-header-row {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                .tile-info {
                    min-width: 0;
                }
                .tile-name {
                    font-weight: 700;
                    font-size: 1rem;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .tile-email {
                    font-size: 0.8125rem;
                    color: var(--text-muted);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .tile-badges {
                    margin-top: 0.5rem;
                    display: flex;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                }
                .tile-unread-badge {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                }
                .board-card-header {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .board-card-info {
                    min-width: 0;
                }
                .board-card-name {
                    font-weight: 600;
                    font-size: 0.85rem;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .board-card-email {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .board-card-manager {
                    font-size: 0.7rem;
                    color: var(--text-accent);
                    margin-top: 2px;
                    font-weight: 500;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .board-card-footer {
                    margin-top: 0.75rem;
                    padding-top: 0.5rem;
                    border-top: 1px solid var(--border);
                    font-size: 0.7rem;
                    color: var(--text-secondary);
                    display: flex;
                    justify-content: space-between;
                }
                .board-card-count {
                    font-weight: 700;
                }
                .detail-header-styled {
                    padding: 1.25rem 2rem;
                    border-bottom: 1px solid var(--border);
                    background: var(--bg-surface);
                }
                .detail-actions-layout {
                    margin-bottom: 1.5rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .detail-actions-left-flex {
                    display: flex;
                    align-items: center;
                    gap: 0.875rem;
                }
                .detail-section-label {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .detail-actions-buttons {
                    display: flex;
                    gap: 0.75rem;
                }
                .hero-layout {
                    display: flex;
                    align-items: center;
                    gap: 2rem;
                    margin-bottom: 0.5rem;
                }
                .avatar-hero {
                    width: 72px;
                    height: 72px;
                    font-size: 1.75rem;
                    border-radius: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: 700;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .avatar-hero:hover {
                    transform: scale(1.05) rotate(2deg);
                }
                .hero-info {
                    flex: 1;
                    min-width: 0;
                }
                .hero-name-row {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    flex-wrap: wrap;
                }
                .hero-name {
                    font-size: 2rem;
                    font-weight: 800;
                    margin: 0;
                    color: var(--text-primary);
                    letter-spacing: -0.04em;
                    line-height: 1;
                }
                .hero-badges {
                    display: flex;
                    gap: 0.5rem;
                }
                .hero-meta-row {
                    display: flex;
                    align-items: center;
                    gap: 1.25rem;
                    margin-top: 0.75rem;
                }
                .hero-meta-item {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }
                .manager-select-modern {
                    background: none;
                    border: none;
                    color: var(--text-primary);
                    font-size: 0.875rem;
                    font-weight: 600;
                    cursor: pointer;
                    padding: 0;
                    outline: none;
                }
                .manager-select-modern:hover {
                    color: var(--accent);
                }
                .manager-select-modern option {
                    background: var(--bg-surface);
                    color: var(--text-primary);
                }
                .tab-content-area {
                    flex: 1;
                    overflow-y: auto;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                }
                .loading-state {
                    padding-top: 3rem;
                }
                .loading-text {
                    font-size: 0.8125rem;
                    color: var(--text-muted);
                    margin-top: 8px;
                }
                .inner-split-flex {
                    flex: 1;
                    min-height: 0;
                    display: flex;
                    position: relative;
                    overflow: hidden;
                }
                .inner-list-full {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    width: 100%;
                }
                .email-list-scroll {
                    flex: 1;
                    overflow-y: auto;
                }
                .inner-detail-flex {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .inner-projects-styled {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: var(--bg-base);
                }
                .empty-state-padded {
                    padding-top: 5rem;
                }
                .empty-state-icon-large {
                    background: var(--bg-elevated);
                    padding: 1.5rem;
                    border-radius: 50%;
                }
                .projects-grid {
                    padding: 2rem;
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: 1.5rem;
                    overflow-y: auto;
                }
                .project-card-premium {
                    background: var(--bg-surface);
                    border: 1px solid var(--border);
                    border-radius: 16px;
                    padding: 1.5rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: var(--shadow-sm);
                }
                .project-card-premium:hover {
                    border-color: var(--accent);
                    transform: translateY(-4px);
                    box-shadow: 0 12px 24px -10px rgba(0,0,0,0.15);
                }
                .project-card-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 1rem;
                }
                .project-card-title {
                    font-size: 1.125rem;
                    font-weight: 700;
                    margin: 0;
                    color: var(--text-primary);
                    letter-spacing: -0.02em;
                }
                .project-card-meta {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    margin-bottom: 1.5rem;
                }
                .project-meta-item {
                    display: flex;
                    align-items: center;
                    gap: 0.625rem;
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                }
                .meta-value {
                    color: var(--text-primary);
                    font-weight: 600;
                }
                .project-card-bottom {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: 1rem;
                    border-top: 1px solid var(--border-subtle);
                }
                .project-card-link {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .link-text {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--text-muted);
                }

                /* ── Layout helpers ── */
                .list-toolbar { padding: 0.75rem 1.5rem; border-bottom: 1px solid var(--border); background: var(--bg-surface); display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; }
                .list-toolbar-right { display: flex; align-items: center; gap: 1rem; }
                .filter-tabs { display: flex; gap: 0.5rem; }
                .filter-tab { padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 500; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-md); transition: all 0.2s; border: 1px solid transparent; }
                .filter-tab:hover { background: var(--bg-hover); color: var(--text-secondary); }
                .filter-tab.active { background: var(--accent-light); color: var(--accent); }

                .search-input { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.625rem 1rem; color: var(--text-primary); font-size: 0.875rem; width: 280px; transition: all 0.2s; outline: none; }
                .search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-light); }

                .client-tile-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1.25rem; transition: all 0.2s; cursor: pointer; position: relative; display: flex; flex-direction: column; gap: 0.75rem; }
                .client-tile-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: var(--shadow-md); }
                .client-tile-card.selected { border-color: var(--accent); background: var(--bg-selected); }

                .board-view { background: var(--bg-base); flex: 1; display: flex; overflow-x: auto; padding: 1.5rem; gap: 1.5rem; }
                .board-column { flex: 0 0 300px; display: flex; flex-direction: column; background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px solid var(--border); max-height: 100%; }
                .column-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
                .column-title { font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center; color: var(--text-muted); }
                .column-count { background: var(--bg-tertiary); padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; color: var(--text-secondary); }
                .column-content { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }

                .board-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.25rem; cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow-sm); }
                .board-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: var(--shadow-md); }
                .board-card.selected { border-color: var(--accent); background: var(--bg-selected); }
                .client-tile-card.unread, .board-card.unread { background: rgba(59, 130, 246, 0.12); border-left: 4px solid var(--accent) !important; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.15); }

                .avatar { display: flex; align-items: center; justify-content: center; border-radius: 50%; color: white; font-weight: 700; border: 2px solid var(--bg-main); flex-shrink: 0; }
                .avatar-lg { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: white; font-weight: 700; border: 3px solid var(--bg-main); }
                .avatar-md { width: 40px; height: 40px; }
                .avatar-sm { width: 32px; height: 32px; font-size: 0.75rem; }

                /* ── Compact mode for split view ── */
                .is-split .list-toolbar { padding: 0.5rem 0.75rem; }
                .is-split .list-toolbar-right .icon-btn.sm { display: none; }

                .detail-header .divider-v {
                    background: var(--border-subtle);
                    width: 1px;
                }

                .inner-list-panel .list-toolbar {
                    background: var(--bg-surface);
                    border-top: none;
                    padding: 0.75rem 1.75rem;
                }

                /* ── Universal Grid Definitions ── */
                .universal-grid.grid-table {
                    display: grid;
                    grid-template-columns: 340px 1fr 180px 160px;
                    align-items: center;
                    padding: 0 1.5rem;
                }
                .grid-row {
                    height: 64px;
                    border-bottom: 1px solid var(--border-subtle);
                    background: var(--bg-surface);
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .grid-row:hover {
                    background: var(--bg-hover);
                }
                .grid-row.selected {
                    background: var(--bg-selected);
                    border-left: 3px solid var(--accent);
                }

                .grid-col { display: flex; align-items: center; gap: 0.75rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
                .grid-col.right { justify-content: flex-end; }
                .col-client { min-width: 0; }
                .col-account { color: var(--text-muted); }
                .sender-info { display: flex; flex-direction: column; line-height: 1.2; overflow: hidden; }
                .sender-name { color: var(--text-primary); font-size: 0.875rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .sender-email { color: var(--text-muted); font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            `}</style>
        </div>
    );
}
