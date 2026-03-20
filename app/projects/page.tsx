'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useUI } from '../context/UIContext';
import Topbar from '../components/Topbar';
import { getAllProjectsAction, updateProjectAction, getManagersAction, createProjectAction } from '../../src/actions/projectActions';
import { getClientsAction } from '../../src/actions/clientActions';
import { useHydrated } from '../utils/useHydration';
import { useMailbox } from '../hooks/useMailbox';
import { EmailRow, EmailDetail } from '../components/InboxComponents';
import InlineReply from '../components/InlineReply';
import AddProjectModal from '../components/AddProjectModal';
import { avatarColor, initials } from '../utils/helpers';
import { syncAllUserAccountsAction, getAccountsAction } from '../../src/actions/accountActions';
import { useGlobalFilter } from '../context/FilterContext';
import { PageLoader } from '../components/LoadingStates';


type Project = {
    id: string;
    project_name: string;
    project_date: string;
    due_date: string;
    paid_status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    final_review: 'PENDING' | 'APPROVED' | 'REVISIONS_NEEDED';
    quote?: number;
    project_value?: number;
    project_link?: string;
    brief?: string;
    reference?: string;
    deduction_on_delay?: number;
    account_manager_id: string;
    client?: { id: string; name: string; email: string };
    manager?: { id: string; name: string };
    sourceEmail?: { gmail_accounts?: { email?: string } };
};

type Client = {
    id: string;
    name: string;
    email: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
    if (!dateStr) return '\u2014';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const statusColors: Record<string, string> = {
    PAID: '#10B981', PARTIALLY_PAID: '#F59E0B', UNPAID: '#EF4444',
};

const priorityColors: Record<string, string> = {
    LOW: '#10B981', MEDIUM: '#3B82F6', HIGH: '#F59E0B', URGENT: '#EF4444',
};

const reviewColors: Record<string, string> = {
    APPROVED: '#10B981', PENDING: '#6B7280', REVISIONS_NEEDED: '#F59E0B',
};

// ─── Main Component ──────────────────────────────────────────────────────────

import { saveToLocalCache, getFromLocalCache } from '../utils/localCache';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 100;

let globalProjectsCache: { projects: Project[], managers: any[], clients: Client[] } | null = null;
let globalProjectsCacheTimestamp = 0;
let globalProjectDetailsCache: Record<string, { emails: any[] }> = {};
let globalThreadCache: Record<string, any[]> = {};

if (typeof window !== 'undefined') {
    const savedProjects = getFromLocalCache('projects_data');
    if (savedProjects) {
        globalProjectsCache = savedProjects;
        globalProjectsCacheTimestamp = 0; // Treat restored cache as stale
    }
}

function isProjectsCacheValid(): boolean {
    if (!globalProjectsCache) return false;
    if (Date.now() - globalProjectsCacheTimestamp > CACHE_TTL_MS) return false;
    if (globalProjectsCache.projects.length > CACHE_MAX_SIZE) {
        globalProjectsCache = null;
        globalProjectsCacheTimestamp = 0;
        return false;
    }
    return true;
}

export default function ProjectsPage() {
    const isHydrated = useHydrated();
    const { selectedAccountId, setSelectedAccountId } = useGlobalFilter();
    const [accounts, setAccounts] = useState<any[]>([]);
    const [projects, setProjects] = useState<Project[]>(() => globalProjectsCache?.projects || []);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [managers, setManagers] = useState<{ id: string, name: string }[]>(() => globalProjectsCache?.managers || []);
    const [clients, setClients] = useState<Client[]>(() => globalProjectsCache?.clients || []);
    const [isLoading, setIsLoading] = useState(() => !globalProjectsCache);
    const [isSyncing, setIsSyncing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const { isComposeOpen, setComposeOpen } = useUI();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'grid' | 'board'>('list');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'UNPAID' | 'PAID' | 'PARTIALLY_PAID'>('ALL');

    // Email state
    const [activeTab, setActiveTab] = useState<'details' | 'emails'>('details');
    const [isReplyingInline, setIsReplyingInline] = useState(false);
    const [isDetailLoading, setIsDetailLoading] = useState(false);

    const {
        emails: projectEmails,
        selectedEmail,
        threadMessages,
        isThreadLoading,
        selectedEmailIds,
        accounts: mailboxAccounts,
        handleSelectEmail,
        handleToggleRead,
        handleDelete: handleDeleteEmail,
        toggleSelectEmail,
        toggleSelectAll,
        handleBulkMarkAsRead: handleBulkMarkRead,
        handleBulkDelete,
        setSelectedEmail,
        prefetchThread
    } = useMailbox({
        type: 'client',
        clientEmail: selectedProject?.client?.email,
        selectedAccountId,
        enabled: !!selectedProject?.client?.email
    });

    // Edit mode state
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        loadData();
    }, [selectedAccountId]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get('projectId');
            if (projectId) {
                const found = projects.find(p => p.id === projectId);
                if (found) {
                    handleSelectProject(found);
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projects]);

    const loadData = async () => {
        if (!isProjectsCacheValid()) setIsLoading(true);
        try {
            const [pData, mData, cData, accResult] = await Promise.all([
                getAllProjectsAction(selectedAccountId),
                getManagersAction(),
                getClientsAction(selectedAccountId),
                getAccountsAction()
            ]);

            globalProjectsCache = { projects: pData as Project[], managers: mData, clients: cData as Client[] };
            globalProjectsCacheTimestamp = Date.now();
            saveToLocalCache('projects_data', globalProjectsCache);

            setProjects(globalProjectsCache.projects);
            setManagers(globalProjectsCache.managers);
            setClients(globalProjectsCache.clients);

            if (accResult.success) {
                setAccounts(accResult.accounts);
            }
        } catch (err) {
            console.error('Failed to load project data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSync = async () => {
        try {
            await syncAllUserAccountsAction();
        } catch {
            console.error('Failed to sync accounts.');
        } finally {
            setTimeout(async () => {
                await loadData();
                setIsSyncing(false);
            }, 3000);
        }
    };

    const handleSelectProject = async (project: Project) => {
        setSelectedProject(project);
        setSelectedEmail(null);
        setActiveTab('details');
    };

    const handleUpdateProject = async (updates: any) => {
        if (!selectedProject) return;
        setIsSaving(true);
        const res = await updateProjectAction(selectedProject.id, updates);
        if (res.success) {
            // Optimistic / Local update
            const updated = { ...selectedProject, ...res.project };
            setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...res.project } : p));
            setSelectedProject(updated);
        }
        setIsSaving(false);
    };

    const filteredProjects = useMemo<Project[]>(() => {
        const q = searchQuery.toLowerCase().trim();
        let result = projects;

        if (q) {
            result = result.filter(p =>
                p.project_name.toLowerCase().includes(q) ||
                p.client?.name?.toLowerCase().includes(q) ||
                p.client?.email?.toLowerCase().includes(q)
            );
        }

        if (filterStatus !== 'ALL') {
            result = result.filter(p => p.paid_status === filterStatus);
        }

        return result;
    }, [projects, searchQuery, filterStatus]);

    return (
        <div className="mailbox-wrapper">
            <div className="main-area">
                <Topbar
                    searchTerm={searchQuery}
                    setSearchTerm={setSearchQuery}
                    onSearch={(term) => { }} // Local filtering handles it
                    onClearSearch={() => {
                        setSearchQuery('');
                        setFilterStatus('ALL');
                    }}
                    placeholder="Search by name or client..."
                    leftContent={
                        <div className="topbar-left-wrapper">
                            <h1 className="page-title">Projects</h1>
                        </div>
                    }
                    rightContent={
                        <div className="topbar-right-wrapper">
                            <button className="btn btn-primary sm" onClick={() => setIsCreateModalOpen(true)} aria-label="Create new project">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M12 5v14M5 12h14" /></svg>
                                New Project
                            </button>
                            <div className="avatar-btn" title="Admin">A</div>
                        </div>
                    }
                />

                {/* Filter Tabs & Toolbar */}
                <div className="tabs-bar" role="tablist" aria-label="Project filter tabs">
                    <div
                        className={`tab ${filterStatus === 'ALL' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('ALL')}
                        role="tab"
                        aria-selected={filterStatus === 'ALL'}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                        All Projects
                        <span className="tab-count">{isHydrated ? projects.length : 0}</span>
                    </div>
                    <div
                        className={`tab ${filterStatus === 'UNPAID' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('UNPAID')}
                        role="tab"
                        aria-selected={filterStatus === 'UNPAID'}
                    >
                        Unpaid
                    </div>
                    <div
                        className={`tab ${filterStatus === 'PARTIALLY_PAID' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('PARTIALLY_PAID')}
                        role="tab"
                        aria-selected={filterStatus === 'PARTIALLY_PAID'}
                    >
                        Partially Paid
                    </div>
                    <div
                        className={`tab ${filterStatus === 'PAID' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('PAID')}
                        role="tab"
                        aria-selected={filterStatus === 'PAID'}
                    >
                        Paid
                    </div>
                </div>

                <div className="list-toolbar toolbar-sub">
                    <div className="list-toolbar-left">
                        <span className="count-label toolbar-count">
                            Showing {filteredProjects.length} results
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
                        <button className="icon-btn sm" onClick={loadData} title="Refresh" aria-label="Refresh projects">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>
                                <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="content-split content-split-bg">
                    {/* Project List */}
                    {!selectedProject ? (
                        <div className="list-panel list-panel-flex">
                            <PageLoader isLoading={!isHydrated || isLoading} type="list" count={12}>
                                {filteredProjects.length === 0 ? (
                                    <div className="empty-state">
                                        <div className="empty-state-icon">
                                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
                                                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
                                            </svg>
                                        </div>
                                        <div className="empty-state-title">No projects yet</div>
                                        <div className="empty-state-desc">Start by creating a new delivery workflow to manage your projects.</div>
                                    </div>
                                ) : viewMode === 'list' ? (
                                    <div className="list-area list-area-flex">
                                        {!selectedProject && (
                                            <div className="universal-grid grid-table grid-header">
                                                <div className="grid-col col-main">Project Name</div>
                                                <div className="grid-col">Client Account</div>
                                                <div className="grid-col">Account Manager</div>
                                                <div className="grid-col right">Status & Due Date</div>
                                            </div>
                                        )}
                                        <div className="list-scroll-area">
                                            {filteredProjects.map((p: Project) => (
                                                <div
                                                    key={p.id}
                                                    className="universal-grid grid-table grid-row"
                                                    onClick={() => handleSelectProject(p)}
                                                >
                                                    <div className="grid-col col-main">
                                                        <div className="avatar avatar-list" style={{ background: avatarColor(p.project_name || p.id) }} title={p.project_name}>
                                                            {initials(p.project_name)}
                                                        </div>
                                                        <div className="sender-info">
                                                            <div className="sender-name" title={p.project_name}>{p.project_name}</div>
                                                            <div className="sender-email" title={p.client?.name || 'Unknown'}>{p.client?.name || 'Unknown'}</div>
                                                        </div>
                                                    </div>

                                                    <div className="grid-col secondary" title={p.sourceEmail?.gmail_accounts?.email || 'No Linked Account'}>
                                                        {p.sourceEmail?.gmail_accounts?.email || 'No Linked Account'}
                                                    </div>

                                                    <div className="grid-col muted">
                                                        <span className="badge badge-gray">{p.manager?.name || 'Unassigned'}</span>
                                                    </div>

                                                    <div className="grid-col right">
                                                        <div className="status-due-row">
                                                            <div className="status-badges">
                                                                <span className={`badge ${p.paid_status === 'PAID' ? 'badge-green' : p.paid_status === 'PARTIALLY_PAID' ? 'badge-yellow' : 'badge-red'}`}>
                                                                    {p.paid_status.replace('_', ' ')}
                                                                </span>
                                                                {!selectedProject && (
                                                                    <span className={`badge ${p.priority === 'URGENT' ? 'badge-red' : p.priority === 'HIGH' ? 'badge-yellow' : p.priority === 'MEDIUM' ? 'badge-blue' : 'badge-green'}`}>
                                                                        {p.priority}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="due-date-text">
                                                                {formatDate(p.due_date)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : viewMode === 'grid' ? (
                                    <div className="grid-view-container">
                                        {filteredProjects.map((p: Project) => (
                                            <div
                                                key={p.id}
                                                className="project-card-premium"
                                                onClick={() => handleSelectProject(p)}
                                            >
                                                <div className="project-card-top">
                                                    <h3 className="project-card-title" title={p.project_name}>
                                                        {p.project_name}
                                                    </h3>
                                                    <span className={`badge ${p.priority === 'URGENT' ? 'badge-red' : p.priority === 'HIGH' ? 'badge-yellow' : p.priority === 'MEDIUM' ? 'badge-blue' : 'badge-green'}`}>
                                                        {p.priority || 'MEDIUM'}
                                                    </span>
                                                </div>

                                                <div className="project-card-meta">
                                                    <div className="project-meta-item">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                                        Manager: <span className="meta-value">{p.manager?.name || 'Unassigned'}</span>
                                                    </div>
                                                    <div className="project-meta-item">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                                                        Account: <span className="meta-value">{p.sourceEmail?.gmail_accounts?.email || 'No Linked Account'}</span>
                                                    </div>
                                                    <div className="project-meta-item">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                                                        Due Date: <span className="meta-value">{formatDate(p.due_date)}</span>
                                                    </div>
                                                </div>

                                                <div className="project-card-bottom">
                                                    <span className={`badge ${p.paid_status === 'PAID' ? 'badge-green' : p.paid_status === 'PARTIALLY_PAID' ? 'badge-yellow' : 'badge-red'}`}>
                                                        {p.paid_status?.replace('_', ' ') || 'UNPAID'}
                                                    </span>
                                                    {p.client?.name && (
                                                        <div className="project-client-name" title={p.client.name}>
                                                            {p.client.name}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="board-view">
                                        {(['UNPAID', 'PARTIALLY_PAID', 'PAID'] as const).map(status => (
                                            <div key={status} className="board-column">
                                                <div className="column-header">
                                                    <div className="column-title">
                                                        {status.replace('_', ' ')}
                                                        <span className="column-count">
                                                            {filteredProjects.filter((p: Project) => p.paid_status === status).length}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="column-content">
                                                    {filteredProjects.filter((p: Project) => p.paid_status === status).map((p: Project) => (
                                                        <div
                                                            key={p.id}
                                                            className="board-card"
                                                            onClick={() => handleSelectProject(p)}
                                                        >
                                                            <div className={`card-priority priority-${p.priority.toLowerCase()}`} />
                                                            <div className="card-title" title={p.project_name}>{p.project_name}</div>
                                                            <div className="card-client" title={p.client?.name}>{p.client?.name}</div>
                                                            <div className="card-account" title={p.sourceEmail?.gmail_accounts?.email || 'No Linked Account'}>
                                                                {p.sourceEmail?.gmail_accounts?.email || 'No Linked Account'}
                                                            </div>
                                                            <div className="card-footer">
                                                                <div className="card-date">
                                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M8 2v4M3 10h18" /><rect x="3" y="4" width="18" height="18" rx="2" /></svg>
                                                                    {formatDate(p.due_date)}
                                                                </div>
                                                                <div className="card-avatar" title={p.manager?.name || 'Unknown'}>{(p.manager?.name?.[0] || '?').toUpperCase()}</div>
                                                            </div>
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
                        /* Detail Panel */
                        <div className="detail-panel detail-panel-styled">
                            {/* Detail Header */}
                            <div className="detail-header">
                                <div className="detail-actions">
                                    <div className="detail-actions-left">
                                        <button className="icon-btn" onClick={() => { setSelectedProject(null); setSelectedEmail(null); }} title="Back to list" aria-label="Back to project list">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M19 12H5M12 19l-7-7 7-7" />
                                            </svg>
                                        </button>
                                        <div className="divider-v" />
                                        <div className="detail-title-block">
                                            <h2 className="detail-project-name" title={selectedProject.project_name}>
                                                {selectedProject.project_name}
                                            </h2>
                                            <span className="detail-client-name" title={selectedProject.client?.name || 'Loading client...'}>
                                                {selectedProject.client?.name || 'Loading client...'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="detail-actions-right">
                                        {selectedProject.project_link && (
                                            <button className="icon-btn" title="Open Project Link" aria-label="Open project link" onClick={() => window.open(selectedProject.project_link, '_blank')}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" /></svg>
                                            </button>
                                        )}
                                        <div className="divider-v" />
                                        <button className="btn btn-secondary btn-sm" onClick={() => handleSync()} aria-label="Refresh project data">Refresh</button>
                                    </div>
                                </div>
                            </div>

                            {!selectedEmail && (
                                <div className="tabs-bar" role="tablist" aria-label="Project detail tabs">
                                    <div
                                        className={`tab ${activeTab === 'details' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('details')}
                                        role="tab"
                                        aria-selected={activeTab === 'details'}
                                    >
                                        Overview
                                    </div>
                                    <div
                                        className={`tab ${activeTab === 'emails' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('emails')}
                                        role="tab"
                                        aria-selected={activeTab === 'emails'}
                                    >
                                        Email Logs
                                        {projectEmails.length > 0 && <span className="tab-badge">{projectEmails.length}</span>}
                                    </div>
                                </div>
                            )}

                            <div className="panel-content" style={{ padding: selectedEmail ? '0' : '1.5rem', background: selectedEmail ? 'var(--bg-main)' : 'transparent' }}>
                                {selectedEmail ? (
                                    <EmailDetail
                                        email={selectedEmail}
                                        threadMessages={threadMessages}
                                        isThreadLoading={isThreadLoading}
                                        isReplyingInline={isReplyingInline}
                                        onBack={() => setSelectedEmail(null)}
                                        onStageChange={() => { }}
                                        onReply={() => setIsReplyingInline(true)}
                                        onForward={() => setComposeOpen(true)}
                                        totalCount={projectEmails.length}
                                        replySlot={
                                            <InlineReply
                                                threadId={selectedEmail.thread_id}
                                                to={selectedEmail.direction === 'SENT'
                                                    ? selectedEmail.to_email
                                                    : selectedEmail.from_email}
                                                subject={selectedEmail.subject}
                                                accountId={selectedEmail.gmail_account_id}
                                                onSuccess={() => setIsReplyingInline(false)}
                                                onCancel={() => setIsReplyingInline(false)}
                                            />
                                        }
                                    />
                                ) : activeTab === 'details' ? (
                                    <>
                                        <div className="input-group">
                                            <label>Project Name</label>
                                            <input
                                                type="text"
                                                value={selectedProject.project_name}
                                                onBlur={(e) => handleUpdateProject({ projectName: e.target.value })}
                                                onChange={(e) => setSelectedProject({ ...selectedProject, project_name: e.target.value })}
                                            />
                                        </div>

                                        <div className="grid-2">
                                            <div className="input-group">
                                                <label>Start Date</label>
                                                <input
                                                    type="date"
                                                    value={selectedProject.project_date?.split('T')[0] || ''}
                                                    onChange={(e) => handleUpdateProject({ projectDate: new Date(e.target.value).toISOString() })}
                                                />
                                            </div>
                                            <div className="input-group">
                                                <label>Due Date</label>
                                                <input
                                                    type="date"
                                                    value={selectedProject.due_date?.split('T')[0] || ''}
                                                    onChange={(e) => handleUpdateProject({ dueDate: new Date(e.target.value).toISOString() })}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid-2">
                                            <div className="input-group">
                                                <label>Account Manager</label>
                                                <select
                                                    value={selectedProject.account_manager_id}
                                                    onChange={(e) => handleUpdateProject({ accountManagerId: e.target.value })}
                                                >
                                                    {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="input-group">
                                                <label>Linked Gmail Account</label>
                                                <input
                                                    type="text"
                                                    value={selectedProject.sourceEmail?.gmail_accounts?.email || 'No Linked Account'}
                                                    readOnly
                                                    style={{ background: 'var(--bg-elevated)', cursor: 'default' }}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid-2">
                                            <div className="input-group">
                                                <label>Status</label>
                                                <select
                                                    value={selectedProject.paid_status}
                                                    onChange={(e) => handleUpdateProject({ paidStatus: e.target.value })}
                                                >
                                                    <option value="UNPAID">Unpaid</option>
                                                    <option value="PARTIALLY_PAID">Partially Paid</option>
                                                    <option value="PAID">Paid</option>
                                                </select>
                                            </div>
                                            <div className="input-group">
                                                <label>Priority</label>
                                                <select
                                                    value={selectedProject.priority}
                                                    onChange={(e) => handleUpdateProject({ priority: e.target.value })}
                                                >
                                                    <option value="LOW">Low</option>
                                                    <option value="MEDIUM">Medium</option>
                                                    <option value="HIGH">High</option>
                                                    <option value="URGENT">Urgent</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid-2">
                                            <div className="input-group">
                                                <label>Quote ($)</label>
                                                <input
                                                    type="number"
                                                    value={selectedProject.quote || ''}
                                                    onChange={(e) => handleUpdateProject({ quote: parseFloat(e.target.value) })}
                                                />
                                            </div>
                                            <div className="input-group">
                                                <label>Agreed Value ($)</label>
                                                <input
                                                    type="number"
                                                    value={selectedProject.project_value || ''}
                                                    onChange={(e) => handleUpdateProject({ projectValue: parseFloat(e.target.value) })}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid-2">
                                            <div className="input-group">
                                                <label>Final Review</label>
                                                <select
                                                    value={selectedProject.final_review || 'PENDING'}
                                                    onChange={(e) => handleUpdateProject({ finalReview: e.target.value })}
                                                >
                                                    <option value="PENDING">Pending</option>
                                                    <option value="REVIEWING">Reviewing</option>
                                                    <option value="APPROVED">Approved</option>
                                                    <option value="REJECTED">Rejected</option>
                                                </select>
                                            </div>
                                            <div className="input-group">
                                                <label>Deduction on Delay ($)</label>
                                                <input
                                                    type="number"
                                                    value={selectedProject.deduction_on_delay || ''}
                                                    onChange={(e) => handleUpdateProject({ deductionOnDelay: parseFloat(e.target.value) })}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>

                                        <div className="input-group">
                                            <label>Reference / Referral</label>
                                            <input
                                                type="text"
                                                value={selectedProject.reference || ''}
                                                onChange={(e) => handleUpdateProject({ reference: e.target.value })}
                                                placeholder="Where did this project come from?"
                                            />
                                        </div>

                                        <div className="input-group">
                                            <label>Project Link</label>
                                            <input
                                                type="url"
                                                placeholder="Drive/Dropbox/Figma link..."
                                                value={selectedProject.project_link || ''}
                                                onChange={(e) => handleUpdateProject({ projectLink: e.target.value })}
                                            />
                                        </div>

                                        <div className="input-group">
                                            <label>Client Brief / Notes</label>
                                            <textarea
                                                style={{ height: '140px' }}
                                                value={selectedProject.brief || ''}
                                                onBlur={(e) => handleUpdateProject({ brief: e.target.value })}
                                                onChange={(e) => setSelectedProject({ ...selectedProject, brief: e.target.value })}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="inner-list-panel email-list-panel">
                                        <div className="list-toolbar">
                                            <div className="list-toolbar-left">
                                                <label className="check-container">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedEmailIds.size > 0 && selectedEmailIds.size === projectEmails.length}
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
                                                {projectEmails.length > 0 && (
                                                    <span className="count-label">
                                                        1&ndash;{projectEmails.length} of {projectEmails.length}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div id="project-email-list-scroll" className="email-list-scroll">
                                            <div className="gmail-list-header">
                                                <div className="gmail-lh-check" />
                                                <div className="gmail-lh-star" />
                                                <div className="gmail-lh-sender">Sender</div>
                                                <div className="gmail-lh-body">Subject / Preview</div>
                                                <div className="gmail-lh-account">Gmail Account</div>
                                                <div className="gmail-lh-manager">Manager</div>
                                                <div className="gmail-lh-date">Date</div>
                                            </div>
                                            {isDetailLoading ? (
                                                <div className="empty-state loading-state">
                                                    <div className="spinner" />
                                                    <span className="loading-text">Loading emails...</span>
                                                </div>
                                            ) : projectEmails.length === 0 ? (
                                                <div className="empty-state loading-state">
                                                    <div className="empty-state-icon">
                                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                    </div>
                                                    <div className="empty-state-title">No emails found</div>
                                                    <div className="empty-state-desc">No email history for this project's client.</div>
                                                </div>
                                            ) : (
                                                projectEmails.map((email: any) => (
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
                                )}
                                <div style={{ height: '3rem' }}></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isCreateModalOpen && (
                <AddProjectModal
                    clients={clients}
                    onClose={() => setIsCreateModalOpen(false)}
                    onCreated={() => {
                        setIsCreateModalOpen(false);
                        loadData();
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
                .topbar-left-wrapper {
                    width: 280px;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding-left: 2.5rem;
                }
                .topbar-right-wrapper {
                    flex: 1;
                    display: flex;
                    justify-content: flex-end;
                    padding-right: 1rem;
                    align-items: center;
                    gap: 0.75rem;
                }
                .toolbar-sub {
                    border-top: 1px solid var(--border-subtle);
                    padding: 0.6rem 1.5rem;
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
                .list-area-flex {
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
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
                .status-due-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .status-badges {
                    display: flex;
                    gap: 0.4rem;
                }
                .due-date-text {
                    width: 80px;
                    font-size: 0.72rem;
                    text-align: right;
                    color: var(--text-muted);
                }
                .grid-view-container {
                    padding: 1.5rem;
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
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
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
                .project-client-name {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    font-weight: 600;
                    max-width: 120px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .card-account {
                    font-size: 0.65rem;
                    color: var(--text-accent);
                    margin-bottom: 0.5rem;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .detail-panel-styled {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: var(--bg-card);
                    min-width: 0;
                    overflow: hidden;
                }
                .detail-title-block {
                    display: flex;
                    flex-direction: column;
                }
                .detail-project-name {
                    font-size: 0.9375rem;
                    font-weight: 700;
                    margin: 0;
                    color: var(--text-primary);
                }
                .detail-client-name {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }
                .email-list-panel {
                    display: flex;
                    flex-direction: column;
                    margin: -1.5rem;
                    width: calc(100% + 3rem);
                    min-height: 500px;
                }
                .email-list-scroll {
                    flex: 1;
                    overflow-y: auto;
                }
                .loading-state {
                    padding-top: 3rem;
                }
                .loading-text {
                    font-size: 0.8125rem;
                    color: var(--text-muted);
                    margin-top: 8px;
                }

                /* ── Project Specific ── */
                .date-col { width: 100px; text-align: right; font-size: 0.75rem; color: var(--text-tertiary); margin-left: auto; }

                .avatar { display: flex; align-items: center; justify-content: center; border-radius: 50%; color: white; font-weight: 700; border: 2px solid var(--bg-main); flex-shrink: 0; }
                .avatar-lg { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: white; font-weight: 700; border: 3px solid var(--bg-main); }
                .avatar-md { width: 40px; height: 40px; }
                .avatar-sm { width: 32px; height: 32px; font-size: 0.75rem; }

                .project-tile-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1.25rem; transition: all 0.2s var(--ease); cursor: pointer; display: flex; flex-direction: column; gap: 1rem; position: relative; }
                .project-tile-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: var(--shadow-md); }
                .project-tile-card.selected { border-color: var(--accent); background: var(--bg-selected); }

                .tile-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
                .tile-title { font-weight: 700; font-size: 0.9375rem; color: var(--text-primary); line-height: 1.3; }
                .tile-priority { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
                .priority-urgent { background: var(--danger); box-shadow: 0 0 10px var(--danger); }
                .priority-high { background: var(--warning); }
                .priority-medium { background: var(--accent); }
                .priority-low { background: var(--success); }

                .tile-meta { display: flex; flex-direction: column; gap: 0.5rem; }
                .tile-client, .tile-date { display: flex; align-items: center; gap: 0.5rem; font-size: 0.775rem; color: var(--text-muted); }
                .tile-client svg, .tile-date svg { color: var(--text-tertiary); }

                .tile-footer { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 0.75rem; border-top: 1px solid var(--border); }
                .tile-avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--bg-tertiary); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; border: 1px solid var(--border); }

                .board-view { background: var(--bg-base); flex: 1; display: flex; overflow-x: auto; padding: 1.5rem; gap: 1.5rem; min-height: 0; }
                .board-column { flex: 0 0 280px; display: flex; flex-direction: column; background: var(--bg-elevated); border-radius: var(--radius-lg); border: 1px solid var(--border); max-height: 100%; }
                .column-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); background: var(--bg-surface); border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
                .column-title { font-weight: 700; font-size: 0.8125rem; text-transform: uppercase; letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center; color: var(--text-muted); }
                .column-count { background: var(--bg-tertiary); padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; color: var(--text-secondary); }
                .column-content { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }

                .board-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1rem; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; box-shadow: var(--shadow-sm); }
                .board-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: var(--shadow-md); }
                .board-card.selected { border-color: var(--accent); background: var(--bg-selected); }
                .card-priority { position: absolute; top: 0; left: 0; width: 4px; height: 100%; transition: width 0.2s; }
                .board-card:hover .card-priority { width: 6px; }
                .card-priority.priority-urgent { background: var(--danger); box-shadow: 0 0 10px var(--danger); }
                .card-priority.priority-high { background: var(--warning); }
                .card-priority.priority-medium { background: var(--accent); }
                .card-priority.priority-low { background: var(--success); }
                .card-title { font-weight: 600; font-size: 0.875rem; margin-bottom: 0.25rem; }
                .card-client { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem; }
                .card-footer { display: flex; justify-content: space-between; align-items: center; }
                .card-date { font-size: 0.7rem; color: var(--text-tertiary); display: flex; align-items: center; gap: 4px; }
                .card-avatar { width: 20px; height: 20px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 700; border: 1px solid var(--border); }

                .panel-content { flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
                .input-group { display: flex; flex-direction: column; gap: 0.4rem; }
                .input-group label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
                .input-group input, .input-group select, .input-group textarea { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.6rem 0.75rem; color: var(--text-primary); font-size: 0.875rem; font-family: inherit; outline: none; transition: all 0.2s; width: 100%; }
                .input-group input:focus, .input-group select:focus, .input-group textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-light); background: var(--bg-surface); }
                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
                .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 2000; animation: fadeIn 0.15s; }
                .modal-content { background: var(--bg-card); border: 1px solid var(--border-strong); border-radius: var(--radius-xl); width: 100%; box-shadow: var(--shadow-xl); animation: modalIn 0.2s; }
                .modal-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
                .modal-header h2 { font-size: 1rem; font-weight: 600; }
                .animate-pop { animation: modalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); }

                /* ── Compact mode for split view ── */
                .is-split .project-row-item { padding: 0.5rem 0.625rem; gap: 0.5rem; }
                .is-split .project-row-item .sender-col { width: 100%; padding-right: 0; }
                .is-split .project-row-item .sender-name { font-size: 0.8125rem; }
                .is-split .project-row-item .sender-email { display: none; }
                .is-split .project-row-item .account-col, .is-split .project-row-item .manager-col { display: none; }
                .is-split .project-row-item .badge { font-size: 0.6rem !important; padding: 1px 5px; }
                .is-split .project-row-item .date-col { width: 60px; font-size: 0.7rem; }

                /* Hide view mode buttons and new project btn in compact */
                .is-split .list-toolbar-right .icon-btn.sm { display: none; }
                .is-split .list-toolbar-right .btn-sm { display: none; }
                .is-split .list-toolbar { padding: 0 0.75rem; }

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
                .col-main { min-width: 0; }
                .sender-info { display: flex; flex-direction: column; line-height: 1.2; overflow: hidden; }
                .sender-name { color: var(--text-primary); font-size: 0.875rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
                .sender-email { color: var(--text-muted); font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

                .grid-header { padding: 0.75rem 1.5rem; background: var(--bg-surface); border-bottom: 1px solid var(--border); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; color: var(--text-muted); }

                /* ── Compact Grid Override ── */
                .is-split .universal-grid.grid-table {
                    grid-template-columns: 1fr;
                    padding: 0 0.75rem;
                }
                .is-split .grid-header { display: none; }
                .is-split .grid-row { height: auto; padding: 0.5rem 0; }
                .is-split .grid-col:not(.col-main) { display: none; }
                .is-split .sender-name { font-size: 0.8125rem; }
                .is-split .sender-email { display: none; }
            `}</style>
        </div>
    );
}
