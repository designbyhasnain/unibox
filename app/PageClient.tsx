'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useUI } from './context/UIContext';
import InlineReply from './components/InlineReply';
import { EmailRow, EmailDetail, PaginationControls, ToastStack } from './components/InboxComponents';
import { PageLoader } from './components/LoadingStates';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
    updateEmailStageAction,
    markAsNotInterestedAction,
    bulkUpdateStageAction,
    bulkMarkReadAction,
    bulkMarkUnreadAction,
} from '../src/actions/emailActions';
import { useMailbox } from './hooks/useMailbox';
import { useGlobalFilter } from './context/FilterContext';
import { shouldShowStageBadge, STAGE_OPTIONS } from './constants/stages';
import { useHydrated } from './utils/useHydration';
import { RefreshCw, Mail, Send, Trash2, Eye, EyeOff, X } from 'lucide-react';

const PAGE_SIZE = 50;

interface ToastItem { id: string; subject: string; from: string; }

export default function InboxPage() {
    const isHydrated = useHydrated();
    const { selectedAccountId, setSelectedAccountId, accounts } = useGlobalFilter();

    const [activeTab, setActiveTab] = useState<'inbox' | 'sent'>('inbox');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchResults, setIsSearchResults] = useState(false);

    const mailboxType = isSearchResults ? 'search' : activeTab === 'sent' ? 'sent' : 'inbox';

    const {
        emails,
        totalCount,
        totalPages,
        currentPage,
        isLoading,
        tabCounts,
        selectedEmail,
        threadMessages,
        isThreadLoading,
        selectedEmailIds,
        isSyncing,
        syncMessage,
        setSelectedEmail,
        setCurrentPage,
        loadEmails,
        handleSync,
        handleSelectEmail,
        toggleSelectEmail,
        toggleSelectAll,
        handleBulkDelete,
        prefetchThread,
        isIdle,
        handleResume,
    } = useMailbox({
        type: mailboxType,
        activeStage: 'ALL',
        searchTerm,
        selectedAccountId,
        enabled: !isSearchResults || !!searchTerm,
        accounts
    });

    const { setComposeOpen, setComposeDefaultTo, setComposeDefaultSubject, setComposeDefaultBody } = useUI();
    const [isReplyingInline, setIsReplyingInline] = useState(false);
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [bulkLoading, setBulkLoading] = useState(false);

    const handleBulkStageChange = async (stage: string) => {
        if (selectedEmailIds.size === 0) return;
        setBulkLoading(true);
        try {
            const contactIds = emails
                .filter((e: any) => selectedEmailIds.has(e.id) && e.contact_id)
                .map((e: any) => e.contact_id);
            const unique = [...new Set(contactIds)];
            if (unique.length > 0) {
                await bulkUpdateStageAction(unique, stage);
            }
            loadEmails(currentPage);
        } catch (e) { console.error('Bulk stage change failed:', e); }
        setBulkLoading(false);
    };

    const handleBulkRead = async () => {
        if (selectedEmailIds.size === 0) return;
        setBulkLoading(true);
        try {
            await bulkMarkReadAction([...selectedEmailIds]);
            loadEmails(currentPage);
        } catch (e) { console.error('Bulk mark read failed:', e); }
        setBulkLoading(false);
    };

    const handleBulkUnread = async () => {
        if (selectedEmailIds.size === 0) return;
        setBulkLoading(true);
        try {
            await bulkMarkUnreadAction([...selectedEmailIds]);
            loadEmails(currentPage);
        } catch (e) { console.error('Bulk mark unread failed:', e); }
        setBulkLoading(false);
    };

    const [pollingInterval, setPollingInterval] = useState(300);
    const [isPollingEnabled, setIsPollingEnabled] = useState(true);

    useEffect(() => {
        try {
            const pi = localStorage.getItem('settings_polling_interval');
            if (pi) setPollingInterval(parseInt(pi, 10));
            const pe = localStorage.getItem('settings_polling_enabled');
            if (pe !== null) setIsPollingEnabled(pe === 'true');
        } catch {}
    }, []);

    const toastTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const handleSyncRef = useRef(handleSync);

    useEffect(() => {
        handleSyncRef.current = handleSync;
    }, [handleSync]);

    useEffect(() => {
        return () => {
            toastTimerRef.current.forEach((timer) => clearTimeout(timer));
            toastTimerRef.current.clear();
        };
    }, []);

    const handleSearchSubmit = useCallback(async (e?: React.FormEvent | React.KeyboardEvent) => {
        if (e) e.preventDefault();
        if (!searchTerm.trim()) return;
        setIsSearchResults(true);
        setSelectedEmail(null);
    }, [searchTerm, setSelectedEmail]);

    useEffect(() => {
        if (!searchTerm.trim()) {
            setIsSearchResults(false);
        }
    }, [searchTerm]);

    const isLive = isHydrated && accounts.length > 0;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelectedEmail(null);
            if (e.key === 'c' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName === 'BODY') {
                setComposeDefaultTo('');
                setComposeDefaultSubject('');
                setComposeDefaultBody('');
                setComposeOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setSelectedEmail]);

    useEffect(() => {
        const handleNavReset = () => {
            setSelectedEmail(null);
            setSearchTerm('');
            setIsSearchResults(false);
        };
        window.addEventListener('nav-reset', handleNavReset);
        return () => window.removeEventListener('nav-reset', handleNavReset);
    }, [setSelectedEmail]);

    useEffect(() => {
        if (!isPollingEnabled || activeTab !== 'inbox') return;
        const intervalMs = pollingInterval * 1000;
        const id = setInterval(() => {
            handleSyncRef.current();
        }, intervalMs);
        return () => clearInterval(id);
    }, [isPollingEnabled, pollingInterval, activeTab]);

    const goToPage = (page: number) => {
        setCurrentPage(page);
        loadEmails(page);
        const el = document.getElementById('email-list-scroll');
        if (el) el.scrollTop = 0;
    };

    const handleChangeStage = async (messageId: string, newStage: string) => {
        try {
            await updateEmailStageAction(messageId, newStage);
            loadEmails(currentPage);
        } catch (err) {
            console.error('Stage change failed:', err);
            const toastId = `error-${Date.now()}`;
            setToasts(prev => [...prev, { id: toastId, subject: 'Failed to change stage', from: 'Please try again' }]);
            const timer = setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 4000);
            toastTimerRef.current.set(toastId, timer);
        }
    };

    const handleNotInterested = async (senderEmail: string) => {
        if (!senderEmail) return;
        try {
            await markAsNotInterestedAction(senderEmail);
            loadEmails(currentPage);
        } catch (err) {
            console.error('Mark not interested failed:', err);
            const toastId = `error-${Date.now()}`;
            setToasts(prev => [...prev, { id: toastId, subject: 'Failed to mark as not interested', from: 'Please try again' }]);
            const timer = setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 4000);
            toastTimerRef.current.set(toastId, timer);
        }
    };

    const dismissToast = (toastId: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
        const timer = toastTimerRef.current.get(toastId);
        if (timer) clearTimeout(timer);
        toastTimerRef.current.delete(toastId);
    };

    const handleTabSwitch = (tab: 'inbox' | 'sent') => {
        setActiveTab(tab);
        setSelectedEmail(null);
        setSearchTerm('');
        setIsSearchResults(false);
    };

    const inboxCount = isHydrated ? Object.values(tabCounts).reduce((sum, c) => sum + (c || 0), 0) : 0;

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=DM+Mono:wght@400;500&display=swap');
                .inbox-page { font-family: 'DM Sans', system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; flex: 1; min-height: 0; background: #FAFAFA; }
                .inbox-header { padding: 24px 32px 0; display: flex; justify-content: space-between; align-items: center; }
                .inbox-title { font-size: 24px; font-weight: 700; color: #0F172A; margin: 0; letter-spacing: -0.02em; }
                .inbox-header-right { display: flex; align-items: center; gap: 12px; }
                .inbox-status { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: #64748B; padding: 5px 12px; border-radius: 20px; background: #F1F5F9; }
                .inbox-status-dot { width: 6px; height: 6px; border-radius: 50%; background: #94A3B8; }
                .inbox-status-dot.live { background: #22C55E; box-shadow: 0 0 0 2px rgba(34,197,94,.2); }
                .inbox-sync { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #E2E8F0; background: #fff; color: #94A3B8; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .2s; }
                .inbox-sync:hover { border-color: #CBD5E1; color: #64748b; }
                .inbox-sync-spin { animation: inbox-spin .8s linear infinite; }
                @keyframes inbox-spin { to { transform: rotate(360deg); } }

                .inbox-tabs { display: flex; gap: 0; padding: 16px 32px 0; border-bottom: 1px solid #E2E8F0; }
                .inbox-tab { padding: 10px 20px 12px; font-size: 13px; font-weight: 500; color: #64748B; cursor: pointer; border: none; background: none; display: flex; align-items: center; gap: 8px; position: relative; transition: color .15s; font-family: 'DM Sans', system-ui, sans-serif; }
                .inbox-tab:hover { color: #0F172A; }
                .inbox-tab-active { color: #0F172A; font-weight: 600; }
                .inbox-tab-active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px; background: #0F172A; border-radius: 2px 2px 0 0; }
                .inbox-tab-count { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 10px; background: #E2E8F0; color: #64748B; min-width: 18px; text-align: center; }
                .inbox-tab-active .inbox-tab-count { background: #0F172A; color: #fff; }

                .inbox-toolbar { display: flex; align-items: center; padding: 8px 32px; border-bottom: 1px solid #F1F5F9; gap: 8px; min-height: 44px; }
                .inbox-toolbar-left { display: flex; align-items: center; gap: 8px; }
                .inbox-toolbar-right { margin-left: auto; font-size: 12px; color: #94A3B8; font-weight: 500; }
                .inbox-check { width: 16px; height: 16px; border-radius: 3px; border: 1.5px solid #CBD5E1; cursor: pointer; appearance: none; -webkit-appearance: none; transition: all .15s; }
                .inbox-check:checked { background: #0F172A; border-color: #0F172A; }
                .inbox-check:checked::after { content: ''; display: block; width: 4px; height: 7px; border: solid #fff; border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); margin: 1px 0 0 4px; }
                .inbox-divider { width: 1px; height: 20px; background: #E2E8F0; }
                .inbox-toolbar-btn { width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent; color: #94A3B8; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .15s; }
                .inbox-toolbar-btn:hover { background: #F1F5F9; color: #64748B; }
                .inbox-toolbar-btn:disabled { opacity: .3; cursor: not-allowed; }

                .inbox-bulk-bar { display: flex; align-items: center; gap: 10px; padding: 8px 32px; background: rgba(15,23,42,.03); border-bottom: 1px solid #E2E8F0; }
                .inbox-bulk-count { font-size: 12px; font-weight: 600; color: #0F172A; }
                .inbox-bulk-btn { padding: 5px 12px; border-radius: 6px; border: 1px solid #E2E8F0; background: #fff; font-size: 11px; font-weight: 500; color: #64748B; cursor: pointer; transition: all .15s; font-family: 'DM Sans', system-ui, sans-serif; }
                .inbox-bulk-btn:hover { border-color: #CBD5E1; color: #0F172A; }
                .inbox-bulk-select { padding: 5px 12px; border-radius: 6px; border: 1px solid #E2E8F0; background: #fff; font-size: 11px; color: #64748B; cursor: pointer; font-family: 'DM Sans', system-ui, sans-serif; }

                .inbox-list { flex: 1; overflow-y: auto; }
                .inbox-empty { text-align: center; padding: 80px 20px; }
                .inbox-empty-icon { width: 56px; height: 56px; border-radius: 50%; margin: 0 auto 16px; background: linear-gradient(135deg, #F1F5F9, #E2E8F0); display: flex; align-items: center; justify-content: center; }
                .inbox-empty-title { font-size: 17px; font-weight: 600; color: #0F172A; margin-bottom: 4px; }
                .inbox-empty-desc { font-size: 13px; color: #94A3B8; line-height: 1.5; }
                .inbox-empty-btn { margin-top: 16px; padding: 8px 16px; border-radius: 8px; border: 1px solid #E2E8F0; background: #fff; font-size: 13px; font-weight: 500; color: #64748B; cursor: pointer; font-family: 'DM Sans', system-ui, sans-serif; transition: all .15s; }
                .inbox-empty-btn:hover { border-color: #CBD5E1; color: #0F172A; }

                .inbox-idle-banner { display: flex; align-items: center; gap: 10px; padding: 10px 32px; background: #FFFBEB; border-bottom: 1px solid #FDE68A; color: #92400E; font-size: 13px; font-weight: 500; }
                .inbox-idle-resume { margin-left: auto; padding: 5px 14px; background: #F59E0B; color: #fff; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', system-ui, sans-serif; }
                .inbox-idle-resume:hover { background: #D97706; }

                .inbox-search-wrap { padding: 16px 32px 0; }
                .inbox-search { display: flex; align-items: center; gap: 10px; padding: 0 14px; height: 40px; border-radius: 10px; background: #F1F5F9; border: 1px solid transparent; transition: all .2s; }
                .inbox-search:focus-within { background: #fff; border-color: #CBD5E1; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
                .inbox-search input { flex: 1; border: none; background: none; outline: none; font-size: 13px; font-family: 'DM Sans', system-ui, sans-serif; color: #0F172A; }
                .inbox-search input::placeholder { color: #94A3B8; }
                .inbox-search-icon { color: #94A3B8; flex-shrink: 0; }
                .inbox-search-clear { width: 24px; height: 24px; border-radius: 50%; border: none; background: transparent; color: #94A3B8; cursor: pointer; display: flex; align-items: center; justify-content: center; }
                .inbox-search-clear:hover { background: #E2E8F0; color: #64748B; }

                .inbox-sync-msg { font-size: 12px; color: #94A3B8; display: flex; align-items: center; gap: 6px; }
            `}</style>

            <div className="inbox-page">
                <ToastStack toasts={toasts} onDismiss={dismissToast} />

                {isIdle && (
                    <div className="inbox-idle-banner" role="alert">
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                        <span>Sync paused due to inactivity</span>
                        <button className="inbox-idle-resume" onClick={handleResume}>Resume</button>
                    </div>
                )}

                <div className="inbox-header">
                    <h1 className="inbox-title">Mail</h1>
                    <div className="inbox-header-right">
                        {isSyncing && (
                            <div className="inbox-sync-msg">
                                <div className="action-spin" style={{ width: 14, height: 14 }}>
                                    <RefreshCw size={14} />
                                </div>
                                <span>{syncMessage || 'Syncing...'}</span>
                            </div>
                        )}
                        <div className="inbox-status">
                            <div className={`inbox-status-dot ${isLive ? 'live' : ''}`} />
                            <span>{isLive ? 'Live' : 'Connecting'}</span>
                        </div>
                        <button
                            className={`inbox-sync ${isSyncing ? 'inbox-sync-spin' : ''}`}
                            onClick={handleSync}
                            disabled={isSyncing}
                            title="Refresh"
                        >
                            <RefreshCw size={15} />
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="inbox-search-wrap">
                    <div className="inbox-search">
                        <svg className="inbox-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                        <input
                            type="text"
                            placeholder="Search mail..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(e); }}
                        />
                        {searchTerm && (
                            <button className="inbox-search-clear" onClick={() => { setSearchTerm(''); setIsSearchResults(false); loadEmails(1); }}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="inbox-tabs">
                    <button
                        className={`inbox-tab ${activeTab === 'inbox' && !isSearchResults ? 'inbox-tab-active' : ''}`}
                        onClick={() => handleTabSwitch('inbox')}
                    >
                        <Mail size={15} />
                        Inbox
                        {inboxCount > 0 && <span className="inbox-tab-count">{inboxCount > 999 ? '999+' : inboxCount}</span>}
                    </button>
                    <button
                        className={`inbox-tab ${activeTab === 'sent' && !isSearchResults ? 'inbox-tab-active' : ''}`}
                        onClick={() => handleTabSwitch('sent')}
                    >
                        <Send size={14} />
                        Sent
                    </button>
                    {isSearchResults && (
                        <button className="inbox-tab inbox-tab-active">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                            Results
                        </button>
                    )}
                </div>

                {/* Content */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    {!selectedEmail ? (
                        <>
                            {/* Toolbar */}
                            <div className="inbox-toolbar">
                                <div className="inbox-toolbar-left">
                                    <input
                                        type="checkbox"
                                        className="inbox-check"
                                        checked={selectedEmailIds.size > 0 && selectedEmailIds.size === emails.length}
                                        onChange={toggleSelectAll}
                                    />
                                    <div className="inbox-divider" />
                                    <button className="inbox-toolbar-btn" onClick={handleSync} disabled={isSyncing} title="Refresh">
                                        <RefreshCw size={14} />
                                    </button>
                                </div>
                                <div className="inbox-toolbar-right">
                                    {isHydrated && totalCount > 0 && (
                                        <span>{(currentPage - 1) * PAGE_SIZE + 1}&ndash;{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}</span>
                                    )}
                                </div>
                            </div>

                            {/* Bulk action bar */}
                            {selectedEmailIds.size > 0 && (
                                <div className="inbox-bulk-bar">
                                    <span className="inbox-bulk-count">{selectedEmailIds.size} selected</span>
                                    {activeTab === 'inbox' && (
                                        <select
                                            className="inbox-bulk-select"
                                            onChange={(e) => { if (e.target.value) handleBulkStageChange(e.target.value); e.target.value = ''; }}
                                            defaultValue=""
                                            disabled={bulkLoading}
                                        >
                                            <option value="" disabled>Move to...</option>
                                            {STAGE_OPTIONS.map((s: any) => (
                                                <option key={s.value} value={s.value}>{s.label}</option>
                                            ))}
                                        </select>
                                    )}
                                    <button className="inbox-bulk-btn" onClick={handleBulkRead} disabled={bulkLoading}>
                                        <Eye size={12} style={{ marginRight: 4 }} /> Read
                                    </button>
                                    <button className="inbox-bulk-btn" onClick={handleBulkUnread} disabled={bulkLoading}>
                                        <EyeOff size={12} style={{ marginRight: 4 }} /> Unread
                                    </button>
                                    <button className="inbox-bulk-btn" onClick={() => handleBulkDelete?.()} disabled={bulkLoading}>
                                        <Trash2 size={12} style={{ marginRight: 4 }} /> Delete
                                    </button>
                                    <button className="inbox-bulk-btn" onClick={() => toggleSelectAll()} style={{ marginLeft: 'auto', color: '#94A3B8' }}>
                                        Deselect
                                    </button>
                                </div>
                            )}

                            {/* Email list */}
                            <div id="email-list-scroll" className="inbox-list">
                                <div className="gmail-list-header">
                                    <div className="gmail-lh-check">
                                        <input type="checkbox" checked={selectedEmailIds.size > 0 && selectedEmailIds.size === emails.length} onChange={() => toggleSelectAll()} style={{ cursor: 'pointer' }} />
                                    </div>
                                    <div className="gmail-lh-star" />
                                    <div className="gmail-lh-sender">{activeTab === 'sent' ? 'TO' : 'FROM'}</div>
                                    <div className="gmail-lh-body">SUBJECT / PREVIEW</div>
                                    <div className="gmail-lh-account">ACCOUNT</div>
                                    <div className="gmail-lh-manager">MANAGER</div>
                                    <div className="gmail-lh-date">DATE</div>
                                </div>
                                <PageLoader isLoading={!isHydrated || isLoading} type="list" count={PAGE_SIZE}>
                                    {emails.length === 0 ? (
                                        <div className="inbox-empty">
                                            <div className="inbox-empty-icon">
                                                {activeTab === 'sent' ? <Send size={24} color="#94A3B8" /> : <Mail size={24} color="#94A3B8" />}
                                            </div>
                                            <div className="inbox-empty-title">
                                                {isSearchResults ? 'No results found' : activeTab === 'sent' ? 'No sent mail' : 'All caught up'}
                                            </div>
                                            <div className="inbox-empty-desc">
                                                {isSearchResults
                                                    ? `No messages matching \u201c${searchTerm}\u201d`
                                                    : activeTab === 'sent'
                                                    ? 'Emails you send will appear here.'
                                                    : 'New messages will appear here.'}
                                            </div>
                                            {selectedAccountId !== 'ALL' && !isSearchResults && (
                                                <button className="inbox-empty-btn" onClick={() => setSelectedAccountId('ALL')}>
                                                    Show all accounts
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        emails.map((email: any) => (
                                            <EmailRow
                                                key={email.id}
                                                email={email}
                                                isSelected={selectedEmail?.id === email.id}
                                                isRowChecked={selectedEmailIds.has(email.id)}
                                                showBadge={shouldShowStageBadge('ALL', email.pipeline_stage, isSearchResults)}
                                                onClick={() => handleSelectEmail(email)}
                                                onToggleSelect={toggleSelectEmail}
                                                onPrefetch={prefetchThread ? () => prefetchThread(email.thread_id) : undefined}
                                            />
                                        ))
                                    )}
                                </PageLoader>
                            </div>

                            <PaginationControls
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalCount={totalCount}
                                pageSize={PAGE_SIZE}
                                onGoToPage={goToPage}
                            />
                        </>
                    ) : (
                        <ErrorBoundary section="Email Detail">
                            <EmailDetail
                                email={selectedEmail}
                                threadMessages={threadMessages}
                                isThreadLoading={isThreadLoading}
                                isReplyingInline={isReplyingInline}
                                onBack={() => setSelectedEmail(null)}
                                onStageChange={handleChangeStage}
                                onReply={() => setIsReplyingInline(true)}
                                onForward={() => {
                                    setComposeDefaultTo('');
                                    setComposeDefaultSubject('Fwd: ' + (selectedEmail.subject || ''));
                                    const fwdBody = `<br/><br/>---------- Forwarded message ----------<br/>From: ${selectedEmail.from_email || ''}<br/>Date: ${new Date(selectedEmail.sent_at).toLocaleString()}<br/>Subject: ${selectedEmail.subject || ''}<br/>To: ${selectedEmail.to_email || ''}<br/><br/>${selectedEmail.body || selectedEmail.snippet || ''}`;
                                    setComposeDefaultBody(fwdBody);
                                    setComposeOpen(true);
                                }}
                                onNotInterested={activeTab === 'inbox' ? handleNotInterested : undefined}
                                totalCount={totalCount}
                                replySlot={
                                    <InlineReply
                                        threadId={selectedEmail.thread_id}
                                        to={selectedEmail.direction === 'SENT'
                                            ? selectedEmail.to_email
                                            : selectedEmail.from_email?.match(/<([^>]+)>/)?.[1] || selectedEmail.from_email}
                                        subject={selectedEmail.subject}
                                        accountId={selectedEmail.gmail_account_id}
                                        onSuccess={() => setIsReplyingInline(false)}
                                        onCancel={() => setIsReplyingInline(false)}
                                    />
                                }
                            />
                        </ErrorBoundary>
                    )}
                </div>
            </div>
        </>
    );
}
