'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import ComposeModal from '../components/ComposeModal';
import AddProjectModal from '../components/AddProjectModal';
import { getClientsAction, getClientProjectsAction, updateClientAction } from '../../src/actions/clientActions';
import { getClientEmailsAction, markClientEmailsAsReadAction, deleteEmailAction, getThreadMessagesAction, markEmailAsReadAction, markEmailAsUnreadAction, bulkDeleteEmailsAction, bulkMarkAsReadAction } from '../../src/actions/emailActions';
import { getManagersAction } from '../../src/actions/projectActions';
import { EmailRow, EmailDetail } from '../components/InboxComponents';
import InlineReply from '../components/InlineReply';
import AddLeadModal from '../components/AddLeadModal';
import { avatarColor, initials, formatDate, cleanPreview } from '../utils/helpers';

const ADMIN_USER_ID = '1ca1464d-1009-426e-96d5-8c5e8c84faac';

let globalClientsCache: any[] | null = null;
let globalManagersCache: any[] | null = null;

export default function ClientsPage() {
    const [clients, setClients] = useState<any[]>(() => globalClientsCache || []);
    const [managers, setManagers] = useState<{ id: string, name: string }[]>(() => globalManagersCache || []);
    const [selectedClient, setSelectedClient] = useState<any>(null);
    const [clientEmails, setClientEmails] = useState<any[]>([]);
    const [clientProjects, setClientProjects] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'emails' | 'projects'>('emails');
    const [isLoading, setIsLoading] = useState(() => !globalClientsCache);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [composeDefaultTo, setComposeDefaultTo] = useState('');
    const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
    const [projectDefaultName, setProjectDefaultName] = useState('');
    const [selectedEmail, setSelectedEmail] = useState<any>(null);
    const [threadMessages, setThreadMessages] = useState<any[]>([]);
    const [isThreadLoading, setIsThreadLoading] = useState(false);
    const [isReplyingInline, setIsReplyingInline] = useState(false);
    const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
    const [isAddClientOpen, setIsAddClientOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'grid' | 'board'>('list');
    const [filterType, setFilterType] = useState<'ALL' | 'LEADS' | 'CLIENTS'>('ALL');

    const loadClients = useCallback(async () => {
        if (!globalClientsCache) setIsLoading(true);
        try {
            const [data, mData] = await Promise.all([
                getClientsAction(),
                getManagersAction()
            ]);
            globalClientsCache = data;
            globalManagersCache = mData;
            setClients(data);
            setManagers(mData);
        } catch (err) {
            console.error('Failed to load clients:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadClients(); }, [loadClients]);

    const handleSelectEmail = async (email: any) => {
        setSelectedEmail(email);
        setThreadMessages([email]);

        if (email.is_unread) {
            setClientEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_unread: false } : e));
            await markEmailAsReadAction(email.id);
        }

        setIsThreadLoading(true);
        try {
            const messages = await getThreadMessagesAction(email.thread_id);
            if (messages && messages.length > 0) {
                setThreadMessages(messages);
            }
        } catch (err) {
            console.error('Failed to load thread:', err);
        } finally {
            setIsThreadLoading(false);
        }
    };

    const handleToggleRead = async (id: string, currentUnread: boolean) => {
        const nextUnread = !currentUnread;
        setClientEmails(prev => prev.map(e => e.id === id ? { ...e, is_unread: nextUnread } : e));
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
        setClientEmails(prev => prev.filter(e => e.id !== id));
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
        if (selectedEmailIds.size > 0 && selectedEmailIds.size === clientEmails.length) {
            setSelectedEmailIds(new Set());
        } else {
            setSelectedEmailIds(new Set(clientEmails.map((e) => e.id)));
        }
    };

    const handleBulkMarkRead = async () => {
        const ids = Array.from(selectedEmailIds);
        if (ids.length === 0) return;
        setClientEmails((prev) => prev.map((e) => selectedEmailIds.has(e.id) ? { ...e, is_unread: false } : e));
        setSelectedEmailIds(new Set());
        await bulkMarkAsReadAction(ids);
    };

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedEmailIds);
        if (ids.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${ids.length} messages?`)) return;
        setClientEmails((prev) => prev.filter((e) => !selectedEmailIds.has(e.id)));
        setSelectedEmailIds(new Set());
        if (selectedEmail && selectedEmailIds.has(selectedEmail.id)) setSelectedEmail(null);
        await bulkDeleteEmailsAction(ids);
    };

    const handleSelectClient = async (client: any) => {
        setSelectedClient(client);
        setClientEmails([]);
        setClientProjects([]);
        setIsDetailLoading(true);
        setActiveTab('emails');

        if (client.unread_count > 0) {
            setClients(prev => prev.map(c => c.id === client.id ? { ...c, unread_count: 0 } : c));
            markClientEmailsAsReadAction(client.email).catch(console.error);
        }

        try {
            const [emails, projects] = await Promise.all([
                getClientEmailsAction(ADMIN_USER_ID, client.email),
                getClientProjectsAction(client.id),
            ]);
            setClientEmails(emails);
            setClientProjects(projects);
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
        <>
            <Sidebar onOpenCompose={() => { setComposeDefaultTo(''); setIsComposeOpen(true); }} />

            <main className="main-area">
                {/* Header Section */}
                <header className="page-header" style={{ padding: '1rem 1.5rem', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Clients</h1>
                            <div className="divider-v" />
                            <div className="search-bar-modern" style={{ position: 'relative', width: 320 }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
                                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search by name, email or manager..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{ width: '100%', height: 38, padding: '0 3rem 0 2.5rem', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.875rem', outline: 'none' }}
                                />
                                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, pointerEvents: 'none' }}>
                                    ⌘K
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <button className="btn btn-primary sm" onClick={() => setIsAddClientOpen(true)}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M12 5v14M5 12h14" /></svg>
                                New Client
                            </button>
                            <div className="avatar-btn">A</div>
                        </div>
                    </div>
                </header>

                {/* Filter Tabs & Toolbar */}
                <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                    <div className="tabs-bar" style={{ padding: '0 1.5rem', borderBottom: 'none' }}>
                        <div className={`tab ${filterType === 'ALL' ? 'active' : ''}`} onClick={() => setFilterType('ALL')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                            All Contacts
                            <span style={{ fontSize: '0.75rem', opacity: 0.5, marginLeft: 2 }}>{clients.length}</span>
                        </div>
                        <div className={`tab ${filterType === 'LEADS' ? 'active' : ''}`} onClick={() => setFilterType('LEADS')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                            Leads
                        </div>
                        <div className={`tab ${filterType === 'CLIENTS' ? 'active' : ''}`} onClick={() => setFilterType('CLIENTS')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                            Active Clients
                        </div>
                    </div>

                    <div className="list-toolbar" style={{ borderTop: '1px solid var(--border-subtle)', padding: '0.6rem 1.5rem' }}>
                        <div className="list-toolbar-left">
                            <span className="count-label" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                Showing {filteredClients.length} results
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
                            <button className="icon-btn sm" onClick={loadClients} title="Refresh">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="content-split" style={{ background: 'var(--bg-base)' }}>
                    {/* Client List */}
                    {!selectedClient ? (
                        <div className="list-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                            {isLoading ? (
                                <div className="empty-state">
                                    <div className="spinner spinner-lg" />
                                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 8 }}>Loading contacts...</span>
                                </div>
                            ) : filteredClients.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-state-icon">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                                        </svg>
                                    </div>
                                    <div className="empty-state-title">No contacts found</div>
                                    <div className="empty-state-desc">Try a different search term or filter.</div>
                                </div>
                            ) : viewMode === 'list' ? (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                    <div className="universal-grid grid-table grid-header" style={{ padding: '0.75rem 1.5rem', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, color: 'var(--text-muted)' }}>
                                        <div className="grid-col col-client">Client / Contact</div>
                                        <div className="grid-col col-account">Latest Gmail Account</div>
                                        <div className="grid-col col-manager">Account Manager</div>
                                        <div className="grid-col col-metrics right">Projects & Activity</div>
                                    </div>
                                    <div style={{ flex: 1, overflowY: 'auto' }}>
                                        {filteredClients.map((client: any) => (
                                            <div
                                                key={client.id}
                                                className={`universal-grid grid-table grid-row ${selectedClient?.id === client.id ? 'selected' : ''} ${client.unread_count > 0 ? 'unread' : ''}`}
                                                onClick={() => handleSelectClient(client)}
                                            >
                                                <div className="grid-col col-client">
                                                    <div className="avatar" style={{ background: avatarColor(client.email || client.name || 'x'), width: 34, height: 34, fontSize: '0.86rem' }}>
                                                        {initials(client.name || client.email || '?')}
                                                    </div>
                                                    <div className="sender-info">
                                                        <div className="sender-name" style={{ fontWeight: 600 }}>{client.name || client.email}</div>
                                                        <div className="sender-email" style={{ fontSize: '0.75rem', opacity: 0.6 }}>{client.email}</div>
                                                    </div>
                                                </div>

                                                <div className="grid-col col-account" style={{ fontSize: '0.8125rem' }}>
                                                    {client.account_email && client.account_email !== 'No Recent Mail' ? (
                                                        <span style={{ color: 'var(--text-secondary)' }}>{client.account_email}</span>
                                                    ) : (
                                                        <span style={{ opacity: 0.3 }}>—</span>
                                                    )}
                                                </div>

                                                <div className="grid-col col-manager">
                                                    <span className="badge badge-gray" style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                                                        {client.manager_name || 'Unassigned'}
                                                    </span>
                                                </div>

                                                <div className="grid-col col-metrics right">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-end' }}>
                                                        {client.project_count > 0 && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
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
                                <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem', overflowY: 'auto' }}>
                                    {filteredClients.map((client: any) => (
                                        <div
                                            key={client.id}
                                            className={`client-tile-card ${selectedClient?.id === client.id ? 'selected' : ''} ${client.unread_count > 0 ? 'unread' : ''}`}
                                            onClick={() => handleSelectClient(client)}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <div className="avatar" style={{ background: avatarColor(client.email || client.name || 'x'), width: 44, height: 44, fontSize: '1rem' }}>
                                                    {initials(client.name || client.email || '?')}
                                                </div>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontWeight: 700, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</div>
                                                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.email}</div>
                                                </div>
                                            </div>
                                            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <span className="badge badge-gray" style={{ fontSize: '0.7rem', fontWeight: 600 }}>{client.manager_name}</span>
                                                {client.account_email && client.account_email !== 'No Recent Mail' && (
                                                    <span className="badge badge-gray" style={{ fontSize: '0.7rem', opacity: 0.7 }}>{client.account_email}</span>
                                                )}
                                                {client.pipeline_stage && (
                                                    <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{client.pipeline_stage}</span>
                                                )}
                                                {client.project_count > 0 && (
                                                    <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>{client.project_count} Projects</span>
                                                )}
                                            </div>
                                            {client.unread_count > 0 && (
                                                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                                                    <span className="nav-badge">{client.unread_count}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="board-view" style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem', overflowX: 'auto', flex: 1, minHeight: 0 }}>
                                    {(['COLD_LEAD', 'LEAD', 'OFFER_ACCEPTED', 'WON', 'CLOSED'] as const).map(stage => (
                                        <div key={stage} className="board-column">
                                            <div className="column-header">
                                                <div className="column-title">
                                                    {stage.replace('_', ' ')}
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
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <div className="avatar" style={{ background: avatarColor(client.email || client.name || 'x'), width: 28, height: 28, fontSize: '0.75rem' }}>
                                                                {initials(client.name || client.email || '?')}
                                                            </div>
                                                            <div style={{ minWidth: 0 }}>
                                                                <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.email}</div>
                                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-accent)', marginTop: 2, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {client.manager_name}
                                                                    {client.account_email && client.account_email !== 'No Recent Mail' && ` • ${client.account_email}`}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {client.project_count > 0 && (
                                                            <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                                                <span>Projects</span>
                                                                <span style={{ fontWeight: 700 }}>{client.project_count}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (

                        /* Client Detail */
                        <div className="detail-panel">
                            {/* Detail Header */}
                            <div className="detail-header" style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                                <div className="detail-actions" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div className="detail-actions-left" style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                                        <button className="icon-btn sm" onClick={() => setSelectedClient(null)} title="Back" style={{ width: 32, height: 32, borderRadius: '8px' }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M19 12H5M12 19l-7-7 7-7" />
                                            </svg>
                                        </button>
                                        <div className="divider-v" style={{ height: 20 }} />
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client Profile</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <button
                                            className="btn btn-secondary sm"
                                            onClick={() => { setProjectDefaultName(''); setIsAddProjectOpen(true); }}
                                            style={{ height: 34, padding: '0 1rem', borderRadius: '8px' }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M12 5v14M5 12h14" /></svg>
                                            Project
                                        </button>
                                        <button
                                            className="btn btn-primary sm"
                                            onClick={() => { setComposeDefaultTo(selectedClient.email); setIsComposeOpen(true); }}
                                            style={{ height: 34, padding: '0 1rem', borderRadius: '8px' }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                            Message
                                        </button>
                                    </div>
                                </div>

                                <div className="detail-client-hero" style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '0.5rem' }}>
                                    <div className="avatar-hero" style={{
                                        background: avatarColor(selectedClient.email || selectedClient.name || 'x'),
                                        width: 72, height: 72, fontSize: '1.75rem', borderRadius: '20px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                    }}>
                                        {initials(selectedClient.name || selectedClient.email || '?')}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                            <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                                                {selectedClient.name || selectedClient.email}
                                            </h1>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <span className={`badge ${selectedClient.status === 'ACTIVE' ? 'badge-green' : 'badge-gray'}`} style={{ borderRadius: '6px', fontWeight: 700, fontSize: '10px' }}>
                                                    {selectedClient.pipeline_stage || 'CLIENT'}
                                                </span>
                                                {selectedClient.project_count > 0 && (
                                                    <span className="badge badge-purple" style={{ borderRadius: '6px', fontWeight: 700, fontSize: '10px' }}>{selectedClient.project_count} PROJECTS</span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginTop: '0.75rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                                                {selectedClient.email}
                                            </div>
                                            <div className="divider-v" style={{ height: 12, background: 'var(--border-subtle)' }} />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                                <select
                                                    className="manager-select-modern"
                                                    style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', padding: 0, outline: 'none' }}
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
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
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
                            <div className="tabs-bar" style={{ padding: '0 2rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                                <div
                                    className={`tab ${activeTab === 'emails' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('emails')}
                                    style={{ padding: '0.875rem 0', display: 'flex', alignItems: 'center', gap: '0.625rem' }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                                    <span style={{ fontWeight: 600 }}>Emails</span>
                                    {clientEmails.length > 0 && <span className="tab-count" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: '0.7rem' }}>{clientEmails.length}</span>}
                                </div>
                                <div
                                    className={`tab ${activeTab === 'projects' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('projects')}
                                    style={{ padding: '0.875rem 0', display: 'flex', alignItems: 'center', gap: '0.625rem' }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 3h18v18H3zM9 3v18m6-18v18" /></svg>
                                    <span style={{ fontWeight: 600 }}>Projects</span>
                                    {clientProjects.length > 0 && <span className="tab-count" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: '0.7rem' }}>{clientProjects.length}</span>}
                                </div>
                            </div>

                            {/* Tab Content */}
                            <div style={{ flex: 1, overflowY: 'auto', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                {isDetailLoading ? (
                                    <div className="empty-state" style={{ paddingTop: '3rem' }}>
                                        <div className="spinner spinner-lg" />
                                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 8 }}>Loading details...</span>
                                    </div>
                                ) : activeTab === 'emails' ? (
                                    <div className="inner-split" style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative', overflow: 'hidden' }}>
                                        {!selectedEmail ? (
                                            <div className="inner-list-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
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
                                                        {clientEmails.length > 0 && (
                                                            <span className="count-label">
                                                                1–{clientEmails.length} of {clientEmails.length}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div id="client-email-list-scroll" style={{ flex: 1, overflowY: 'auto' }}>
                                                    <div className="universal-grid grid-inbox grid-header">
                                                        <div className="grid-col" />
                                                        <div className="grid-col">Sender</div>
                                                        <div className="grid-col">Subject / Preview</div>
                                                        <div className="grid-col">Gmail Account</div>
                                                        <div className="grid-col">Manager</div>
                                                        <div className="grid-col right">Date</div>
                                                    </div>
                                                    {clientEmails.length === 0 ? (
                                                        <div className="empty-state" style={{ paddingTop: '3rem' }}>
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
                                                            />
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="inner-detail-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                <EmailDetail
                                                    email={selectedEmail}
                                                    threadMessages={threadMessages}
                                                    isThreadLoading={isThreadLoading}
                                                    isReplyingInline={isReplyingInline}
                                                    onBack={() => setSelectedEmail(null)}
                                                    onStageChange={() => { }}
                                                    onReply={() => setIsReplyingInline(true)}
                                                    onForward={() => setIsComposeOpen(true)}
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
                                    <div className="inner-projects" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
                                        {clientProjects.length === 0 ? (
                                            <div className="empty-state" style={{ paddingTop: '5rem' }}>
                                                <div className="empty-state-icon" style={{ background: 'var(--bg-elevated)', padding: '1.5rem', borderRadius: '50%' }}>
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
                                            <div style={{ padding: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem', overflowY: 'auto' }}>
                                                {clientProjects.map((project: any) => (
                                                    <div
                                                        key={project.id}
                                                        className="project-card-premium"
                                                        onClick={() => window.location.href = `/projects?project_id=${project.id}`}
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
                                                            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                                                                {project.project_name}
                                                            </h3>
                                                            <span className={`badge priority-${(project.priority || 'MEDIUM').toLowerCase()}`} style={{ fontSize: '10px', fontWeight: 700 }}>
                                                                {project.priority || 'MEDIUM'}
                                                            </span>
                                                        </div>

                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                                                Manager: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedClient?.manager_name || 'Unassigned'}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                                                                Account: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedClient?.account_email || 'No Account'}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                                                                Due Date: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatDate(project.due_date)}</span>
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                                                            <span className={`badge ${project.paid_status === 'PAID' ? 'badge-green' : project.paid_status === 'PARTIALLY_PAID' ? 'badge-yellow' : 'badge-red'}`} style={{ fontSize: '10px', fontWeight: 800 }}>
                                                                {project.paid_status?.replace('_', ' ') || 'UNPAID'}
                                                            </span>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Details</span>
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
            </main>

            {isComposeOpen && (
                <ComposeModal
                    onClose={() => setIsComposeOpen(false)}
                    defaultTo={composeDefaultTo}
                />
            )}

            {isAddClientOpen && (
                <AddLeadModal
                    onClose={() => setIsAddClientOpen(false)}
                    onAddLead={(lead) => {
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

            <style>{`
                .list-toolbar { padding: 0.75rem 1.5rem; border-bottom: 1px solid var(--border); background: var(--bg-surface); display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; }
                .list-toolbar-right { display: flex; align-items: center; gap: 1rem; }
                .filter-tabs { display: flex; gap: 0.5rem; }
                .filter-tab { padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 500; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-md); transition: all 0.2s; border: 1px solid transparent; }
                .filter-tab:hover { background: var(--bg-hover); color: var(--text-secondary); }
                .filter-tab.active { background: var(--accent-light); color: var(--accent); }
                
                .search-input { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.625rem 1rem; color: var(--text-primary); font-size: 0.875rem; width: 280px; transition: all 0.2s; outline: none; }
                .search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-light); }
                
                .view-mode-switcher { display: flex; background: var(--bg-tertiary); padding: 3px; border-radius: var(--radius-md); gap: 2px; }
                .view-btn { padding: 0.5rem; display: flex; align-items: center; justify-content: center; border-radius: 6px; color: var(--text-muted); cursor: pointer; transition: all 0.2s; border: none; background: transparent; }
                .view-btn:hover { color: var(--text-secondary); background: var(--bg-hover); }
                .view-btn.active { color: var(--accent); background: var(--bg-surface); box-shadow: var(--shadow-sm); }

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

                .project-card-premium:hover {
                    border-color: var(--accent) !important;
                    transform: translateY(-4px);
                    box-shadow: 0 12px 24px -10px rgba(0,0,0,0.15);
                }
                .manager-select-modern:hover {
                    color: var(--accent) !important;
                }
                .manager-select-modern option {
                    background: var(--bg-surface);
                    color: var(--text-primary);
                }
                
                .detail-header .divider-v {
                    background: var(--border-subtle);
                    width: 1px;
                }
                
                .inner-list-panel .list-toolbar {
                    background: var(--bg-surface);
                    border-top: none;
                    padding: 0.75rem 1.75rem;
                }
                
                .avatar-hero {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .avatar-hero:hover {
                    transform: scale(1.05) rotate(2deg);
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
        </>
    );
}
