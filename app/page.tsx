'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useUI } from './context/UIContext';
import Topbar from './components/Topbar';
import InlineReply from './components/InlineReply';
import { EmailRow, EmailDetail, PaginationControls, ToastStack } from './components/InboxComponents';
import { PageLoader } from './components/LoadingStates';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
    updateEmailStageAction,
    markAsNotInterestedAction,
    markAsNotSpamAction,
    searchEmailsAction,
    bulkUpdateStageAction,
    bulkMarkReadAction,
    bulkMarkUnreadAction,
} from '../src/actions/emailActions';
import { useMailbox } from './hooks/useMailbox';
import { useGlobalFilter } from './context/FilterContext';
import { shouldShowStageBadge, STAGE_OPTIONS } from './constants/stages';

// ─── Constants ────────────────────────────────────────────────────────────────

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

import { useHydrated } from './utils/useHydration';

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InboxPage() {
    const isHydrated = useHydrated();
    const { selectedAccountId, setSelectedAccountId, accounts } = useGlobalFilter();

    const [activeStage, setActiveStage] = useState('COLD_LEAD');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchResults, setIsSearchResults] = useState(false);
    const [liveResults, setLiveResults] = useState<any[]>([]);
    const [liveLoading, setLiveLoading] = useState(false);
    const liveSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ─── Use Universal Mailbox Hook ───────────────────────────────────────────
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
        handleDelete,
        handleBulkDelete,
        handleToggleRead,
        handleBulkMarkAsRead,
        prefetchThread,
        isIdle,
        handleResume,
    } = useMailbox({
        type: isSearchResults ? 'search' : 'inbox',
        activeStage,
        searchTerm,
        selectedAccountId,
        enabled: !isSearchResults || !!searchTerm,
        accounts
    });

    const { setComposeOpen, setComposeDefaultTo, setComposeDefaultSubject, setComposeDefaultBody } = useUI();
    const [isReplyingInline, setIsReplyingInline] = useState(false);
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [bulkLoading, setBulkLoading] = useState(false);

    // ─── Bulk Action Handlers ───────────────────────────────────────────────
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

    // Settings - read from localStorage to connect with settings page (FE-024)
    const [pollingInterval, setPollingInterval] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('settings_polling_interval');
            return saved ? parseInt(saved, 10) : 300;
        }
        return 300;
    });
    const [isPollingEnabled, setIsPollingEnabled] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('settings_polling_enabled');
            return saved !== null ? saved === 'true' : true;
        }
        return true;
    });
    const [isFocusSyncEnabled, setIsFocusSyncEnabled] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('settings_focus_sync_enabled');
            return saved !== null ? saved === 'true' : true;
        }
        return true;
    });

    const toastTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const handleSyncRef = useRef(handleSync);
    handleSyncRef.current = handleSync;

    // Cleanup toast timers on unmount
    useEffect(() => {
        return () => {
            toastTimerRef.current.forEach((timer) => clearTimeout(timer));
            toastTimerRef.current.clear();
        };
    }, []);

    // ── Search Logic ──────────────────────────────────────────────────────────
    const handleSearchSubmit = useCallback(async (e?: React.FormEvent | React.KeyboardEvent) => {
        if (e) e.preventDefault();
        if (!searchTerm.trim()) return;

        setIsSearchResults(true);
        setSelectedEmail(null);
    }, [searchTerm, setSelectedEmail]);

    useEffect(() => {
        if (!searchTerm.trim()) {
            setIsSearchResults(false);
            setLiveResults([]);
            setLiveLoading(false);
            return;
        }
    }, [searchTerm]);

    // ── Debounced Live Search (Gmail-style as-you-type) ──────────────────────
    useEffect(() => {
        const q = searchTerm.trim();
        if (!q || q.length < 2) {
            setLiveResults([]);
            setLiveLoading(false);
            return;
        }

        setLiveLoading(true);

        if (liveSearchTimer.current) clearTimeout(liveSearchTimer.current);
        liveSearchTimer.current = setTimeout(async () => {
            try {
                const res = await searchEmailsAction(q, 6, selectedAccountId);
                setLiveResults(Array.isArray(res) ? res : []);
            } catch {
                setLiveResults([]);
            } finally {
                setLiveLoading(false);
            }
        }, 300);

        return () => {
            if (liveSearchTimer.current) clearTimeout(liveSearchTimer.current);
        };
    }, [searchTerm, selectedAccountId]);

    // Derive live status from whether accounts are loaded (real indicator)
    // Only check after hydration to avoid SSR/client mismatch
    const isLive = isHydrated && accounts.length > 0;

    // ── Keyboard & Shortcuts ──────────────────────────────────────────────────
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

    // Reset to list view when sidebar nav is clicked on same page
    useEffect(() => {
        const handleNavReset = () => {
            setSelectedEmail(null);
            setSearchTerm('');
            setIsSearchResults(false);
        };
        window.addEventListener('nav-reset', handleNavReset);
        return () => window.removeEventListener('nav-reset', handleNavReset);
    }, [setSelectedEmail]);

    // Auto-polling — use ref to avoid clearing/restarting interval when handleSync changes
    useEffect(() => {
        if (!isPollingEnabled) return;
        const intervalMs = pollingInterval * 1000;
        const id = setInterval(() => {
            handleSyncRef.current();
        }, intervalMs);
        return () => clearInterval(id);
    }, [isPollingEnabled, pollingInterval]);

    // ── Derived Handlers ──────────────────────────────────────────────────────
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
        <div className="mailbox-wrapper">
            <ToastStack toasts={toasts} onDismiss={dismissToast} />

            {isIdle && (
                <div className="idle-banner" role="alert">
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    <span>Sync paused due to inactivity</span>
                    <button className="idle-resume-btn" onClick={handleResume}>Resume Sync</button>
                </div>
            )}

            <div className="mailbox-main">
                <Topbar
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    onSearch={(term) => {
                        handleSearchSubmit();
                    }}
                    onClearSearch={() => {
                        setSearchTerm('');
                        setIsSearchResults(false);
                        loadEmails(1);
                    }}
                    searchResults={liveResults}
                    searchLoading={liveLoading}
                    onResultClick={(res) => {
                        setLiveResults([]);
                        setIsSearchResults(true);
                        handleSelectEmail(res);
                    }}
                    rightContent={
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
                                aria-label="Refresh messages"
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

                <div className="tabs-bar" role="tablist" aria-label="Pipeline stages">
                    {TABS.map((tab) => {
                        const count = isHydrated ? (tabCounts[tab.id] || 0) : 0;
                        const isActive = activeStage === tab.id;
                        return (
                            <div
                                key={tab.id}
                                className={`tab ${isActive ? 'active' : ''}`}
                                role="tab"
                                tabIndex={0}
                                aria-selected={isActive}
                                onClick={() => {
                                    setActiveStage(tab.id);
                                    setIsSearchResults(false);
                                    setSearchTerm('');
                                    setSelectedEmail(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setActiveStage(tab.id);
                                        setIsSearchResults(false);
                                        setSearchTerm('');
                                        setSelectedEmail(null);
                                    }
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

                            {/* Bulk Action Bar */}
                            {selectedEmailIds.size > 0 && (
                                <div style={{
                                    position: 'sticky', top: 0, zIndex: 10,
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 16px',
                                    background: 'rgba(26,115,232,0.08)',
                                    backdropFilter: 'blur(8px)',
                                    borderBottom: '1px solid rgba(26,115,232,0.2)',
                                }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1a73e8' }}>
                                        {selectedEmailIds.size} selected
                                    </span>
                                    <select
                                        onChange={(e) => { if (e.target.value) handleBulkStageChange(e.target.value); e.target.value = ''; }}
                                        defaultValue=""
                                        disabled={bulkLoading}
                                        style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                                    >
                                        <option value="" disabled>Change Stage...</option>
                                        {STAGE_OPTIONS.map((s: any) => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                        ))}
                                    </select>
                                    <button onClick={handleBulkRead} disabled={bulkLoading}
                                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                        Mark Read
                                    </button>
                                    <button onClick={handleBulkUnread} disabled={bulkLoading}
                                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                        Mark Unread
                                    </button>
                                    <button onClick={() => toggleSelectAll()}
                                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', cursor: 'pointer', marginLeft: 'auto' }}>
                                        Deselect All
                                    </button>
                                </div>
                            )}

                            {/* Email Rows */}
                            <div id="email-list-scroll" className="email-list-scroll" aria-live="polite">
                                <div className="gmail-list-header">
                                    <div className="gmail-lh-check">
                                        <input type="checkbox" checked={selectedEmailIds.size > 0 && selectedEmailIds.size === emails.length} onChange={() => toggleSelectAll()} style={{ cursor: 'pointer' }} />
                                    </div>
                                    <div className="gmail-lh-star" />
                                    <div className="gmail-lh-sender">SENDER</div>
                                    <div className="gmail-lh-body">SUBJECT / PREVIEW</div>
                                    <div className="gmail-lh-account">GMAIL ACCOUNT</div>
                                    <div className="gmail-lh-manager">MANAGER</div>
                                    <div className="gmail-lh-date">DATE</div>
                                </div>
                                <PageLoader isLoading={!isHydrated || isLoading} type="list" count={PAGE_SIZE}>
                                    {emails.length === 0 ? (
                                        <div className={`empty-state${isLoading ? ' empty-state-loading' : ''}`}>
                                            <div className="empty-state-icon">
                                                {isSearchResults ? (
                                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                                                    </svg>
                                                ) : (
                                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <rect x="2" y="4" width="20" height="16" rx="2" />
                                                        <path d="M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div className="empty-state-title">
                                                {isSearchResults ? 'No results found' : 'Nothing here yet'}
                                            </div>
                                            <div className="empty-state-desc">
                                                {isSearchResults
                                                    ? `We couldn\u2019t find any messages matching \u201c${searchTerm}\u201d. Try a different search term.`
                                                    : `Your ${TABS.find((t) => t.id === activeStage)?.label || 'Inbox'} is all caught up. New messages will appear here.`
                                                }
                                            </div>
                                            {selectedAccountId !== 'ALL' && !isSearchResults && (
                                                <div className="empty-state-action">
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
                        </div>
                    ) : (
                        /* Email Detail Panel */
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
                        </ErrorBoundary>
                    )}
                </div>
            </div>

            <style jsx>{`
                .idle-banner {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 20px;
                    background: #fef3c7;
                    border-bottom: 1px solid #fde68a;
                    color: #92400e;
                    font-size: 13px;
                    font-weight: 500;
                    position: sticky;
                    top: 0;
                    z-index: 200;
                }
                .idle-resume-btn {
                    margin-left: auto;
                    padding: 5px 14px;
                    background: #f59e0b;
                    color: #fff;
                    border: none;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .idle-resume-btn:hover {
                    background: #d97706;
                }
                .email-list-scroll {
                    flex: 1;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                }
                .empty-state-card {
                    padding: 4rem 2rem;
                    background: var(--bg-elevated);
                    border-radius: 12px;
                    border: 1px solid var(--border);
                    margin: 2rem auto;
                    max-width: 400px;
                    width: 100%;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
                }
                .empty-state-loading {
                    opacity: 0.3;
                }
                .empty-state-action {
                    margin-top: 1.5rem;
                }
            `}</style>
        </div>
    );
}
