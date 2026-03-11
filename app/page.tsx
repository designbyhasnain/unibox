'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ComposeModal from './components/ComposeModal';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import InlineReply from './components/InlineReply';
import { EmailRow, EmailDetail, PaginationControls, ToastStack } from './components/InboxComponents';
import { PageLoader } from './components/LoadingStates';
import { 
    updateEmailStageAction,
    markAsNotInterestedAction,
    markAsNotSpamAction,
    searchEmailsAction,
} from '../src/actions/emailActions';
import { useMailbox } from './hooks/useMailbox';
import { getAccountsAction } from '../src/actions/accountActions';
import { useRealtimeInbox } from '../src/hooks/useRealtimeInbox';
import { useGlobalFilter } from './context/FilterContext';
import { shouldShowStageBadge } from './constants/stages';

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = '1ca1464d-1009-426e-96d5-8c5e8c84faac';
const PAGE_SIZE = 50;

const TABS = [
    { id: 'COLD_LEAD', label: 'Cold' },
    { id: 'LEAD', label: 'Leads' },
    { id: 'OFFER_ACCEPTED', label: 'Offer Accepted' },
    { id: 'CLOSED', label: 'Closed' },
    { id: 'NOT_INTERESTED', label: 'Not Interested' },
    { id: 'SPAM', label: 'Spam' },
];

interface ToastItem { id: string; subject: string; from: string; }

import { saveToLocalCache, getFromLocalCache } from './utils/localCache';
import { useHydrated } from './utils/useHydration';

let globalActiveStage = 'COLD_LEAD';

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InboxPage() {
    const isHydrated = useHydrated();
    const { selectedAccountId, setSelectedAccountId } = useGlobalFilter();

    // ─── Use Universal Mailbox Hook ───────────────────────────────────────────
    const [activeStage, setActiveStage] = useState(globalActiveStage);
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
        type: 'inbox',
        activeStage,
        selectedAccountId
    });

    const [isReplyingInline, setIsReplyingInline] = useState(false);
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [composeDefaultTo, setComposeDefaultTo] = useState('');
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [isLive, setIsLive] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [isSearchResults, setIsSearchResults] = useState(false);

    // Settings
    const [pollingInterval, setPollingInterval] = useState(300);
    const [isPollingEnabled, setIsPollingEnabled] = useState(true);
    const [isFocusSyncEnabled, setIsFocusSyncEnabled] = useState(true);

    const toastTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // ── Search Logic ──────────────────────────────────────────────────────────
    const handleSearchSubmit = useCallback(async (e?: React.FormEvent | React.KeyboardEvent) => {
        if (e) e.preventDefault();
        if (!searchTerm.trim()) return;

        setSearchLoading(true);
        setIsSearchResults(true);
        try {
            const results = await searchEmailsAction(ADMIN_USER_ID, searchTerm, 100, selectedAccountId);
            // Search results are handled locally here for simplicity
            setSelectedEmail(null);
        } catch (err) {
            console.error('Search submit error:', err);
        } finally {
            setSearchLoading(false);
        }
    }, [searchTerm, selectedAccountId, setSelectedEmail]);

    useEffect(() => {
        if (!searchTerm.trim()) {
            setSearchResults([]);
            setSearchLoading(false);
            return;
        }
        const timer = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const results = await searchEmailsAction(ADMIN_USER_ID, searchTerm, 8, selectedAccountId);
                setSearchResults(results);
            } catch (err) { console.error(err); }
            finally { setSearchLoading(false); }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, selectedAccountId]);

    // Initial sync connection
    useEffect(() => {
        const t = setTimeout(() => setIsLive(true), 1500);
        return () => clearTimeout(t);
    }, []);

    // ── Keyboard & Shortcuts ──────────────────────────────────────────────────
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
    }, [setSelectedEmail]);

    // Auto-polling
    useEffect(() => {
        if (!isPollingEnabled) return;
        const intervalMs = pollingInterval * 1000;
        const id = setInterval(() => {
            handleSync();
        }, intervalMs);
        return () => clearInterval(id);
    }, [isPollingEnabled, pollingInterval, handleSync]);

    // ── Derived Handlers ──────────────────────────────────────────────────────
    const goToPage = (page: number) => {
        setCurrentPage(page);
        loadEmails(page);
        const el = document.getElementById('email-list-scroll');
        if (el) el.scrollTop = 0;
    };

    const handleChangeStage = async (messageId: string, newStage: string) => {
        await updateEmailStageAction(messageId, newStage);
        // Clear other caches except current
        // (Note: in useMailbox, we can add a refresh method)
        loadEmails(currentPage);
    };

    const handleNotInterested = async (email: string) => {
        if (!email) return;
        await markAsNotInterestedAction(email);
        loadEmails(currentPage);
    };

    const handleNotSpam = async (messageId: string) => {
        const res = await markAsNotSpamAction(messageId);
        if (res.success) alert('Moved to Inbox');
        loadEmails(currentPage);
    };

    const dismissToast = (toastId: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
        const timer = toastTimerRef.current.get(toastId);
        if (timer) clearTimeout(timer);
        toastTimerRef.current.delete(toastId);
    };



    // ─── Derived State ────────────────────────────────────────────────────────

    // Removal of filteredEmails logic to prevent background list flickering while typing.
    // Gmail only updates the main list when Enter is pressed.



    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <>
            <Sidebar onOpenCompose={() => { setComposeDefaultTo(''); setIsComposeOpen(true); }} />

            <ToastStack toasts={toasts} onDismiss={dismissToast} />

            <main className="main-area">
                <Topbar
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    onSearch={(term) => {
                        handleSearchSubmit();
                    }}
                    onClearSearch={() => {
                        setSearchTerm('');
                        setSearchResults([]);
                        setIsSearchResults(false);
                        loadEmails(1);
                    }}
                    searchResults={searchResults}
                    searchLoading={searchLoading}
                    onResultClick={(res) => {
                        handleSelectEmail(res);
                    }}
                    rightContent={
                        <div className="topbar-actions" style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: '1rem', alignItems: 'center', gap: '1rem' }}>
                            {isSyncing && (
                                <div className="sync-status">
                                    <div className="spinner spinner-xs" />
                                    <span>{syncMessage || 'Syncing...'}</span>
                                </div>
                            )}
                            <div className="status-pill" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: 'var(--bg-elevated)', padding: '4px 10px', borderRadius: '100px', border: '1px solid var(--border)' }}>
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
                            <div className="avatar-btn">A</div>
                        </div>
                    }
                />

                <div className="tabs-bar">
                    {TABS.map((tab) => {
                        const count = isHydrated ? (tabCounts[tab.id] || 0) : 0;
                        return (
                            <div
                                key={tab.id}
                                className={`tab ${activeStage === tab.id ? 'active' : ''}`}
                                onClick={() => {
                                    globalActiveStage = tab.id;
                                    setActiveStage(tab.id);
                                    setIsSearchResults(false);
                                    setSearchTerm('');
                                    setSearchResults([]);
                                    setSelectedEmail(null);
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

                                </div>
                                <div className="list-toolbar-right">
                                    {isHydrated && totalCount > 0 && (
                                        <span className="count-label">
                                            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Email Rows */}
                            <div id="email-list-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                <div className="gmail-list-header">
                                    <div className="gmail-lh-check" />
                                    <div className="gmail-lh-star" />
                                    <div className="gmail-lh-sender">SENDER</div>
                                    <div className="gmail-lh-body">SUBJECT / PREVIEW</div>
                                    <div className="gmail-lh-account">GMAIL ACCOUNT</div>
                                    <div className="gmail-lh-manager">MANAGER</div>
                                    <div className="gmail-lh-date">DATE</div>
                                </div>
                                <PageLoader isLoading={!isHydrated || isLoading} type="list" count={PAGE_SIZE}>
                                    {emails.length === 0 ? (
                                        <div className="empty-state" style={{ padding: '4rem 2rem', opacity: isLoading ? 0.3 : 1 }}>
                                            <div className="empty-state-icon" style={{ marginBottom: '1rem', width: '64px', height: '64px', background: 'var(--bg-elevated)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                                                    <path d="M22 12l-10-9-10 9M9 21V12h6v9" />
                                                </svg>
                                            </div>
                                            <div className="empty-state-title" style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {isSearchResults ? 'No search results' : 'Inbox is empty'}
                                            </div>
                                            <div className="empty-state-desc" style={{ marginTop: '0.5rem', color: 'var(--text-muted)', maxWidth: '300px', margin: '0.5rem auto 0' }}>
                                                {isSearchResults
                                                    ? `No messages found for "${searchTerm}"`
                                                    : `Your ${TABS.find((t) => t.id === activeStage)?.label || 'Inbox'} is all caught up.`
                                                }
                                            </div>
                                            {selectedAccountId !== 'ALL' && (
                                                <div style={{ marginTop: '1.5rem' }}>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => setSelectedAccountId('ALL')}
                                                    >
                                                        Show all accounts
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        emails.map((email: any) => (
                                            <EmailRow
                                                key={email.id}
                                                email={email}
                                                isSelected={selectedEmail?.id === email.id}
                                                isRowChecked={selectedEmailIds.has(email.id)}
                                                showBadge={shouldShowStageBadge(activeStage, email.pipeline_stage, isSearchResults)}
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
                            onNotSpam={activeStage === 'SPAM' ? handleNotSpam : undefined}
                            totalCount={totalCount}
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
            </main >

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
            )
            }
        </>
    );
}
