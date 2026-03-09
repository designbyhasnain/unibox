'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ComposeModal from './components/ComposeModal';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
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
    markAsNotSpamAction,
    searchEmailsAction,
} from '../src/actions/emailActions';
import { getAccountsAction } from '../src/actions/accountActions';
import { useRealtimeInbox } from '../src/hooks/useRealtimeInbox';
import { useGlobalFilter } from './context/FilterContext';

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

const globalStageCache: Record<string, { emails: any[]; totalCount: number; totalPages: number; page: number }> = {};
let globalTabCountsCache: Record<string, number> = {};
let globalActiveStage = 'COLD_LEAD';
let globalThreadCache: Record<string, any[]> = {};

// Helper to keep caches in sync
const setStageCache = (stage: string, data: any) => {
    globalStageCache[stage] = data;
};

const clearAllCachesExcept = (activeId?: string) => {
    Object.keys(globalStageCache).forEach(k => {
        if (k !== activeId) delete globalStageCache[k];
    });
    // We don't clear globalThreadCache here as it's less sensitive to stage changes, 
    // but message-specific updates will handle it.
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InboxPage() {
    const { selectedAccountId, setSelectedAccountId } = useGlobalFilter();
    // ── Email List State ───────────────────────────────────────────────────────
    const [emails, setEmails] = useState<any[]>(() => globalStageCache[globalActiveStage]?.emails || []);
    const [totalCount, setTotalCount] = useState(() => globalStageCache[globalActiveStage]?.totalCount || 0);
    const [totalPages, setTotalPages] = useState(() => globalStageCache[globalActiveStage]?.totalPages || 0);
    const [currentPage, setCurrentPage] = useState(() => globalStageCache[globalActiveStage]?.page || 1);
    const [isLoading, setIsLoading] = useState(() => !globalStageCache[globalActiveStage]);
    const [activeStage, setActiveStage] = useState(globalActiveStage);
    const [searchTerm, setSearchTerm] = useState('');
    const [tabCounts, setTabCounts] = useState<Record<string, number>>(globalTabCountsCache);

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

    // ── Search State ───────────────────────────────────────────────────────────
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [isSearchResults, setIsSearchResults] = useState(false);

    // ─── Load Emails (no stale cache — always fresh from DB) ──────────────────
    const loadEmails = useCallback(async (page: number, stage?: string) => {
        const targetStage = stage || activeStage;
        const cacheKey = `${targetStage}_${selectedAccountId}_${page}`;
        const cached = globalStageCache[cacheKey];

        if (cached) {
            setEmails(cached.emails);
            setTotalCount(cached.totalCount);
            setTotalPages(cached.totalPages);
            setCurrentPage(cached.page);
            setTabCounts(globalTabCountsCache);
        } else {
            setIsLoading(true);
        }

        try {
            const [result, counts] = await Promise.all([
                getInboxEmailsAction(ADMIN_USER_ID, page, PAGE_SIZE, targetStage, selectedAccountId),
                getTabCountsAction(ADMIN_USER_ID, selectedAccountId)
            ]);

            // Safety filter: ensure returned emails strictly match the requested stage if it's not a special tab
            // This prevents the "seeing Cold in Lead tab" glitch if the backend returns stale/broad results.
            const filteredEmails = (targetStage !== 'ALL' && targetStage !== 'SPAM' && result.emails)
                ? result.emails.filter(e => {
                    const emailStage = e.pipeline_stage || 'COLD_LEAD';
                    return emailStage === targetStage;
                })
                : result.emails;

            setStageCache(cacheKey, {
                emails: filteredEmails,
                totalCount: (targetStage !== 'ALL' && targetStage !== 'SPAM') ? filteredEmails.length : result.totalCount,
                totalPages: result.totalPages,
                page: result.page
            });
            globalTabCountsCache = counts;

            // Only update local state if this is still the active stage and we aren't showing search results
            // Note: targetStage is captured in wait, activeStage is the current state.
            // When we switch tabs, a new loadEmails is created, but the old one might still be finishing.
            if (targetStage === globalActiveStage && !isSearchResults) {
                setEmails(filteredEmails);
                setTotalCount((targetStage !== 'ALL' && targetStage !== 'SPAM') ? filteredEmails.length : result.totalCount);
                setTotalPages(result.totalPages);
                setCurrentPage(result.page);
                setTabCounts(counts);
            }
        } catch (err) {
            console.error('loadEmails error:', err);
        } finally {
            if (targetStage === globalActiveStage) {
                setIsLoading(false);
            }
        }
    }, [activeStage, selectedAccountId, isSearchResults]);

    // Re-load when account filter changes
    useEffect(() => {
        // Clear caches for this account if needed, or just let loadEmails handle it
        loadEmails(1);
    }, [selectedAccountId, loadEmails]);

    // Initial load
    useEffect(() => { loadEmails(1); }, [loadEmails]);

    useEffect(() => {
        getAccountsAction(ADMIN_USER_ID)
            .then(data => {
                setAccounts(data);
                if (selectedAccountId !== 'ALL') {
                    const exists = data.some(a => a.id === selectedAccountId);
                    if (!exists) {
                        setSelectedAccountId('ALL');
                    }
                }
            })
            .catch((err) => console.error('Failed to fetch accounts:', err));
    }, [selectedAccountId, setSelectedAccountId]);

    const handleSearchSubmit = useCallback(async (e?: React.FormEvent | React.KeyboardEvent) => {
        if (e) e.preventDefault();
        if (!searchTerm.trim()) return;

        setSearchLoading(true);
        setIsSearchResults(true);
        try {
            const results = await searchEmailsAction(ADMIN_USER_ID, searchTerm, 100, selectedAccountId);
            setEmails(results);
            setTotalCount(results.length);
            setTotalPages(1);
            setCurrentPage(1);
            setSelectedEmail(null);
        } catch (err) {
            console.error('Search submit error:', err);
        } finally {
            setSearchLoading(false);
        }
    }, [searchTerm]);

    // ── Live Search ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (!searchTerm.trim()) {
            setSearchResults([]);
            setSearchLoading(false);
            return;
        }

        const timer = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const results = await searchEmailsAction(ADMIN_USER_ID, searchTerm, 8, selectedAccountId); // Top 8 suggestions
                setSearchResults(results);
            } catch (err) {
                console.error('Live search error:', err);
            } finally {
                setSearchLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Helpers
    const getInitial = (emailObj: any) => {
        const name = getSenderName(emailObj).replace(/^To:\s*/, '');
        const match = name.match(/^([A-Za-z])/);
        return match ? match[1]!.toUpperCase() : '?';
    };

    const getSenderName = (emailObj: any) => {
        if (!emailObj) return 'Unknown';
        if (emailObj.direction === 'SENT') {
            const toRaw = emailObj.to_email || '';
            const toNameMatch = toRaw.split(',')[0]?.match(/^([^<]+)</);
            const toName = toNameMatch ? toNameMatch[1]?.trim().replace(/"/g, '') : toRaw.split('@')[0];
            return `To: ${toName || 'Unknown'}`;
        } else {
            const fromRaw = emailObj.from_email || '';
            const fromNameMatch = fromRaw.match(/^([^<]+)</);
            const fromName = fromNameMatch ? fromNameMatch[1]?.trim().replace(/"/g, '') : fromRaw.split('@')[0];
            return fromName || 'Unknown';
        }
    };

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

        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

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
                // Clear caches on manual sync to ensure we get fresh data
                clearAllCachesExcept();
                globalThreadCache = {};
                // Use explicit stage and current page to prevent jumps
                loadEmails(currentPage, activeStage);
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

            // 1. Update Current View if active
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

            // 2. Update Cache for that stage to prevent tab-switch flicker
            const cached = globalStageCache[emailStage];
            if (cached) {
                const account = accounts.find((a) => a.id === newEmail.gmail_account_id);
                const emailWithAccount = {
                    ...newEmail,
                    gmail_accounts: {
                        email: account?.email || 'Unknown',
                        user: { name: account?.manager_name || 'System' }
                    },
                };
                const nextEmails = [
                    emailWithAccount,
                    ...cached.emails.filter(e => e.thread_id !== newEmail.thread_id)
                ].slice(0, PAGE_SIZE);

                setStageCache(emailStage, {
                    ...cached,
                    emails: nextEmails,
                    totalCount: cached.totalCount + 1
                });
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

        // Update Cache synchronously if it exists, to avoid stale tab switching
        const nextStage = updatedEmail.pipeline_stage || 'COLD_LEAD';
        Object.keys(globalStageCache).forEach(stageId => {
            const cached = globalStageCache[stageId];
            if (!cached) return;

            const shouldBeInThisCache = stageId === nextStage;
            const isCurrentlyInThisCache = cached.emails.some(e => e.id === updatedEmail.id);

            if (isCurrentlyInThisCache && !shouldBeInThisCache) {
                // Remove from this cache
                setStageCache(stageId, {
                    ...cached,
                    emails: cached.emails.filter(e => e.id !== updatedEmail.id),
                    totalCount: Math.max(0, cached.totalCount - 1)
                });
            } else if (shouldBeInThisCache) {
                // Add or Update in this cache
                const account = accounts.find((a) => a.id === updatedEmail.gmail_account_id);
                const withAccount = {
                    ...updatedEmail,
                    gmail_accounts: {
                        email: account?.email || 'Unknown',
                        user: { name: account?.manager_name || 'System' }
                    }
                };
                const exists = cached.emails.some(e => e.id === updatedEmail.id);
                let nextEmails;
                if (exists) {
                    nextEmails = cached.emails.map(e => e.id === updatedEmail.id ? { ...e, ...withAccount } : e);
                } else {
                    nextEmails = [withAccount, ...cached.emails.filter(e => e.thread_id !== updatedEmail.thread_id)].slice(0, PAGE_SIZE);
                }
                setStageCache(stageId, {
                    ...cached,
                    emails: nextEmails,
                    totalCount: exists ? cached.totalCount : cached.totalCount + 1
                });
            }
        });

        if (selectedEmail?.id === updatedEmail.id) {
            setSelectedEmail((prev: any) => ({ ...prev, ...updatedEmail }));
        }

        // Also update thread cache if applicable
        if (updatedEmail.thread_id) {
            const thread = globalThreadCache[updatedEmail.thread_id];
            if (thread) {
                globalThreadCache[updatedEmail.thread_id] = thread.map(m =>
                    m.id === updatedEmail.id ? { ...m, ...updatedEmail } : m
                );
            }
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

        if (email.thread_id && globalThreadCache[email.thread_id]) {
            setThreadMessages(globalThreadCache[email.thread_id] || []);
        } else {
            setThreadMessages([email]);
        }

        if (email.is_unread) {
            setEmails((prev) => prev.map((e) => e.id === email.id ? { ...e, is_unread: false } : e));
            await markEmailAsReadAction(email.id);
        }

        if (email.thread_id) {
            if (!globalThreadCache[email.thread_id]) setIsThreadLoading(true);
            try {
                const history = await getThreadMessagesAction(email.thread_id);
                globalThreadCache[email.thread_id] = history;
                setThreadMessages(history);
            } catch (err) {
                console.error('Failed to fetch thread history:', err);
            } finally {
                setIsThreadLoading(false);
            }
        }
    };

    const handleChangeStage = async (messageId: string, newStage: string) => {
        const target = emails.find(e => e.id === messageId);
        setEmails((prev) => {
            const shouldRemove = activeStage !== 'ALL' && activeStage !== 'SPAM' && newStage !== activeStage;
            if (shouldRemove) {
                return prev.filter((e) => {
                    const isMatch = e.id === messageId ||
                        (target?.contact_id && e.contact_id === target.contact_id) ||
                        (target?.from_email && e.from_email === target.from_email);
                    return !isMatch;
                });
            }
            return prev.map((e) => {
                const isMatch = e.id === messageId ||
                    (target?.contact_id && e.contact_id === target.contact_id) ||
                    (target?.from_email && e.from_email === target.from_email);
                return isMatch ? { ...e, pipeline_stage: newStage } : e;
            });
        });

        if (selectedEmail?.id === messageId ||
            (target?.contact_id && selectedEmail?.contact_id === target.contact_id) ||
            (target?.from_email && selectedEmail?.from_email === target.from_email)) {
            const shouldCloseDetail = activeStage !== 'ALL' && activeStage !== 'SPAM' && newStage !== activeStage;
            if (shouldCloseDetail) {
                setSelectedEmail(null);
            } else {
                setSelectedEmail((prev: any) => prev ? { ...prev, pipeline_stage: newStage } : null);
            }
        }

        await updateEmailStageAction(messageId, newStage);

        // Strategy: Clear other stage caches to force re-fetch on tab click, 
        // preventing "seeing old Cold emails in Lead tab" glitch
        clearAllCachesExcept(activeStage);

        loadEmails(currentPage, activeStage); // Refresh current view
    };

    const handleNotInterested = async (email: string) => {
        if (!email) return;
        // Optimization: immediately hide emails from this sender in UI
        setEmails((prev) => prev.filter(e => !e.from_email?.includes(email)));
        if (selectedEmail?.from_email?.includes(email)) {
            setSelectedEmail(null);
        }
        await markAsNotInterestedAction(email);
        loadEmails(currentPage, activeStage); // Pass activeStage to be consistent
    };

    const handleNotSpam = async (messageId: string) => {
        try {
            const res = await markAsNotSpamAction(messageId);
            if (res.success) {
                alert('Moved to Inbox');
            } else {
                alert(`Error: ${res.error}`);
            }
        } catch (err) {
            console.error('handleNotSpam error:', err);
            alert('An unexpected error occurred.');
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
                        loadEmails(1, activeStage);
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
                        const count = tabCounts[tab.id] || 0;
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

                                    // Instantly update from cache if available using the full key
                                    const cacheKey = `${tab.id}_${selectedAccountId}_1`;
                                    const cachedData = globalStageCache[cacheKey];

                                    if (cachedData) {
                                        setEmails(cachedData.emails);
                                        setTotalCount(cachedData.totalCount);
                                        setTotalPages(cachedData.totalPages);
                                        setCurrentPage(cachedData.page);
                                        setIsLoading(false);
                                    } else {
                                        // CRITICAL: Clear list and show loader if no cache, 
                                        // to prevent showing "Cold" emails under "Lead" tab while loading.
                                        setEmails([]);
                                        setTotalCount(0);
                                        setIsLoading(true);
                                    }
                                    // loadEmails(1) will be triggered via useEffect on activeStage change
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
                                <div className="gmail-list-header">
                                    <div className="gmail-lh-check" />
                                    <div className="gmail-lh-star" />
                                    <div className="gmail-lh-sender">SENDER</div>
                                    <div className="gmail-lh-body">SUBJECT / PREVIEW</div>
                                    <div className="gmail-lh-account">GMAIL ACCOUNT</div>
                                    <div className="gmail-lh-manager">MANAGER</div>
                                    <div className="gmail-lh-date">DATE</div>
                                </div>
                                {isLoading ? (
                                    <div className="empty-state">
                                        <div className="spinner spinner-lg" />
                                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 8 }}>
                                            Loading messages...
                                        </span>
                                    </div>
                                ) : emails.length === 0 ? (
                                    <div className="empty-state">
                                        <div className="empty-state-icon">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                                                <path d="M22 12l-10-9-10 9M9 21V12h6v9" />
                                            </svg>
                                        </div>
                                        <div className="empty-state-title">
                                            {isSearchResults ? 'No search results' : 'No messages'}
                                        </div>
                                        <div className="empty-state-desc">
                                            {isSearchResults
                                                ? `No messages found for "${searchTerm}"`
                                                : `Your ${TABS.find((t) => t.id === activeStage)?.label || 'Inbox'} is empty.`
                                            }
                                        </div>
                                    </div>
                                ) : (
                                    emails.map((email: any) => (
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
