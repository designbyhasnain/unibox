'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import ComposeModal from '../components/ComposeModal';
import InlineReply from '../components/InlineReply';
import {
    getSentEmailsAction,
    getThreadMessagesAction,
    deleteEmailAction,
    bulkDeleteEmailsAction,
    markEmailAsReadAction,
    markEmailAsUnreadAction,
    bulkMarkAsReadAction,
} from '../../src/actions/emailActions';
import { EmailRow, EmailDetail, PaginationControls, ToastStack } from '../components/InboxComponents';
import { getAccountsAction } from '../../src/actions/accountActions';
import { useRealtimeInbox } from '../../src/hooks/useRealtimeInbox';
import { avatarColor, formatDate, cleanBody } from '../utils/helpers';

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = '1ca1464d-1009-426e-96d5-8c5e8c84faac';
const PAGE_SIZE = 25;

interface ToastItem { id: string; subject: string; to: string; }

let globalSentCache: { emails: any[]; totalCount: number; totalPages: number; page: number } | null = null;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SentPage() {
    // ── List State ────────────────────────────────────────────────────────────
    const [emails, setEmails] = useState<any[]>(() => globalSentCache?.emails || []);
    const [totalCount, setTotalCount] = useState(() => globalSentCache?.totalCount || 0);
    const [totalPages, setTotalPages] = useState(() => globalSentCache?.totalPages || 0);
    const [currentPage, setCurrentPage] = useState(() => globalSentCache?.page || 1);
    const [isLoading, setIsLoading] = useState(() => !globalSentCache);
    const [searchTerm, setSearchTerm] = useState('');

    // ── Selected Email / Thread ───────────────────────────────────────────────
    const [selectedEmail, setSelectedEmail] = useState<any>(null);
    const [threadMessages, setThreadMessages] = useState<any[]>([]);
    const [isThreadLoading, setIsThreadLoading] = useState(false);
    const [isReplyingInline, setIsReplyingInline] = useState(false);

    // ── Compose ───────────────────────────────────────────────────────────────
    const [isComposeOpen, setIsComposeOpen] = useState(false);

    // ── Sync / Accounts ───────────────────────────────────────────────────────
    const [accounts, setAccounts] = useState<any[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const [isLive, setIsLive] = useState(false);

    // ── New email toasts ──────────────────────────────────────────────────────
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());

    const toastTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const lastSyncTimeRef = useRef<number>(0);

    // ─── Load Sent Emails (always fresh — no stale cache) ─────────────────────

    const loadEmails = useCallback(async (page: number) => {
        if (!globalSentCache || globalSentCache.page !== page) setIsLoading(true);
        try {
            const result = await getSentEmailsAction(ADMIN_USER_ID, page, PAGE_SIZE);
            globalSentCache = { emails: result.emails, totalCount: result.totalCount, totalPages: result.totalPages, page: result.page };
            setEmails(result.emails);
            setTotalCount(result.totalCount);
            setTotalPages(result.totalPages);
            setCurrentPage(result.page);
        } catch (err) {
            console.error('loadEmails (sent) error:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial load + accounts
    useEffect(() => {
        loadEmails(1);
        getAccountsAction(ADMIN_USER_ID)
            .then(setAccounts)
            .catch((err) => console.error('Failed to fetch accounts:', err));
        const t = setTimeout(() => setIsLive(true), 1500);
        return () => clearTimeout(t);
    }, [loadEmails]);

    // Keyboard shortcut — Escape closes detail
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedEmail(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ─── Sync ─────────────────────────────────────────────────────────────────

    const handleSync = useCallback(async () => {
        if (isSyncing) return;
        const toSync = accounts;
        if (toSync.length === 0) {
            setSyncMessage('No accounts connected.');
            return;
        }

        setIsSyncing(true);
        lastSyncTimeRef.current = Date.now();
        setSyncMessage(toSync.length > 1 ? `Syncing ${toSync.length} accounts...` : 'Syncing...');
        try {
            await Promise.allSettled(
                toSync.map((a) =>
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
        } catch {
            setIsSyncing(false);
            setSyncMessage('Sync failed.');
        }
    }, [isSyncing, accounts, loadEmails]);

    // ─── Realtime ─────────────────────────────────────────────────────────────

    const handleNewEmailRealtime = useCallback((newEmail: any) => {
        if (newEmail.direction !== 'SENT') return;

        // Show a toast for newly sent items (e.g. from another session)
        const toastId = newEmail.id || Date.now().toString();
        const toast: ToastItem = {
            id: toastId,
            subject: newEmail.subject || '(No Subject)',
            to: newEmail.to_email || 'Unknown',
        };
        setToasts((prev) => [toast, ...prev].slice(0, 5));
        const timer = setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== toastId));
        }, 5000);
        toastTimerRef.current.set(toastId, timer);

        // Prepend to list (dedupe by thread)
        setEmails((prev) => {
            const filtered = prev.filter((e) => e.thread_id !== newEmail.thread_id);
            const account = accounts.find((a) => a.id === newEmail.gmail_account_id);
            const enriched = {
                ...newEmail,
                gmail_accounts: {
                    email: account?.email || 'Unknown',
                    user: { name: account?.manager_name || 'System' }
                }
            };
            return [enriched, ...filtered].slice(0, PAGE_SIZE);
        });
        setTotalCount((prev: number) => prev + 1);

        // If this thread is open, append the message
        if (selectedEmail?.thread_id === newEmail.thread_id) {
            setThreadMessages((prev) => {
                if (prev.some((m) => m.id === newEmail.id)) return prev;
                return [...prev, newEmail].sort(
                    (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
                );
            });
        }
    }, [selectedEmail]);

    const handleEmailDeleted = useCallback((messageId: string) => {
        setEmails((prev) => prev.filter((e) => e.id !== messageId));
        if (selectedEmail?.id === messageId) setSelectedEmail(null);
    }, [selectedEmail]);

    useRealtimeInbox({
        accountIds: accounts.map((a) => a.id),
        onNewEmail: handleNewEmailRealtime,
        onEmailDeleted: handleEmailDeleted,
    });

    // ─── Handlers ─────────────────────────────────────────────────────────────

    const goToPage = (page: number) => {
        if (page < 1 || page > totalPages) return;
        setSelectedEmail(null);
        loadEmails(page);
        const el = document.getElementById('sent-list-scroll');
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
            (e.to_email && e.to_email.toLowerCase().includes(sl)) ||
            (e.body && e.body.toLowerCase().includes(sl))
        );
    });

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <>
            <Sidebar onOpenCompose={() => setIsComposeOpen(true)} />

            {/* Sent-item toasts (e.g. confirm a sent message appeared) */}
            <ToastStack
                toasts={toasts.map((t) => ({ id: t.id, subject: t.subject, from: `to ${t.to}` }))}
                onDismiss={dismissToast}
            />

            <main className="main-area">
                {/* Topbar */}
                <header className="topbar">
                    <div className="search-bar">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search sent messages..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="topbar-actions">
                        {syncMessage && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{syncMessage}</span>
                        )}
                        <div className="status-pill">
                            <div
                                className={`status-dot ${isLive ? 'live' : ''}`}
                                style={!isLive ? { background: 'var(--text-muted)' } : {}}
                            />
                            <span>{isLive ? 'Live' : 'Connecting...'}</span>
                        </div>
                        <button
                            className="icon-btn"
                            onClick={handleSync}
                            disabled={isSyncing}
                            title="Sync"
                            id="sync-btn"
                        >
                            <svg
                                width="15" height="15" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}
                            >
                                <polyline points="23 4 23 10 17 10" />
                                <polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                        </button>
                        <div className="avatar-btn" title="Admin">A</div>
                    </div>
                </header>

                {/* Tab bar */}
                <div className="tabs-bar">
                    <div className="tab active" id="tab-sent">Sent Items</div>
                </div>


                <div className="content-split">
                    {/* Email List Panel */}
                    {!selectedEmail ? (
                        <div className="list-panel">
                            {/* Toolbar */}
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
                                    {selectedEmailIds.size > 0 && (
                                        <>
                                            <button className="icon-btn sm danger" title="Delete selected" onClick={handleBulkDelete}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                            </button>
                                            <button className="icon-btn sm" title="Mark Read" onClick={handleBulkMarkRead} disabled={selectedEmailIds.size === 0}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            </button>
                                        </>
                                    )}
                                    <div className="divider-v" />
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                        Outgoing
                                    </span>
                                </div>
                                <div className="list-toolbar-right">
                                    <span className="count-label">
                                        {totalCount > 0
                                            ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString()}`
                                            : ''}
                                    </span>
                                </div>
                            </div>

                            {/* Email rows */}
                            <div id="sent-list-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
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
                                            Loading sent mail...
                                        </span>
                                    </div>
                                ) : filteredEmails.length === 0 ? (
                                    <div className="empty-state">
                                        <div className="empty-state-icon">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                                                <line x1="22" y1="2" x2="11" y2="13" />
                                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                            </svg>
                                        </div>
                                        <div className="empty-state-title">No sent mail</div>
                                        <div className="empty-state-desc">Emails you send will appear here.</div>
                                    </div>
                                ) : (
                                    filteredEmails.map((email: any) => (
                                        <EmailRow
                                            key={email.id}
                                            email={email}
                                            isSelected={false}
                                            isRowChecked={selectedEmailIds.has(email.id)}
                                            showBadge={false}
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
                        /* Detail Panel */
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
                    )}
                </div>
            </main>

            {isComposeOpen && <ComposeModal onClose={() => setIsComposeOpen(false)} />}
        </>
    );
}
