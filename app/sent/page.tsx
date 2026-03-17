'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Keyboard } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import ComposeModal from '../components/ComposeModal';
import InlineReply from '../components/InlineReply';
import { useMailbox } from '../hooks/useMailbox';
import { EmailRow, EmailDetail, PaginationControls, ToastStack } from '../components/InboxComponents';
import { useGlobalFilter } from '../context/FilterContext';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

interface ToastItem { id: string; subject: string; to: string; }

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
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

    const toastTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // Cleanup toast timers on unmount
    useEffect(() => {
        return () => {
            toastTimerRef.current.forEach((timer) => clearTimeout(timer));
            toastTimerRef.current.clear();
        };
    }, []);

    // Derive live status from whether accounts are loaded
    const isLive = accounts.length > 0;

    const filteredEmails = emails.filter((e: any) => {
        if (!searchTerm) return true;
        const sl = searchTerm.toLowerCase();
        return (
            (e.subject && e.subject.toLowerCase().includes(sl)) ||
            (e.to_email && e.to_email.toLowerCase().includes(sl)) ||
            ((e.body_text || e.body || '').toLowerCase().includes(sl))
        );
    });

    // ── Keyboard & Shortcuts ──────────────────────────────────────────────────
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        const tag = (document.activeElement?.tagName || '').toUpperCase();
        const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
            || (document.activeElement as HTMLElement)?.isContentEditable;

        if (e.key === 'Escape') {
            if (showShortcutsHelp) {
                setShowShortcutsHelp(false);
                return;
            }
            setSelectedEmail(null);
            const searchInput = document.getElementById('topbar-search') as HTMLInputElement | null;
            if (searchInput && document.activeElement === searchInput) {
                searchInput.blur();
            }
            return;
        }

        if (isEditable) return;

        switch (e.key) {
            case '?': {
                e.preventDefault();
                setShowShortcutsHelp(prev => !prev);
                break;
            }
            case 'j': {
                e.preventDefault();
                if (filteredEmails.length === 0) break;
                if (!selectedEmail) {
                    handleSelectEmail(filteredEmails[0]);
                } else {
                    const idx = filteredEmails.findIndex((em: any) => em.id === selectedEmail.id);
                    if (idx < filteredEmails.length - 1) {
                        handleSelectEmail(filteredEmails[idx + 1]);
                    }
                }
                break;
            }
            case 'k': {
                e.preventDefault();
                if (filteredEmails.length === 0) break;
                if (!selectedEmail) {
                    handleSelectEmail(filteredEmails[filteredEmails.length - 1]);
                } else {
                    const idx = filteredEmails.findIndex((em: any) => em.id === selectedEmail.id);
                    if (idx > 0) {
                        handleSelectEmail(filteredEmails[idx - 1]);
                    }
                }
                break;
            }
            case 'Enter':
            case 'o': {
                if (!selectedEmail && filteredEmails.length > 0) {
                    handleSelectEmail(filteredEmails[0]);
                }
                break;
            }
            case 'c': {
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    setIsComposeOpen(true);
                }
                break;
            }
            case '/': {
                e.preventDefault();
                const searchInput = document.getElementById('topbar-search') as HTMLInputElement | null;
                if (searchInput) {
                    searchInput.focus();
                }
                break;
            }
            case 'a': {
                e.preventDefault();
                toggleSelectAll();
                break;
            }
            case 'x': {
                e.preventDefault();
                if (selectedEmail) {
                    toggleSelectEmail(selectedEmail.id);
                }
                break;
            }
        }
    }, [selectedEmail, filteredEmails, showShortcutsHelp, setSelectedEmail, handleSelectEmail, toggleSelectAll, toggleSelectEmail]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

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
                        selectedEmail ? (
                            <button
                                className="mobile-back-btn"
                                onClick={() => setSelectedEmail(null)}
                                aria-label="Back to sent items"
                            >
                                ← Back
                            </button>
                        ) : (
                            <h1 className="page-title">Sent</h1>
                        )
                    }
                    rightContent={
                        <div className="topbar-actions">
                            {syncMessage && (
                                <span className="sync-message">{syncMessage}</span>
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
                                aria-label="Sync messages"
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
                            <button
                                className="icon-btn"
                                onClick={() => setShowShortcutsHelp(prev => !prev)}
                                title="Keyboard shortcuts (?)"
                                aria-label="Show keyboard shortcuts"
                            >
                                <Keyboard size={16} />
                            </button>
                            <div className="avatar-btn" title="Admin">A</div>
                        </div>
                    }
                />

                {/* Tab bar */}
                <div className="tabs-bar" role="tablist" aria-label="Sent mail tabs">
                    <div className="tab active" id="tab-sent" role="tab" aria-selected="true">Sent Items</div>
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
                                            <button className="icon-btn sm danger" title="Delete selected" aria-label="Delete selected" onClick={handleBulkDelete}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                            </button>
                                            <button className="icon-btn sm" title="Mark Read" aria-label="Mark as read" onClick={handleBulkMarkAsRead} disabled={selectedEmailIds.size === 0}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            </button>
                                        </>
                                    )}
                                    <div className="divider-v" />
                                    <span className="toolbar-label">
                                        Outgoing
                                    </span>
                                </div>
                                <div className="list-toolbar-right">
                                    <span className="count-label">
                                        {searchTerm
                                            ? `${filteredEmails.length} result${filteredEmails.length !== 1 ? 's' : ''} (filtering current page)`
                                            : totalCount > 0
                                                ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString()}`
                                                : ''}
                                    </span>
                                </div>
                            </div>

                            {/* Email rows */}
                            <div id="sent-list-scroll" className="scroll-list">
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

                            {!searchTerm && (
                                <PaginationControls
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    totalCount={totalCount}
                                    pageSize={PAGE_SIZE}
                                    onGoToPage={goToPage}
                                />
                            )}
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

            {/* Keyboard Shortcuts Help Overlay */}
            {showShortcutsHelp && (
                <div className="shortcuts-overlay" onClick={() => setShowShortcutsHelp(false)}>
                    <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="shortcuts-header">
                            <h2>Keyboard Shortcuts</h2>
                            <button className="icon-btn" onClick={() => setShowShortcutsHelp(false)} aria-label="Close shortcuts help">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="shortcuts-grid">
                            <div className="shortcut-row"><kbd>j</kbd><span>Next email</span></div>
                            <div className="shortcut-row"><kbd>k</kbd><span>Previous email</span></div>
                            <div className="shortcut-row"><kbd>Enter</kbd><span>Open email</span></div>
                            <div className="shortcut-row"><kbd>c</kbd><span>Compose</span></div>
                            <div className="shortcut-row"><kbd>/</kbd><span>Search</span></div>
                            <div className="shortcut-row"><kbd>a</kbd><span>Select all</span></div>
                            <div className="shortcut-row"><kbd>x</kbd><span>Toggle select</span></div>
                            <div className="shortcut-row"><kbd>Esc</kbd><span>Close</span></div>
                            <div className="shortcut-row"><kbd>?</kbd><span>This help</span></div>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .page-title {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin: 0;
                }
                .sync-message {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }
                .toolbar-label {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--text-muted);
                }
                .scroll-list {
                    flex: 1;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                }
                .shortcuts-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    backdrop-filter: blur(2px);
                }
                .shortcuts-modal {
                    background: var(--bg-elevated);
                    border-radius: 12px;
                    border: 1px solid var(--border);
                    padding: 1.5rem;
                    min-width: 340px;
                    max-width: 440px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                }
                .shortcuts-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 1.25rem;
                    padding-bottom: 0.75rem;
                    border-bottom: 1px solid var(--border);
                }
                .shortcuts-header h2 {
                    margin: 0;
                    font-size: 1rem;
                    font-weight: 700;
                    color: var(--text-primary);
                }
                .shortcuts-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0.5rem 1.5rem;
                }
                .shortcut-row {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.35rem 0;
                }
                .shortcut-row kbd {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 28px;
                    padding: 2px 8px;
                    font-size: 0.75rem;
                    font-family: inherit;
                    font-weight: 600;
                    color: var(--text-secondary);
                    background: var(--bg-primary);
                    border: 1px solid var(--border);
                    border-radius: 5px;
                    box-shadow: 0 1px 0 var(--border);
                }
                .shortcut-row span {
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                }
            `}</style>
        </>
    );
}
