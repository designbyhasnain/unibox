'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import ComposeModal from '../components/ComposeModal';
import Topbar from '../components/Topbar';
import { getAllProjectsAction, updateProjectAction, getManagersAction, createProjectAction } from '../../src/actions/projectActions';
import { getClientsAction } from '../../src/actions/clientActions';
import { getClientEmailsAction, deleteEmailAction, getThreadMessagesAction, markEmailAsReadAction, markEmailAsUnreadAction, bulkDeleteEmailsAction, bulkMarkAsReadAction } from '../../src/actions/emailActions';
import { EmailRow, EmailDetail } from '../components/InboxComponents';
import InlineReply from '../components/InlineReply';
import AddProjectModal from '../components/AddProjectModal';
import type { ProjectUpdatePayload } from '../../src/actions/projectActions';
import { avatarColor, initials } from '../utils/helpers';
import { syncAllUserAccountsAction, getAccountsAction } from '../../src/actions/accountActions';
import { useGlobalFilter } from '../context/FilterContext';

const ADMIN_USER_ID = '1ca1464d-1009-426e-96d5-8c5e8c84faac';

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
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
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

let globalProjectsCache: { projects: Project[], managers: any[], clients: Client[] } | null = null;
let globalProjectDetailsCache: Record<string, { emails: any[] }> = {};
let globalThreadCache: Record<string, any[]> = {};

export default function ProjectsPage() {
    const { selectedAccountId, setSelectedAccountId } = useGlobalFilter();
    const [accounts, setAccounts] = useState<any[]>([]);
    const [projects, setProjects] = useState<Project[]>(() => globalProjectsCache?.projects || []);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [managers, setManagers] = useState<{ id: string, name: string }[]>(() => globalProjectsCache?.managers || []);
    const [clients, setClients] = useState<Client[]>(() => globalProjectsCache?.clients || []);
    const [isLoading, setIsLoading] = useState(() => !globalProjectsCache);
    const [isSyncing, setIsSyncing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'grid' | 'board'>('list');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'UNPAID' | 'PAID' | 'PARTIALLY_PAID'>('ALL');

    // Email state
    const [activeTab, setActiveTab] = useState<'details' | 'emails'>('details');
    const [projectEmails, setProjectEmails] = useState<any[]>([]);
    const [selectedEmail, setSelectedEmail] = useState<any>(null);
    const [threadMessages, setThreadMessages] = useState<any[]>([]);
    const [isThreadLoading, setIsThreadLoading] = useState(false);
    const [isReplyingInline, setIsReplyingInline] = useState(false);
    const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
    const [isDetailLoading, setIsDetailLoading] = useState(false);

    // Edit mode state
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        loadData();
    }, [selectedAccountId]);

    useEffect(() => {
        if (typeof window !== 'undefined' && projects.length > 0 && !selectedProject) {
            const params = new URLSearchParams(window.location.search);
            const projectId = params.get('project_id');
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
        setIsLoading(true);
        try {
            const [pData, mData, cData, accs] = await Promise.all([
                getAllProjectsAction(selectedAccountId),
                getManagersAction(),
                getClientsAction(selectedAccountId),
                getAccountsAction(ADMIN_USER_ID)
            ]);
            setProjects(pData as Project[]);
            setManagers(mData);
            setClients(cData as Client[]);
            setAccounts(accs || []);
        } catch (err) {
            console.error('Failed to load project data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            await syncAllUserAccountsAction(ADMIN_USER_ID);
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

        const cached = globalProjectDetailsCache[project.id];
        if (cached) {
            setProjectEmails(cached.emails);
            setIsDetailLoading(false);
        } else {
            setProjectEmails([]);
            setIsDetailLoading(true);
        }

        setActiveTab('details');

        if (project.client?.email) {
            try {
                const emails = await getClientEmailsAction(ADMIN_USER_ID, project.client.email, selectedAccountId);
                globalProjectDetailsCache[project.id] = { emails };
                setProjectEmails(emails);
            } catch (err) {
                console.error('Failed to load project emails:', err);
            }
        }
        setIsDetailLoading(false);
    };

    const handleSelectEmail = async (email: any) => {
        setSelectedEmail(email);

        if (email.thread_id && globalThreadCache[email.thread_id]) {
            setThreadMessages(globalThreadCache[email.thread_id] || []);
        } else {
            setThreadMessages([email]);
        }

        if (email.is_unread) {
            setProjectEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_unread: false } : e));
            await markEmailAsReadAction(email.id);
        }

        if (email.thread_id) {
            if (!globalThreadCache[email.thread_id]) setIsThreadLoading(true);
            try {
                const messages = await getThreadMessagesAction(email.thread_id);
                if (messages && messages.length > 0) {
                    globalThreadCache[email.thread_id] = messages;
                    setThreadMessages(messages);
                }
            } catch (err) {
                console.error('Failed to load thread:', err);
            } finally {
                setIsThreadLoading(false);
            }
        }
    };

    const handleToggleRead = async (id: string, currentUnread: boolean) => {
        const nextUnread = !currentUnread;
        setProjectEmails(prev => prev.map(e => e.id === id ? { ...e, is_unread: nextUnread } : e));
        if (selectedEmail?.id === id) {
            setSelectedEmail((prev: any) => ({ ...prev, is_unread: nextUnread }));
        }

        if (nextUnread) {
            await markEmailAsUnreadAction(id);
        } else {
            await markEmailAsReadAction(id);
        }
    };


    const handleDeleteEmail = async (id: string) => {
        if (!confirm('Are you sure you want to delete this message?')) return;
        setProjectEmails(prev => prev.filter(e => e.id !== id));
        if (selectedEmail?.id === id) setSelectedEmail(null);
        await deleteEmailAction(id);
    };

    const toggleSelectEmail = (id: string) => {
        setSelectedEmailIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedEmailIds.size > 0 && selectedEmailIds.size === projectEmails.length) {
            setSelectedEmailIds(new Set());
        } else {
            setSelectedEmailIds(new Set(projectEmails.map((e) => e.id)));
        }
    };

    const handleBulkMarkRead = async () => {
        const ids = Array.from(selectedEmailIds);
        if (ids.length === 0) return;
        setProjectEmails((prev) => prev.map((e) => selectedEmailIds.has(e.id) ? { ...e, is_unread: false } : e));
        setSelectedEmailIds(new Set());
        await bulkMarkAsReadAction(ids);
    };

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedEmailIds);
        if (ids.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${ids.length} messages?`)) return;
        setProjectEmails((prev) => prev.filter((e) => !selectedEmailIds.has(e.id)));
        setSelectedEmailIds(new Set());
        if (selectedEmail && selectedEmailIds.has(selectedEmail.id)) setSelectedEmail(null);
        await bulkDeleteEmailsAction(ids);
    };

    const handleUpdateProject = async (updates: ProjectUpdatePayload) => {
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
        <>
            <Sidebar onOpenCompose={() => setIsComposeOpen(true)} />

            <main className="main-area">
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
                        <div style={{ width: '280px', display: 'flex', alignItems: 'center', gap: '1rem', paddingLeft: '2.5rem' }}>
                            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Projects</h1>
                        </div>
                    }
                    rightContent={
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: '1rem', alignItems: 'center', gap: '0.75rem' }}>
                            <button className="btn btn-primary sm" onClick={() => setIsCreateModalOpen(true)}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M12 5v14M5 12h14" /></svg>
                                New Project
                            </button>
                            <div className="avatar-btn">A</div>
                        </div>
                    }
                />

                {/* Filter Tabs & Toolbar */}
                <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                    <div className="tabs-bar" style={{ padding: '0 1.5rem', borderBottom: 'none' }}>
                        <div className={`tab ${filterStatus === 'ALL' ? 'active' : ''}`} onClick={() => setFilterStatus('ALL')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                            All Projects
                            <span style={{ fontSize: '0.75rem', opacity: 0.5, marginLeft: 2 }}>{projects.length}</span>
                        </div>
                        <div className={`tab ${filterStatus === 'UNPAID' ? 'active' : ''}`} onClick={() => setFilterStatus('UNPAID')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Unpaid
                        </div>
                        <div className={`tab ${filterStatus === 'PARTIALLY_PAID' ? 'active' : ''}`} onClick={() => setFilterStatus('PARTIALLY_PAID')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Partially Paid
                        </div>
                        <div className={`tab ${filterStatus === 'PAID' ? 'active' : ''}`} onClick={() => setFilterStatus('PAID')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Paid
                        </div>
                    </div>

                    <div className="list-toolbar" style={{ borderTop: '1px solid var(--border-subtle)', padding: '0.6rem 1.5rem' }}>
                        <div className="list-toolbar-left">
                            <span className="count-label" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                Showing {filteredProjects.length} results
                            </span>
                        </div>
                        <div className="list-toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', background: 'var(--bg-elevated)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                <button
                                    className={`icon-btn sm ${viewMode === 'list' ? 'active' : ''}`}
                                    onClick={() => setViewMode('list')}
                                    title="List View"
                                    style={{ width: 32, height: 32 }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
                                </button>
                                <button
                                    className={`icon-btn sm ${viewMode === 'grid' ? 'active' : ''}`}
                                    onClick={() => setViewMode('grid')}
                                    title="Grid View"
                                    style={{ width: 32, height: 32 }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                                </button>
                                <button
                                    className={`icon-btn sm ${viewMode === 'board' ? 'active' : ''}`}
                                    onClick={() => setViewMode('board')}
                                    title="Board View"
                                    style={{ width: 32, height: 32 }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 3h18v18H3zM9 3v18m6-18v18" /></svg>
                                </button>
                            </div>
                            <div className="divider-v" />
                            <button className="icon-btn sm" onClick={loadData} title="Refresh">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>
                                    <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="content-split" style={{ background: 'var(--bg-base)' }}>
                    {/* Project List */}
                    {!selectedProject ? (
                        <div className="list-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                            {isLoading ? (
                                <div className="empty-state">
                                    <div className="spinner" />
                                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 8 }}>Loading projects...</span>
                                </div>
                            ) : filteredProjects.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-state-icon">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                                            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
                                        </svg>
                                    </div>
                                    <div className="empty-state-title">No projects</div>
                                    <div className="empty-state-desc">Start by creating a new delivery workflow.</div>
                                </div>
                            ) : viewMode === 'list' ? (
                                <div className="list-area" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                    {!selectedProject && (
                                        <div className="universal-grid grid-table grid-header">
                                            <div className="grid-col col-main">Project Name</div>
                                            <div className="grid-col">Client Account</div>
                                            <div className="grid-col">Account Manager</div>
                                            <div className="grid-col right">Status & Due Date</div>
                                        </div>
                                    )}
                                    <div style={{ flex: 1, overflowY: 'auto' }}>
                                        {filteredProjects.map((p: Project) => (
                                            <div
                                                key={p.id}
                                                className="universal-grid grid-table grid-row"
                                                onClick={() => handleSelectProject(p)}
                                            >
                                                <div className="grid-col col-main">
                                                    <div className="avatar" style={{ background: avatarColor(p.project_name || p.id), width: 34, height: 34, fontSize: '0.86rem' }}>
                                                        {initials(p.project_name)}
                                                    </div>
                                                    <div className="sender-info">
                                                        <div className="sender-name">{p.project_name}</div>
                                                        <div className="sender-email">{p.client?.name || 'Unknown'}</div>
                                                    </div>
                                                </div>

                                                <div className="grid-col secondary">
                                                    {p.sourceEmail?.gmail_accounts?.email || 'No Linked Account'}
                                                </div>

                                                <div className="grid-col muted">
                                                    <span className="badge badge-gray" style={{ fontSize: '11px' }}>{p.manager?.name || 'Unassigned'}</span>
                                                </div>

                                                <div className="grid-col right">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                            <span className={`badge ${p.paid_status === 'PAID' ? 'badge-green' : p.paid_status === 'PARTIALLY_PAID' ? 'badge-yellow' : 'badge-red'}`} style={{ fontSize: '10px' }}>
                                                                {p.paid_status.replace('_', ' ')}
                                                            </span>
                                                            {!selectedProject && (
                                                                <span className={`badge ${p.priority === 'URGENT' ? 'badge-red' : p.priority === 'HIGH' ? 'badge-yellow' : p.priority === 'MEDIUM' ? 'badge-blue' : 'badge-green'}`} style={{ fontSize: '10px' }}>
                                                                    {p.priority}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="muted" style={{ width: 80, fontSize: '0.72rem', textAlign: 'right' }}>
                                                            {formatDate(p.due_date)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : viewMode === 'grid' ? (
                                <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem', overflowY: 'auto' }}>
                                    {filteredProjects.map((p: Project) => (
                                        <div
                                            key={p.id}
                                            className="project-card-premium"
                                            onClick={() => handleSelectProject(p)}
                                            style={{
                                                background: 'var(--bg-surface)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '16px',
                                                padding: '1.5rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                boxShadow: 'var(--shadow-sm)'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {p.project_name}
                                                </h3>
                                                <span className={`badge priority-${(p.priority || 'MEDIUM').toLowerCase()}`} style={{ fontSize: '10px', fontWeight: 700 }}>
                                                    {p.priority || 'MEDIUM'}
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                                    Manager: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.manager?.name || 'Unassigned'}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                                                    Account: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.sourceEmail?.gmail_accounts?.email || 'No Linked Account'}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                                                    Due Date: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatDate(p.due_date)}</span>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                                                <span className={`badge ${p.paid_status === 'PAID' ? 'badge-green' : p.paid_status === 'PARTIALLY_PAID' ? 'badge-yellow' : 'badge-red'}`} style={{ fontSize: '10px', fontWeight: 800 }}>
                                                    {p.paid_status?.replace('_', ' ') || 'UNPAID'}
                                                </span>
                                                {p.client?.name && (
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.client.name}>
                                                        {p.client.name}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="board-view" style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem', overflowX: 'auto', flex: 1, minHeight: 0 }}>
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
                                                        <div className="card-title">{p.project_name}</div>
                                                        <div className="card-client">{p.client?.name}</div>
                                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-accent)', marginBottom: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {p.sourceEmail?.gmail_accounts?.email || 'No Linked Account'}
                                                        </div>
                                                        <div className="card-footer">
                                                            <div className="card-date">
                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M8 2v4M3 10h18" /><rect x="3" y="4" width="18" height="18" rx="2" /></svg>
                                                                {formatDate(p.due_date)}
                                                            </div>
                                                            <div className="card-avatar">{(p.manager?.name?.[0] || '?').toUpperCase()}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Detail Panel */
                        <div className="detail-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', minWidth: 0, overflow: 'hidden' }}>
                            {/* Detail Header */}
                            <div className="detail-header">
                                <div className="detail-actions">
                                    <div className="detail-actions-left">
                                        <button className="icon-btn" onClick={() => { setSelectedProject(null); setSelectedEmail(null); }} title="Back to list">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M19 12H5M12 19l-7-7 7-7" />
                                            </svg>
                                        </button>
                                        <div className="divider-v" />
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                                {selectedProject.project_name}
                                            </h2>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {selectedProject.client?.name || 'Loading client...'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="detail-actions-right">
                                        {selectedProject.project_link && (
                                            <button className="icon-btn" title="Open Project Link" onClick={() => window.open(selectedProject.project_link, '_blank')}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" /></svg>
                                            </button>
                                        )}
                                        <div className="divider-v" />
                                        <button className="btn btn-secondary btn-sm" onClick={() => handleSync()}>Refresh</button>
                                    </div>
                                </div>
                            </div>

                            {!selectedEmail && (
                                <div className="tabs-bar">
                                    <div
                                        className={`tab ${activeTab === 'details' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('details')}
                                    >
                                        Overview
                                    </div>
                                    <div
                                        className={`tab ${activeTab === 'emails' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('emails')}
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
                                        onForward={() => setIsComposeOpen(true)}
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
                                    <div className="inner-list-panel" style={{ display: 'flex', flexDirection: 'column', margin: '-1.5rem', width: 'calc(100% + 3rem)', minHeight: '500px' }}>
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
                                                    <button className="icon-btn sm danger" title="Delete selected" onClick={handleBulkDelete}>
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                                    </button>
                                                )}
                                                <div className="divider-v" />
                                                <button className="icon-btn sm" title="Mark Read" onClick={handleBulkMarkRead} disabled={selectedEmailIds.size === 0}>
                                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                        <circle cx="12" cy="12" r="3" />
                                                    </svg>
                                                </button>
                                            </div>
                                            <div className="list-toolbar-right">
                                                {projectEmails.length > 0 && (
                                                    <span className="count-label">
                                                        1–{projectEmails.length} of {projectEmails.length}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div id="project-email-list-scroll" style={{ flex: 1, overflowY: 'auto' }}>
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
                                                <div className="empty-state" style={{ paddingTop: '3rem' }}>
                                                    <div className="spinner" />
                                                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 8 }}>Loading emails...</span>
                                                </div>
                                            ) : projectEmails.length === 0 ? (
                                                <div className="empty-state" style={{ paddingTop: '3rem' }}>
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
            </main >

            {/* Create Project Modal */}
            {
                isCreateModalOpen && (
                    <AddProjectModal
                        clients={clients}
                        onClose={() => setIsCreateModalOpen(false)}
                        onCreated={() => {
                            setIsCreateModalOpen(false);
                            loadData();
                        }}
                    />
                )
            }

            {isComposeOpen && <ComposeModal onClose={() => setIsComposeOpen(false)} />}

            <style>{`
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
                .tile-client, .tile-date { display: flex; alignItems: center; gap: 0.5rem; font-size: 0.775rem; color: var(--text-muted); }
                .tile-client svg, .tile-date svg { color: var(--text-tertiary); }
                
                .tile-footer { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 0.75rem; border-top: 1px solid var(--border); }
                .tile-avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--bg-tertiary); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; border: 1px solid var(--border); }

                .board-view { background: var(--bg-base); flex: 1; display: flex; overflow-x: auto; }
                .board-column { flex: 0 0 280px; display: flex; flex-direction: column; background: var(--bg-elevated); border-radius: var(--radius-lg); border: 1px solid var(--border); max-height: 100%; }
                .column-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); background: var(--bg-surface); border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
                .column-title { font-weight: 700; font-size: 0.8125rem; text-transform: uppercase; letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center; color: var(--text-muted); }
                .column-count { background: var(--bg-tertiary); padding: 2px 8px; borderRadius: 10px; font-size: 0.7rem; color: var(--text-secondary); }
                .column-content { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }

                .project-card-premium:hover {
                    border-color: var(--accent) !important;
                    transform: translateY(-4px);
                    box-shadow: 0 12px 24px -10px rgba(0,0,0,0.15) !important;
                }
                
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
        </>
    );
}
