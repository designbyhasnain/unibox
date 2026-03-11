'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import ComposeModal from '../components/ComposeModal';
import InlineReply from '../components/InlineReply';
import { useMailbox } from '../hooks/useMailbox';
import { EmailRow, EmailDetail, PaginationControls, ToastStack } from '../components/InboxComponents';
import { getAccountsAction } from '../../src/actions/accountActions';
import { useRealtimeInbox } from '../../src/hooks/useRealtimeInbox';
import { useGlobalFilter } from '../context/FilterContext';
import { avatarColor, formatDate, cleanBody } from '../utils/helpers';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';
import { saveToLocalCache, getFromLocalCache } from '../utils/localCache';

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = '1ca1464d-1009-426e-96d5-8c5e8c84faac';
const PAGE_SIZE = 50;

interface ToastItem { id: string; subject: string; to: string; }

let globalSentCache: { emails: any[]; totalCount: number; totalPages: number; page: number } | null = null;

if (typeof window !== 'undefined') {
    const savedSentCache = getFromLocalCache('sent_data');
    if (savedSentCache) globalSentCache = savedSentCache;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SentPage() {
    const isHydrated = useHydrated();
    const { selectedAccountId, setSelectedAccountId } = useGlobalFilter();

    const {
        emails,
        totalCount,
        totalPages,
        currentPage,
        isLoading,
        selectedEmail,
        threadMessages,
        isThreadLoading,
        selectedEmailIds,
        accounts,
        isSyncing,
        syncMessage,
        setSelectedEmail,
        setCurrentPage,
        loadEmails,
        handleSync,
        handleSelectEmail,
        toggleSelectEmail,
        toggleSelectAll,
        handleDelete,
        handleBulkDelete,
        handleToggleRead,
        handleBulkMarkAsRead,
    } = useMailbox({
        type: 'sent',
        selectedAccountId
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [isReplyingInline, setIsReplyingInline] = useState(false);
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [isLive, setIsLive] = useState(false);
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const toastTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // Initial sync connection UI state
    useEffect(() => {
        const t = setTimeout(() => setIsLive(true), 1500);
        return () => clearTimeout(t);
    }, []);

    // ── Derived Handlers ──────────────────────────────────────────────────────
    const goToPage = (page: number) => {
        setCurrentPage(page);
        loadEmails(page);
        const el = document.getElementById('sent-list-scroll');
        if (el) el.scrollTop = 0;
    };

    const dismissToast = (toastId: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
        const timer = toastTimerRef.current.get(toastId);
        if (timer) clearTimeout(timer);
        toastTimerRef.current.delete(toastId);
    };

    const filteredEmails = emails.filter((e: any) => {
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
                <Topbar
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    placeholder="Search sent messages..."
                    onSearch={() => { }}
                    onClearSearch={() => setSearchTerm('')}
                    leftContent={
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Sent</h1>
                    }
                    rightContent={
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
                    }
                />

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
                                            <button className="icon-btn sm" title="Mark Read" onClick={handleBulkMarkAsRead} disabled={selectedEmailIds.size === 0}>
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
                                <PageLoader isLoading={!isHydrated || isLoading} type="list" count={12}>
                                    {filteredEmails.length === 0 ? (
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
                                </PageLoader>
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
