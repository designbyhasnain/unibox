'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ComposeModal from './components/ComposeModal';
import Sidebar from './components/Sidebar';
import InlineReply from './components/InlineReply';
import { EmailRow, EmailDetail, PaginationControls, ToastStack } from './components/InboxComponents';
import {
    getInboxEmailsAction,
    markEmailAsReadAction,
    updateEmailStageAction,
    getThreadMessagesAction,
    deleteEmailAction,
    bulkDeleteEmailsAction,
    markEmailAsUnreadAction,
    bulkMarkAsReadAction,
    bulkMarkAsUnreadAction,
    getTabCountsAction,
    markAsNotInterestedAction,
} from '../src/actions/emailActions';
import { getAccountsAction } from '../src/actions/accountActions';
import { useRealtimeInbox } from '../src/hooks/useRealtimeInbox';

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = '1ca1464d-1009-426e-96d5-8c5e8c84faac';
const PAGE_SIZE = 25;

const TABS = [
    { id: 'COLD_LEAD', label: 'Cold' },
    { id: 'LEAD', label: 'Leads' },
    { id: 'OFFER_ACCEPTED', label: 'Offer Accepted' },
    { id: 'CLOSED', label: 'Closed' },
];

interface ToastItem { id: string; subject: string; from: string; }

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InboxPage() {
    // ── Email List State ───────────────────────────────────────────────────────
    const [emails, setEmails] = useState<any[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [activeStage, setActiveStage] = useState('COLD_LEAD');
    const [searchTerm, setSearchTerm] = useState('');
    const [tabCounts, setTabCounts] = useState<Record<string, number>>({});

    // ── Selected Email / Thread State ─────────────────────────────────────────
    const [selectedEmail, setSelectedEmail] = useState<any>(null);
    const [threadMessages, setThreadMessages] = useState<any[]>([]);
    const [isThreadLoading, setIsThreadLoading] = useState(false);
    const [isReplyingInline, setIsReplyingInline] = useState(false);

    // ── Compose State ─────────────────────────────────────────────────────────
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [composeDefaultTo, setComposeDefaultTo] = useState('');

    // ── Sync / Accounts State ─────────────────────────────────────────────────
    const [accounts, setAccounts] = useState<any[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const [isLive, setIsLive] = useState(false);

    // ── New Emails / Toasts ────────────────────────────────────────────────────
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [newEmailCount, setNewEmailCount] = useState(0);
    const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());

    // ── Settings (from localStorage) ──────────────────────────────────────────
    const [pollingInterval, setPollingInterval] = useState(300);
    const [isPollingEnabled, setIsPollingEnabled] = useState(true);
    const [isFocusSyncEnabled, setIsFocusSyncEnabled] = useState(true);

    // ── Refs ───────────────────────────────────────────────────────────────────
    const toastTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const lastSyncTimeRef = useRef<number>(0);

    // ─── Load Emails (no stale cache — always fresh from DB) ──────────────────
    const loadEmails = useCallback(async (page: number, stage?: string) => {
        setIsLoading(true);
        try {
            const result = await getInboxEmailsAction(
                ADMIN_USER_ID,
                page,
                PAGE_SIZE,
                stage ?? activeStage,
            );
            setEmails(result.emails);
            setTotalCount(result.totalCount);
            setTotalPages(result.totalPages);
            setCurrentPage(result.page);

            // Refresh counts for all tabs
            const counts = await getTabCountsAction(ADMIN_USER_ID);
            setTabCounts(counts);
        } catch (err) {
            console.error('loadEmails error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [activeStage]);

    // Initial load
    useEffect(() => { loadEmails(1); }, [loadEmails]);

    // Load accounts once
    useEffect(() => {
        getAccountsAction(ADMIN_USER_ID)
            .then(setAccounts)
            .catch((err) => console.error('Failed to fetch accounts:', err));
    }, []);

    // Read settings from localStorage
    useEffect(() => {
        const t = setTimeout(() => setIsLive(true), 1500);
        const savedPolling = localStorage.getItem('settings_polling_enabled');
        const savedInterval = localStorage.getItem('settings_polling_interval');
        const savedFocus = localStorage.getItem('settings_focus_sync_enabled');
        if (savedPolling !== null) setIsPollingEnabled(savedPolling === 'true');
        if (savedInterval !== null) setPollingInterval(parseInt(savedInterval, 10));
        if (savedFocus !== null) setIsFocusSyncEnabled(savedFocus === 'true');
        return () => clearTimeout(t);
    }, []);

    // Keyboard shortcuts (c = compose, Esc = close detail)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelectedEmail(null);
            if (e.key === 'c' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName === 'BODY') {
                setComposeDefaultTo('');
                setIsComposeOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // ─── Sync ──────────────────────────────────────────────────────────────────

    const handleSync = useCallback(async () => {
        if (isSyncing) return;
        const currentAccounts = accounts;

        if (currentAccounts.length === 0) {
            setSyncMessage('No accounts connected.');
            return;
        }

        setIsSyncing(true);
        lastSyncTimeRef.current = Date.now();
        setSyncMessage(currentAccounts.length > 1
            ? `Syncing ${currentAccounts.length} accounts...`
            : 'Syncing...');

        try {
            await Promise.allSettled(
                currentAccounts.map((a) =>
                    fetch('/api/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accountId: a.id }),
                    })
                )
            );
            setTimeout(() => {
                setIsSyncing(false);
                setSyncMessage('');
                loadEmails(1);
            }, 2000);
        } catch (err) {
            console.error('Sync failed:', err);
            setSyncMessage('Sync failed.');
            setIsSyncing(false);
        }
    }, [isSyncing, accounts, loadEmails]);

    // Auto-poll
    useEffect(() => {
        if (!isPollingEnabled) return;
        const intervalMs = pollingInterval * 1000;
        const id = setInterval(() => {
            if (Date.now() - lastSyncTimeRef.current > intervalMs * 0.8) handleSync();
        }, intervalMs);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPollingEnabled, pollingInterval, accounts]);

    // Focus sync
    useEffect(() => {
        if (!isFocusSyncEnabled) return;
        const handleFocus = () => {
            if (Date.now() - lastSyncTimeRef.current > 120_000) handleSync();
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFocusSyncEnabled, accounts]);

    // ─── Realtime Inbox Updates ────────────────────────────────────────────────

    const handleNewEmailRealtime = useCallback((newEmail: any) => {
        const toastId = newEmail.id || Date.now().toString();
        const toast: ToastItem = {
            id: toastId,
            subject: newEmail.subject || '(No Subject)',
            from: newEmail.from_email?.split('<')[0].trim() || newEmail.from_email || 'Unknown',
        };
        setToasts((prev) => [toast, ...prev].slice(0, 5));
        setNewEmailCount((prev) => prev + 1);
        const timer = setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== toastId));
        }, 6000);
        toastTimerRef.current.set(toastId, timer);

        if (currentPage === 1) {
            const emailStage = newEmail.pipeline_stage || 'COLD_LEAD';
            if (emailStage === activeStage) {
                const account = accounts.find((a) => a.id === newEmail.gmail_account_id);
                const emailWithAccount = {
                    ...newEmail,
                    gmail_accounts: {
                        email: account?.email || 'Unknown',
                        user: { name: account?.manager_name || 'System' }
                    },
                };
                setEmails((prev) => {
                    const filtered = prev.filter((e) => e.thread_id !== newEmail.thread_id);
                    return [emailWithAccount, ...filtered].slice(0, PAGE_SIZE);
                });
                setTotalCount((prev: number) => prev + 1);
            }
        }
    }, [currentPage, activeStage, accounts]);

    const handleEmailUpdated = useCallback((updatedEmail: any) => {
        const matchesActive =
            updatedEmail.pipeline_stage === activeStage ||
            (!updatedEmail.pipeline_stage && activeStage === 'COLD_LEAD');

        setEmails((prev: any[]) => {
            const exists = prev.some((e) => e.id === updatedEmail.id);
            if (exists) {
                if (!matchesActive) return prev.filter((e) => e.id !== updatedEmail.id);
                return prev.map((e) => e.id === updatedEmail.id ? { ...e, ...updatedEmail } : e);
            }
            if (matchesActive) {
                const account = accounts.find((a) => a.id === updatedEmail.gmail_account_id);
                const withAccount = {
                    ...updatedEmail,
                    gmail_accounts: {
                        email: account?.email || 'Unknown',
                        user: { name: account?.manager_name || 'System' }
                    }
                };
                return [withAccount, ...prev.filter((e) => e.thread_id !== updatedEmail.thread_id)].slice(0, PAGE_SIZE);
            }
            return prev;
        });

        if (selectedEmail?.id === updatedEmail.id) {
            setSelectedEmail((prev: any) => ({ ...prev, ...updatedEmail }));
        }
    }, [activeStage, selectedEmail, accounts]);

    const handleEmailDeleted = useCallback((messageId: string) => {
        setEmails((prev: any[]) => prev.filter((e) => e.id !== messageId));
        if (selectedEmail?.id === messageId) setSelectedEmail(null);
    }, [selectedEmail]);

    useRealtimeInbox({
        accountIds: accounts.map((a) => a.id),
        onNewEmail: handleNewEmailRealtime,
        onEmailUpdated: handleEmailUpdated,
        onEmailDeleted: handleEmailDeleted,
    });

    // ─── Handlers ─────────────────────────────────────────────────────────────

    const goToPage = (page: number) => {
        if (page < 1 || page > totalPages) return;
        setSelectedEmail(null);
        setNewEmailCount(0);
        loadEmails(page);
        const el = document.getElementById('email-list-scroll');
        if (el) el.scrollTop = 0;
    };

    const handleToggleRead = async (id: string, currentUnread: boolean) => {
        const nextUnread = !currentUnread;
        setEmails((prev) => prev.map((e) => e.id === id ? { ...e, is_unread: nextUnread } : e));
        if (selectedEmail?.id === id) {
            setSelectedEmail((prev: any) => ({ ...prev, is_unread: nextUnread }));
        }

        if (nextUnread) {
            await markEmailAsUnreadAction(id);
        } else {
            await markEmailAsReadAction(id);
        }
    };

    const handleBulkMarkRead = async () => {
        const ids = Array.from(selectedEmailIds);
        if (ids.length === 0) return;

        setEmails((prev) => prev.map((e) => selectedEmailIds.has(e.id) ? { ...e, is_unread: false } : e));
        setSelectedEmailIds(new Set());

        await bulkMarkAsReadAction(ids);
    };

    const handleSelectEmail = async (email: any) => {
        setIsReplyingInline(false);
        setSelectedEmail(email);
        setThreadMessages([email]);

        if (email.is_unread) {
            setEmails((prev) => prev.map((e) => e.id === email.id ? { ...e, is_unread: false } : e));
            await markEmailAsReadAction(email.id);
        }

        if (email.thread_id) {
            setIsThreadLoading(true);
            try {
                const history = await getThreadMessagesAction(email.thread_id);
                setThreadMessages(history);
            } catch (err) {
                console.error('Failed to fetch thread history:', err);
            } finally {
                setIsThreadLoading(false);
            }
        }
    };

    const handleChangeStage = async (messageId: string, newStage: string) => {
        setEmails((prev) => prev.map((e) => e.id === messageId ? { ...e, pipeline_stage: newStage } : e));
        if (selectedEmail?.id === messageId) {
            setSelectedEmail((prev: any) => ({ ...prev, pipeline_stage: newStage }));
        }
        await updateEmailStageAction(messageId, newStage);
    };

    const handleNotInterested = async (email: string) => {
        if (!email) return;
        // Optimization: immediately hide emails from this sender in UI
        setEmails((prev) => prev.filter(e => !e.from_email?.includes(email)));
        if (selectedEmail?.from_email?.includes(email)) {
            setSelectedEmail(null);
        }
        await markAsNotInterestedAction(email);
        loadEmails(currentPage); // Refresh list
    };

    const dismissToast = (toastId: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
        const timer = toastTimerRef.current.get(toastId);
        if (timer) clearTimeout(timer);
        toastTimerRef.current.delete(toastId);
    };

    const handleDeleteEmail = async (id: string) => {
        if (!confirm('Are you sure you want to delete this message?')) return;

        setEmails((prev) => prev.filter((e) => e.id !== id));
        if (selectedEmail?.id === id) setSelectedEmail(null);

        const res = await deleteEmailAction(id);
        if (!res.success) {
            alert('Failed to delete email');
            loadEmails(currentPage);
        }
    };

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedEmailIds);
        if (ids.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${ids.length} messages?`)) return;

        setEmails((prev) => prev.filter((e) => !selectedEmailIds.has(e.id)));
        setSelectedEmailIds(new Set());
        if (selectedEmail && selectedEmailIds.has(selectedEmail.id)) setSelectedEmail(null);

        const res = await bulkDeleteEmailsAction(ids);
        if (!res.success) {
            alert('Failed to delete emails');
            loadEmails(currentPage);
        }
    };

    const toggleSelectEmail = (id: string) => {
        setSelectedEmailIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedEmailIds.size > 0 && selectedEmailIds.size === emails.length) {
            setSelectedEmailIds(new Set());
        } else {
            setSelectedEmailIds(new Set(emails.map((e) => e.id)));
        }
    };


    // ─── Derived State ────────────────────────────────────────────────────────

    const filteredEmails = emails.filter((e) => {
        if (!searchTerm) return true;
        const sl = searchTerm.toLowerCase();
        return (
            (e.subject && e.subject.toLowerCase().includes(sl)) ||
            (e.from_email && e.from_email.toLowerCase().includes(sl)) ||
            (e.to_email && e.to_email.toLowerCase().includes(sl)) ||
            (e.body && e.body.toLowerCase().includes(sl))
        );
    });



    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <>
            <Sidebar onOpenCompose={() => { setComposeDefaultTo(''); setIsComposeOpen(true); }} />

            <ToastStack toasts={toasts} onDismiss={dismissToast} />

            <main className="main-area">
                {/* Topbar */}
                <header className="topbar">
                    <div className="search-bar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search messages, contacts..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <div className="search-shortcut">⌘K</div>
                    </div>

                    <div className="topbar-actions">
                        {isSyncing && (
                            <div className="sync-status">
                                <div className="spinner spinner-xs" />
                                <span>{syncMessage || 'Syncing...'}</span>
                            </div>
                        )}
                        <div className="status-pill">
                            <div className={`status-dot ${isLive ? 'live' : ''}`} />
                            <span>{isLive ? 'Live' : 'Connecting...'}</span>
                        </div>
                        <button
                            className="icon-btn"
                            onClick={handleSync}
                            disabled={isSyncing}
                            title="Refresh messages"
                            id="sync-btn"
                        >
                            <svg
                                width="18" height="18" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}
                            >
                                <path d="M23 4v6h-6M1 20v-6h6" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                        </button>
                        <div className="divider-v" />
                        <div className="avatar-btn" title="Admin">A</div>
                    </div>
                </header>

                <div className="tabs-bar">
                    {TABS.map((tab) => {
                        const count = tabCounts[tab.id] || 0;
                        return (
                            <div
                                key={tab.id}
                                className={`tab ${activeStage === tab.id ? 'active' : ''}`}
                                onClick={() => {
                                    setActiveStage(tab.id);
                                    setSelectedEmail(null);
                                    loadEmails(1, tab.id);
                                }}
                                id={`tab-${tab.id}`}
                            >
                                {tab.label}
                                {count > 0 && <span className="tab-count">{count}</span>}
                            </div>
                        );
                    })}
                </div>

                <div className="content-split">
                    {/* Email List Panel */}
                    {!selectedEmail ? (
                        <div className="list-panel">
                            {/* List Toolbar */}
                            <div className="list-toolbar">
                                <div className="list-toolbar-left">
                                    <label className="check-container">
                                        <input
                                            type="checkbox"
                                            checked={selectedEmailIds.size > 0 && selectedEmailIds.size === emails.length}
                                            onChange={toggleSelectAll}
                                        />
                                        <span className="checkmark" />
                                    </label>

                                    <div className="divider-v" />

                                    {newEmailCount > 0 && (
                                        <button
                                            className="new-chip"
                                            onClick={() => { setNewEmailCount(0); loadEmails(1); }}
                                        >
                                            <div className="pulse-dot" />
                                            {newEmailCount} new messages
                                        </button>
                                    )}
                                </div>
                                <div className="list-toolbar-right">
                                    {totalCount > 0 && (
                                        <span className="count-label">
                                            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Email Rows */}
                            <div id="email-list-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                <div className="universal-grid grid-inbox grid-header">
                                    <div className="grid-col" /> {/* Checkbox space */}
                                    <div className="grid-col">Sender</div>
                                    <div className="grid-col">Subject / Preview</div>
                                    <div className="grid-col">Gmail Account</div>
                                    <div className="grid-col">Manager</div>
                                    <div className="grid-col right">Date</div>
                                </div>
                                {isLoading ? (
                                    <div className="empty-state">
                                        <div className="spinner spinner-lg" />
                                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 8 }}>
                                            Loading messages...
                                        </span>
                                    </div>
                                ) : filteredEmails.length === 0 ? (
                                    <div className="empty-state">
                                        <div className="empty-state-icon">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                                                <path d="M22 12l-10-9-10 9M9 21V12h6v9" />
                                            </svg>
                                        </div>
                                        <div className="empty-state-title">No messages</div>
                                        <div className="empty-state-desc">
                                            Your {TABS.find((t) => t.id === activeStage)?.label} is empty.
                                        </div>
                                    </div>
                                ) : (
                                    filteredEmails.map((email: any) => (
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

                            <PaginationControls
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalCount={totalCount}
                                pageSize={PAGE_SIZE}
                                onGoToPage={goToPage}
                            />
                        </div>
                    ) : (
                        /* Email Detail Panel */
                        <EmailDetail
                            email={selectedEmail}
                            threadMessages={threadMessages}
                            isThreadLoading={isThreadLoading}
                            isReplyingInline={isReplyingInline}
                            onBack={() => setSelectedEmail(null)}
                            onStageChange={handleChangeStage}
                            onReply={() => setIsReplyingInline(true)}
                            onForward={() => {
                                setComposeDefaultTo(
                                    selectedEmail.from_email?.match(/<([^>]+)>/)?.[1] || selectedEmail.from_email
                                );
                                setIsComposeOpen(true);
                            }}
                            onNotInterested={handleNotInterested}
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
                    )}
                </div>
            </main>

            {isComposeOpen && (
                <ComposeModal
                    onClose={() => setIsComposeOpen(false)}
                    defaultTo={composeDefaultTo}
                    defaultSubject={
                        selectedEmail && composeDefaultTo
                            ? (selectedEmail.subject?.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`)
                            : ''
                    }
                    threadId={selectedEmail && composeDefaultTo ? selectedEmail.thread_id : ''}
                />
            )}
        </>
    );
}
