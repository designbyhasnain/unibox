'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
    getInboxEmailsAction, 
    getSentEmailsAction, 
    getClientEmailsAction,
    getThreadMessagesAction,
    markEmailAsReadAction,
    markEmailAsUnreadAction,
    deleteEmailAction,
    bulkDeleteEmailsAction,
    bulkMarkAsReadAction,
    getTabCountsAction,
    searchEmailsAction
} from '../../src/actions/emailActions';
import { getAccountsAction } from '../../src/actions/accountActions';
import { useRealtimeInbox } from '../../src/hooks/useRealtimeInbox';
import { saveToLocalCache, getFromLocalCache } from '../utils/localCache';
import { doesEmailMatchTab } from '../constants/stages';

const ADMIN_USER_ID = '1ca1464d-1009-426e-96d5-8c5e8c84faac';
const PAGE_SIZE = 50;

export type MailboxType = 'inbox' | 'sent' | 'client' | 'search';

interface UseMailboxProps {
    type: MailboxType;
    activeStage?: string | undefined; // used for 'inbox'
    clientEmail?: string | undefined; // used for 'client'
    searchTerm?: string | undefined;  // used for 'search'
    selectedAccountId: string;
    enabled?: boolean;
}

// Durable global cache to prevent flicker on mount/navigation
const globalMailboxCache: Record<string, { emails: any[], totalCount: number, totalPages: number, page: number, timestamp: number }> = {};
let globalTabCountsCache: Record<string, Record<string, number>> = {};

/**
 * Aggressively flush ALL mailbox caches (memory + localStorage).
 * Called from FilterContext when user switches accounts so no stale data survives.
 */
export function flushAllMailboxCaches() {
    // Wipe memory caches completely
    Object.keys(globalMailboxCache).forEach(k => delete globalMailboxCache[k]);
    Object.keys(globalTabCountsCache).forEach(k => delete globalTabCountsCache[k]);

    // Wipe localStorage caches
    if (typeof window !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('unibox_cache_mailbox_') || key.startsWith('unibox_cache_inbox_tabs_'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    }
}

export function useMailbox({ type, activeStage, clientEmail, searchTerm, selectedAccountId, enabled = true }: UseMailboxProps) {
    // 1. Generate a robust cache key
    const getCacheKey = useCallback(() => {
        if (type === 'inbox') return `inbox_${activeStage}_${selectedAccountId}`;
        if (type === 'sent') return `sent_${selectedAccountId}`;
        if (type === 'client') return `client_${clientEmail}_${selectedAccountId}`;
        if (type === 'search') return `search_${searchTerm}_${selectedAccountId}`;
        return 'default';
    }, [type, activeStage, clientEmail, searchTerm, selectedAccountId]);

    const cacheKey = getCacheKey();
    
    // Durable initialization logic
    const getInitialData = () => {
        if (!enabled) return null;
        if (globalMailboxCache[cacheKey]) return globalMailboxCache[cacheKey];
        if (typeof window !== 'undefined') {
            const saved = getFromLocalCache(`mailbox_${cacheKey}`);
            if (saved) {
                globalMailboxCache[cacheKey] = saved;
                return saved;
            }
        }
        return null;
    };

    const initialCache = getInitialData();

    // ── State ────────────────────────────────────────────────────────────────
    const [emails, setEmails] = useState<any[]>(() => initialCache?.emails || []);
    const [totalCount, setTotalCount] = useState(() => initialCache?.totalCount || 0);
    const [totalPages, setTotalPages] = useState(() => initialCache?.totalPages || 0);
    const [currentPage, setCurrentPage] = useState(() => initialCache?.page || 1);
    const [isLoading, setIsLoading] = useState(() => enabled && !initialCache);
    
    // Tab counts hydration
    const activeCountsKey = `inbox_tabs_${selectedAccountId}`;
    const [tabCounts, setTabCounts] = useState<Record<string, number>>(() => {
        if (globalTabCountsCache[activeCountsKey]) return globalTabCountsCache[activeCountsKey];
        if (typeof window !== 'undefined') {
            const saved = getFromLocalCache(activeCountsKey);
            if (saved) {
                globalTabCountsCache[activeCountsKey] = saved;
                return saved;
            }
        }
        return {};
    });

    // --- State for email detail (declared early so sync transition block can clear them) ---
    const [selectedEmail, setSelectedEmail] = useState<any>(null);
    const [threadMessages, setThreadMessages] = useState<any[]>([]);
    const [isThreadLoading, setIsThreadLoading] = useState(false);

    // --- Synchronous Derived State to eliminate visual lag during transitions ---
    const [prevCacheKey, setPrevCacheKey] = useState(cacheKey);
    const [prevCountsKey, setPrevCountsKey] = useState(activeCountsKey);

    if (cacheKey !== prevCacheKey) {
        const prevAccount = prevCacheKey.split('_').pop();
        const newAccount = cacheKey.split('_').pop();
        const accountChanged = prevAccount !== newAccount;
        setPrevCacheKey(cacheKey);

        // On account change: aggressively clear everything — no stale data
        if (accountChanged) {
            setSelectedEmail(null);
            setThreadMessages([]);
            setEmails([]);
            setTotalCount(0);
            setTotalPages(0);
            setCurrentPage(1);
            setIsLoading(enabled);
        } else {
            // Same account, different tab/stage — try cache
            let syncCache = globalMailboxCache[cacheKey];
            if (!syncCache && typeof window !== 'undefined' && type !== 'search') {
                syncCache = getFromLocalCache(`mailbox_${cacheKey}`);
            }
            if (syncCache) {
                globalMailboxCache[cacheKey] = syncCache;
                setEmails(syncCache.emails);
                setTotalCount(syncCache.totalCount);
                setTotalPages(syncCache.totalPages);
                setCurrentPage(syncCache.page);
                setIsLoading(false);
            } else {
                setEmails([]);
                setTotalCount(0);
                setTotalPages(0);
                setCurrentPage(1);
                setIsLoading(enabled);
            }
        }
    }

    if (activeCountsKey !== prevCountsKey && type === 'inbox') {
        setPrevCountsKey(activeCountsKey);
        let syncCounts = globalTabCountsCache[activeCountsKey];
        if (!syncCounts && typeof window !== 'undefined') {
            syncCounts = getFromLocalCache(activeCountsKey);
        }
        if (syncCounts) {
            globalTabCountsCache[activeCountsKey] = syncCounts;
            setTabCounts(syncCounts);
        } else {
            setTabCounts({});
        }
    }
    
    const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
    const [accounts, setAccounts] = useState<any[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');

    const lastSyncTimeRef = useRef<number>(0);

    // ── Actions ───────────────────────────────────────────────────────────────

    const loadEmails = useCallback(async (page: number = 1) => {
        if (!enabled) return;
        if (type === 'client' && !clientEmail) return;
        if (type === 'search' && !searchTerm) return;

        const currentCacheKey = getCacheKey();
        const cached = globalMailboxCache[currentCacheKey];
        
        // Show cached data immediately if page matches
        if (cached && cached.page === page) {
            setEmails(cached.emails);
            setTotalCount(cached.totalCount);
            setTotalPages(cached.totalPages);
            setCurrentPage(cached.page);
            setIsLoading(false);
        } else {
            setIsLoading(true);
            // Clear prior state immediately if no cache exists to prevent stale UI ghosting
            if (!cached && page === 1) {
                setEmails([]);
                setTotalCount(0);
                setTotalPages(0);
            }
        }

        if (type === 'inbox') {
            const countsKey = `inbox_tabs_${selectedAccountId}`;
            const cachedCounts = globalTabCountsCache[countsKey] || getFromLocalCache(countsKey);
            if (cachedCounts) {
                setTabCounts(cachedCounts);
            } else {
                setTabCounts({});
            }
        }

        try {
            let result: any;
            let counts: any = null;

            if (type === 'inbox') {
                [result, counts] = await Promise.all([
                    getInboxEmailsAction(ADMIN_USER_ID, page, PAGE_SIZE, activeStage, selectedAccountId),
                    getTabCountsAction(ADMIN_USER_ID, selectedAccountId)
                ]);
            } else if (type === 'sent') {
                result = await getSentEmailsAction(ADMIN_USER_ID, page, PAGE_SIZE, selectedAccountId);
            } else if (type === 'client') {
                if (!clientEmail) return;
                const fetchedEmails = await getClientEmailsAction(ADMIN_USER_ID, clientEmail, selectedAccountId);
                result = { emails: fetchedEmails, totalCount: fetchedEmails.length, totalPages: 1, page: 1 };
            } else if (type === 'search') {
                if (!searchTerm) return;
                const fetchedEmails = await searchEmailsAction(ADMIN_USER_ID, searchTerm, 100, selectedAccountId);
                result = { emails: fetchedEmails, totalCount: fetchedEmails.length, totalPages: 1, page: 1 };
            }

            // Verify we are still on the same view
            if (getCacheKey() !== currentCacheKey) return;

            // If an error occurred in the action, don't overwrite the cache/state with empty data
            if (result && result.error) {
                console.warn('[useMailbox] Action returned error, keeping existing cache.');
                return;
            }

            if (result && result.emails) {
                const newCacheEntry = {
                    emails: result.emails,
                    totalCount: result.totalCount,
                    totalPages: result.totalPages,
                    page: result.page,
                    timestamp: Date.now()
                };
                globalMailboxCache[currentCacheKey] = newCacheEntry;
                
                setEmails(result.emails);
                setTotalCount(result.totalCount);
                setTotalPages(result.totalPages);
                setCurrentPage(result.page);
                
                if (counts) {
                    const countsKey = `inbox_tabs_${selectedAccountId}`;
                    globalTabCountsCache[countsKey] = counts;
                    setTabCounts(counts);
                    saveToLocalCache(countsKey, counts);
                }
                
                // Also persist to localStorage for ultra-persistent caching, skipped for search to avoid bloat
                if (type !== 'search') {
                    saveToLocalCache(`mailbox_${currentCacheKey}`, newCacheEntry);
                }
            }
        } catch (err) {
            console.error('[useMailbox] Load failed:', err);
            // On error, keep existing emails if they came from cache
        } finally {
            if (getCacheKey() === currentCacheKey) {
                setIsLoading(false);
            }
        }
    }, [type, activeStage, clientEmail, searchTerm, selectedAccountId, getCacheKey, enabled]);

    // Initial Load & Account Fetch
    useEffect(() => {
        loadEmails(1);
        if (accounts.length === 0) {
            getAccountsAction(ADMIN_USER_ID).then(res => {
                if (res.success) setAccounts(res.accounts);
            });
        }
    }, [loadEmails, accounts.length]);

    // ── Sync Logic ────────────────────────────────────────────────────────────
    const handleSync = useCallback(async () => {
        if (isSyncing || accounts.length === 0) return;

        setIsSyncing(true);
        lastSyncTimeRef.current = Date.now();
        setSyncMessage(`Syncing ${accounts.length} account${accounts.length > 1 ? 's' : ''}...`);

        try {
            await Promise.allSettled(
                accounts.map(a => fetch('/api/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accountId: a.id }),
                }))
            );
            
            // Allow DB to settle
            setTimeout(() => {
                setIsSyncing(false);
                setSyncMessage('');
                loadEmails(currentPage);
            }, 1500);
        } catch (err) {
            setIsSyncing(false);
            setSyncMessage('Sync failed');
        }
    }, [isSyncing, accounts, loadEmails, currentPage]);

    // ── Realtime Updates ──────────────────────────────────────────────────────
    const handleNewEmail = useCallback((newEmail: any) => {
        // Enforce basic matching logic
        const matchesAccount = selectedAccountId === 'ALL' || newEmail.gmail_account_id === selectedAccountId;
        if (!matchesAccount) return;

        if (type === 'inbox') {
            const matchesStage = doesEmailMatchTab(newEmail.pipeline_stage, activeStage || '');
            if (!matchesStage) return;
        } else if (type === 'sent') {
            if (newEmail.direction !== 'SENT') return;
        } else if (type === 'client') {
            if (!newEmail.from_email?.includes(clientEmail!) && !newEmail.to_email?.includes(clientEmail!)) return;
        }

        setEmails(prev => {
            const filtered = prev.filter(e => e.thread_id !== newEmail.thread_id);
            // Enrich with account info if available in local state
            const account = accounts.find(a => a.id === newEmail.gmail_account_id);
            const enriched = {
                ...newEmail,
                gmail_accounts: account ? {
                    email: account.email,
                    user: { name: account.manager_name }
                } : newEmail.gmail_accounts
            };
            return [enriched, ...filtered].slice(0, PAGE_SIZE);
        });
        setTotalCount((prev: number) => prev + 1);
        
        // Update Cache synchronously
        const currentKey = getCacheKey();
        if (globalMailboxCache[currentKey]) {
            const cached = globalMailboxCache[currentKey];
            const nextEmails = [newEmail, ...cached.emails.filter(e => e.thread_id !== newEmail.thread_id)].slice(0, PAGE_SIZE);
            globalMailboxCache[currentKey] = { ...cached, emails: nextEmails, totalCount: cached.totalCount + 1 };
        }
    }, [type, activeStage, clientEmail, selectedAccountId, accounts, getCacheKey]);

    const handleEmailUpdated = useCallback((updated: any) => {
        setEmails(prev => {
            const exists = prev.some(e => e.id === updated.id);
            if (!exists) return prev;
            return prev.map(e => e.id === updated.id ? { ...e, ...updated } : e);
        });
        
        // Update thread if open
        if (selectedEmail?.thread_id === updated.thread_id) {
            setThreadMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
        }

        // Correctly update ALL relevant caches
        Object.keys(globalMailboxCache).forEach(key => {
            const cached = globalMailboxCache[key];
            if (cached && cached.emails.some(e => e.id === updated.id)) {
                cached.emails = cached.emails.map(e => e.id === updated.id ? { ...e, ...updated } : e);
            }
        });
    }, [selectedEmail]);

    const handleEmailDeleted = useCallback((id: string) => {
        setEmails(prev => prev.filter(e => e.id !== id));
        if (selectedEmail?.id === id) setSelectedEmail(null);
        
        // Update caches
        Object.keys(globalMailboxCache).forEach(key => {
            const cached = globalMailboxCache[key];
            if (cached && cached.emails.some(e => e.id === id)) {
                cached.emails = cached.emails.filter(e => e.id !== id);
                cached.totalCount = Math.max(0, cached.totalCount - 1);
            }
        });
    }, [selectedEmail]);

    useRealtimeInbox({
        accountIds: accounts.map(a => a.id),
        onNewEmail: handleNewEmail,
        onEmailUpdated: handleEmailUpdated,
        onEmailDeleted: handleEmailDeleted,
    });

    // ── Interaction Handlers ──────────────────────────────────────────────────
    const handleSelectEmail = useCallback(async (email: any) => {
        setSelectedEmail(email);
        setThreadMessages([email]);
        
        if (email.is_unread) {
            setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_unread: false } : e));
            markEmailAsReadAction(email.id); // fire and forget
        }

        if (email.thread_id) {
            setIsThreadLoading(true);
            try {
                const history = await getThreadMessagesAction(email.thread_id);
                setThreadMessages(history);
            } catch (err) {
                console.error('Thread load failed', err);
            } finally {
                setIsThreadLoading(false);
            }
        }
    }, []);

    const toggleSelectEmail = (id: string) => {
        setSelectedEmailIds(prev => {
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
            setSelectedEmailIds(new Set(emails.map(e => e.id)));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this message?')) return;
        handleEmailDeleted(id);
        const res = await deleteEmailAction(id);
        if (!res.success) loadEmails(currentPage);
    };

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedEmailIds);
        if (!ids.length || !confirm(`Delete ${ids.length} messages?`)) return;
        setEmails(prev => prev.filter(e => !selectedEmailIds.has(e.id)));
        setSelectedEmailIds(new Set());
        await bulkDeleteEmailsAction(ids);
        loadEmails(currentPage);
    };

    const handleToggleRead = async (id: string, currentUnread: boolean) => {
        const next = !currentUnread;
        setEmails(prev => prev.map(e => e.id === id ? { ...e, is_unread: next } : e));
        if (next) await markEmailAsUnreadAction(id);
        else await markEmailAsReadAction(id);
    };

    const handleBulkMarkAsRead = async () => {
        const ids = Array.from(selectedEmailIds);
        if (!ids.length) return;
        setEmails(prev => prev.map(e => selectedEmailIds.has(e.id) ? { ...e, is_unread: false } : e));
        setSelectedEmailIds(new Set());
        await bulkMarkAsReadAction(ids);
    };

    return {
        // State
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

        // Setters
        setSelectedEmail,
        setCurrentPage,

        // Actions
        loadEmails,
        handleSync,
        handleSelectEmail,
        toggleSelectEmail,
        toggleSelectAll,
        handleDelete,
        handleBulkDelete,
        handleToggleRead,
        handleBulkMarkAsRead,
    };
}
