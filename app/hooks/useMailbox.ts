'use client';

import { useReducer, useEffect, useCallback, useRef } from 'react';
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

const PAGE_SIZE = 50;

export type MailboxType = 'inbox' | 'sent' | 'client' | 'search';

interface UseMailboxProps {
    type: MailboxType;
    activeStage?: string | undefined; // used for 'inbox'
    clientEmail?: string | undefined; // used for 'client'
    searchTerm?: string | undefined;  // used for 'search'
    selectedAccountId: string;
    enabled?: boolean;
    accounts?: any[]; // optional pre-fetched accounts (FE-025)
}

// Durable global cache to prevent flicker on mount/navigation
const globalMailboxCache: Record<string, { emails: any[], totalCount: number, totalPages: number, page: number, timestamp: number }> = {};
let globalTabCountsCache: Record<string, Record<string, number>> = {};
let globalTabCountsTimestamp: Record<string, number> = {};
const globalThreadCache: Record<string, { data: any[], timestamp: number }> = {};
const THREAD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const THREAD_CACHE_MAX_SIZE = 100;
const TAB_COUNTS_TTL = 30_000; // 30 seconds

/**
 * Aggressively flush ALL mailbox caches (memory + localStorage).
 * Called from FilterContext when user switches accounts so no stale data survives.
 */
export function flushAllMailboxCaches() {
    // Wipe memory caches completely
    Object.keys(globalMailboxCache).forEach(k => delete globalMailboxCache[k]);
    Object.keys(globalTabCountsCache).forEach(k => delete globalTabCountsCache[k]);
    Object.keys(globalTabCountsTimestamp).forEach(k => delete globalTabCountsTimestamp[k]);

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

// ── Reducer ────────────────────────────────────────────────────────────────

interface MailboxState {
    emails: any[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    isLoading: boolean;
    tabCounts: Record<string, number>;
    selectedEmail: any;
    threadMessages: any[];
    isThreadLoading: boolean;
    selectedEmailIds: Set<string>;
    accounts: any[];
    isSyncing: boolean;
    syncMessage: string;
    prevCacheKey: string;
    prevCountsKey: string;
}

type MailboxAction =
    | { type: 'SET_LOADING'; isLoading: boolean }
    | { type: 'SET_EMAILS'; emails: any[]; totalCount: number; totalPages: number; page: number }
    | { type: 'CLEAR_FOR_NEW_KEY'; prevCacheKey: string; isLoading: boolean; accountChanged: boolean }
    | { type: 'RESTORE_FROM_CACHE'; prevCacheKey: string; emails: any[]; totalCount: number; totalPages: number; page: number }
    | { type: 'SET_SELECTED'; selectedEmail: any }
    | { type: 'SET_TAB_COUNTS'; tabCounts: Record<string, number>; prevCountsKey?: string }
    | { type: 'UPDATE_EMAILS'; updater: (prev: any[]) => any[] }
    | { type: 'SET_THREAD'; threadMessages: any[]; isThreadLoading?: boolean }
    | { type: 'SET_THREAD_LOADING'; isThreadLoading: boolean }
    | { type: 'SET_SELECTED_IDS'; selectedEmailIds: Set<string> }
    | { type: 'SET_ACCOUNTS'; accounts: any[] }
    | { type: 'SET_SYNCING'; isSyncing: boolean; syncMessage: string }
    | { type: 'SET_EMAILS_AND_COUNTS'; emails: any[]; totalCount: number; totalPages: number; page: number; tabCounts: Record<string, number> }
    | { type: 'UPDATE_TOTAL_COUNT'; delta: number }
    | { type: 'UPDATE_THREAD_MESSAGES'; updater: (prev: any[]) => any[] }
    | { type: 'SELECT_EMAIL_AND_THREAD'; selectedEmail: any; threadMessages: any[] }
    | { type: 'CLEAR_CACHE_LOADING'; emails: any[]; totalCount: number; totalPages: number };

function mailboxReducer(state: MailboxState, action: MailboxAction): MailboxState {
    switch (action.type) {
        case 'SET_LOADING':
            return { ...state, isLoading: action.isLoading };

        case 'SET_EMAILS':
            return {
                ...state,
                emails: action.emails,
                totalCount: action.totalCount,
                totalPages: action.totalPages,
                currentPage: action.page,
                isLoading: false,
            };

        case 'CLEAR_FOR_NEW_KEY':
            if (action.accountChanged) {
                return {
                    ...state,
                    prevCacheKey: action.prevCacheKey,
                    selectedEmail: null,
                    threadMessages: [],
                    emails: [],
                    totalCount: 0,
                    totalPages: 0,
                    currentPage: 1,
                    isLoading: action.isLoading,
                };
            }
            // Same account, no cache — clear list state
            return {
                ...state,
                prevCacheKey: action.prevCacheKey,
                emails: [],
                totalCount: 0,
                totalPages: 0,
                currentPage: 1,
                isLoading: action.isLoading,
            };

        case 'RESTORE_FROM_CACHE':
            return {
                ...state,
                prevCacheKey: action.prevCacheKey,
                emails: action.emails,
                totalCount: action.totalCount,
                totalPages: action.totalPages,
                currentPage: action.page,
                isLoading: false,
            };

        case 'SET_SELECTED':
            return { ...state, selectedEmail: action.selectedEmail };

        case 'SET_TAB_COUNTS':
            return {
                ...state,
                tabCounts: action.tabCounts,
                ...(action.prevCountsKey !== undefined ? { prevCountsKey: action.prevCountsKey } : {}),
            };

        case 'UPDATE_EMAILS':
            return { ...state, emails: action.updater(state.emails) };

        case 'SET_THREAD':
            return {
                ...state,
                threadMessages: action.threadMessages,
                ...(action.isThreadLoading !== undefined ? { isThreadLoading: action.isThreadLoading } : {}),
            };

        case 'SET_THREAD_LOADING':
            return { ...state, isThreadLoading: action.isThreadLoading };

        case 'SET_SELECTED_IDS':
            return { ...state, selectedEmailIds: action.selectedEmailIds };

        case 'SET_ACCOUNTS':
            return { ...state, accounts: action.accounts };

        case 'SET_SYNCING':
            return { ...state, isSyncing: action.isSyncing, syncMessage: action.syncMessage };

        case 'SET_EMAILS_AND_COUNTS':
            return {
                ...state,
                emails: action.emails,
                totalCount: action.totalCount,
                totalPages: action.totalPages,
                currentPage: action.page,
                tabCounts: action.tabCounts,
                isLoading: false,
            };

        case 'UPDATE_TOTAL_COUNT':
            return { ...state, totalCount: state.totalCount + action.delta };

        case 'UPDATE_THREAD_MESSAGES':
            return { ...state, threadMessages: action.updater(state.threadMessages) };

        case 'SELECT_EMAIL_AND_THREAD':
            return { ...state, selectedEmail: action.selectedEmail, threadMessages: action.threadMessages };

        case 'CLEAR_CACHE_LOADING':
            return {
                ...state,
                emails: action.emails,
                totalCount: action.totalCount,
                totalPages: action.totalPages,
                isLoading: true,
            };

        default:
            return state;
    }
}

export function useMailbox({ type, activeStage, clientEmail, searchTerm, selectedAccountId, enabled = true, accounts: initialAccounts }: UseMailboxProps) {
    // 1. Generate a robust cache key
    const getCacheKey = useCallback(() => {
        if (type === 'inbox') return `inbox_${activeStage}_${selectedAccountId}`;
        if (type === 'sent') return `sent_${selectedAccountId}`;
        if (type === 'client') return `client_${clientEmail}_${selectedAccountId}`;
        if (type === 'search') return `search_${searchTerm}_${selectedAccountId}`;
        return 'default';
    }, [type, activeStage, clientEmail, searchTerm, selectedAccountId]);

    const cacheKey = getCacheKey();
    const activeCountsKey = `inbox_tabs_${selectedAccountId}`;

    // Durable initialization logic
    const getInitialState = (): MailboxState => {
        let initialCache: any = null;
        if (enabled) {
            if (globalMailboxCache[cacheKey]) {
                initialCache = globalMailboxCache[cacheKey];
            } else if (typeof window !== 'undefined') {
                const saved = getFromLocalCache(`mailbox_${cacheKey}`);
                if (saved) {
                    globalMailboxCache[cacheKey] = saved;
                    initialCache = saved;
                }
            }
        }

        let initialTabCounts: Record<string, number> = {};
        if (globalTabCountsCache[activeCountsKey]) {
            initialTabCounts = globalTabCountsCache[activeCountsKey];
        } else if (typeof window !== 'undefined') {
            const saved = getFromLocalCache(activeCountsKey);
            if (saved) {
                globalTabCountsCache[activeCountsKey] = saved;
                initialTabCounts = saved;
            }
        }

        return {
            emails: initialCache?.emails || [],
            totalCount: initialCache?.totalCount || 0,
            totalPages: initialCache?.totalPages || 0,
            currentPage: initialCache?.page || 1,
            isLoading: enabled && !initialCache,
            tabCounts: initialTabCounts,
            selectedEmail: null,
            threadMessages: [],
            isThreadLoading: false,
            selectedEmailIds: new Set(),
            accounts: [],
            isSyncing: false,
            syncMessage: '',
            prevCacheKey: cacheKey,
            prevCountsKey: activeCountsKey,
        };
    };

    const [state, dispatch] = useReducer(mailboxReducer, undefined, getInitialState);

    const {
        emails, totalCount, totalPages, currentPage, isLoading,
        tabCounts, selectedEmail, threadMessages, isThreadLoading,
        selectedEmailIds, accounts, isSyncing, syncMessage,
        prevCacheKey, prevCountsKey,
    } = state;

    // --- Synchronous Derived State to eliminate visual lag during transitions ---
    if (cacheKey !== prevCacheKey) {
        const prevAccount = prevCacheKey.split('_').pop();
        const newAccount = cacheKey.split('_').pop();
        const accountChanged = prevAccount !== newAccount;

        if (accountChanged) {
            // On account change: aggressively clear everything — no stale data
            dispatch({ type: 'CLEAR_FOR_NEW_KEY', prevCacheKey: cacheKey, isLoading: enabled, accountChanged: true });
        } else {
            // Same account, different tab/stage — try FRESH memory cache only (not stale localStorage)
            const syncCache = globalMailboxCache[cacheKey];
            if (syncCache && (Date.now() - syncCache.timestamp < 30_000)) {
                // Only use cache if less than 30 seconds old
                dispatch({
                    type: 'RESTORE_FROM_CACHE',
                    prevCacheKey: cacheKey,
                    emails: syncCache.emails,
                    totalCount: syncCache.totalCount,
                    totalPages: syncCache.totalPages,
                    page: syncCache.page,
                });
            } else {
                dispatch({ type: 'CLEAR_FOR_NEW_KEY', prevCacheKey: cacheKey, isLoading: enabled, accountChanged: false });
            }
        }
    }

    if (activeCountsKey !== prevCountsKey && type === 'inbox') {
        let syncCounts = globalTabCountsCache[activeCountsKey];
        if (!syncCounts && typeof window !== 'undefined') {
            syncCounts = getFromLocalCache(activeCountsKey);
        }
        if (syncCounts) {
            globalTabCountsCache[activeCountsKey] = syncCounts;
            dispatch({ type: 'SET_TAB_COUNTS', tabCounts: syncCounts, prevCountsKey: activeCountsKey });
        } else {
            dispatch({ type: 'SET_TAB_COUNTS', tabCounts: {}, prevCountsKey: activeCountsKey });
        }
    }

    const lastSyncTimeRef = useRef<number>(0);
    const currentPageRef = useRef(currentPage);
    currentPageRef.current = currentPage;
    const selectedEmailRef = useRef(selectedEmail);
    selectedEmailRef.current = selectedEmail;
    const loadRequestIdRef = useRef(0);

    // ── Actions ───────────────────────────────────────────────────────────────

    const loadEmails = useCallback(async (page: number = 1) => {
        if (!enabled) return;
        if (type === 'client' && !clientEmail) return;
        if (type === 'search' && !searchTerm) return;

        // Increment request ID to cancel stale in-flight requests
        const requestId = ++loadRequestIdRef.current;
        const currentCacheKey = getCacheKey();
        const cached = globalMailboxCache[currentCacheKey];

        // Show cached data immediately if page matches
        if (cached && cached.page === page) {
            dispatch({
                type: 'SET_EMAILS',
                emails: cached.emails,
                totalCount: cached.totalCount,
                totalPages: cached.totalPages,
                page: cached.page,
            });
        } else {
            dispatch({ type: 'SET_LOADING', isLoading: true });
            // Clear prior state immediately if no cache exists to prevent stale UI ghosting
            if (!cached && page === 1) {
                dispatch({ type: 'CLEAR_CACHE_LOADING', emails: [], totalCount: 0, totalPages: 0 });
            }
        }

        if (type === 'inbox') {
            const countsKey = `inbox_tabs_${selectedAccountId}`;
            const cachedCounts = globalTabCountsCache[countsKey] || getFromLocalCache(countsKey);
            if (cachedCounts) {
                dispatch({ type: 'SET_TAB_COUNTS', tabCounts: cachedCounts });
            } else {
                dispatch({ type: 'SET_TAB_COUNTS', tabCounts: {} });
            }
        }

        try {
            let result: any;
            let counts: any = null;

            if (type === 'inbox') {
                const countsKey = `inbox_tabs_${selectedAccountId}`;
                const cachedCountsTs = globalTabCountsTimestamp[countsKey] || 0;
                const countsAreFresh = globalTabCountsCache[countsKey] && (Date.now() - cachedCountsTs < TAB_COUNTS_TTL);

                if (countsAreFresh) {
                    // Counts are cached, just fetch emails
                    result = await getInboxEmailsAction(page, PAGE_SIZE, activeStage, selectedAccountId);
                    counts = globalTabCountsCache[countsKey];
                } else {
                    // Fetch emails and counts in parallel
                    const [emailResult, countsResult] = await Promise.all([
                        getInboxEmailsAction(page, PAGE_SIZE, activeStage, selectedAccountId),
                        getTabCountsAction(selectedAccountId).catch(() => globalTabCountsCache[countsKey] || {}),
                    ]);
                    result = emailResult;
                    counts = countsResult;
                }
            } else if (type === 'sent') {
                result = await getSentEmailsAction(page, PAGE_SIZE, selectedAccountId);
            } else if (type === 'client') {
                if (!clientEmail) return;
                const res = await getClientEmailsAction(clientEmail, selectedAccountId) as any;
                if (Array.isArray(res)) {
                    result = { emails: res, totalCount: res.length, totalPages: 1, page: 1 };
                } else {
                    result = { emails: res.emails, totalCount: res.total, totalPages: Math.ceil((res.total || 0) / PAGE_SIZE), page: res.page };
                }
            } else if (type === 'search') {
                if (!searchTerm) return;
                const res = await searchEmailsAction(searchTerm, 100, selectedAccountId) as any;
                if (Array.isArray(res)) {
                    result = { emails: res, totalCount: res.length, totalPages: 1, page: 1 };
                } else {
                    result = { emails: res.emails, totalCount: res.total, totalPages: Math.ceil((res.total || 0) / 100), page: res.page };
                }
            }

            // Verify we are still on the same view (cancel stale requests)
            if (requestId !== loadRequestIdRef.current || getCacheKey() !== currentCacheKey) return;

            // If an error occurred in the action, don't overwrite the cache/state with empty data
            if (result && result.error) {
                console.warn('[useMailbox] Action returned error, keeping existing cache.', result.errorMessage || '', result.errorCode || '');
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

                if (counts) {
                    const countsKey = `inbox_tabs_${selectedAccountId}`;
                    globalTabCountsCache[countsKey] = counts;
                    globalTabCountsTimestamp[countsKey] = Date.now();
                    saveToLocalCache(countsKey, counts);
                    // Batch emails + counts into single dispatch
                    dispatch({
                        type: 'SET_EMAILS_AND_COUNTS',
                        emails: result.emails,
                        totalCount: result.totalCount,
                        totalPages: result.totalPages,
                        page: result.page,
                        tabCounts: counts,
                    });
                } else {
                    dispatch({
                        type: 'SET_EMAILS',
                        emails: result.emails,
                        totalCount: result.totalCount,
                        totalPages: result.totalPages,
                        page: result.page,
                    });
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
            if (requestId === loadRequestIdRef.current && getCacheKey() === currentCacheKey) {
                dispatch({ type: 'SET_LOADING', isLoading: false });
            }
        }
    }, [type, activeStage, clientEmail, searchTerm, selectedAccountId, getCacheKey, enabled]);

    // Initial Load
    useEffect(() => {
        loadEmails(1);
    }, [loadEmails]);

    // Sync accounts from FilterProvider (single source of truth — no duplicate fetch)
    useEffect(() => {
        if (initialAccounts && initialAccounts.length > 0) {
            dispatch({ type: 'SET_ACCOUNTS', accounts: initialAccounts });
        }
    }, [initialAccounts]);

    // ── Sync Logic ────────────────────────────────────────────────────────────
    const handleSync = useCallback(async () => {
        if (isSyncing || accounts.length === 0) return;

        dispatch({ type: 'SET_SYNCING', isSyncing: true, syncMessage: `Syncing ${accounts.length} account${accounts.length > 1 ? 's' : ''}...` });
        lastSyncTimeRef.current = Date.now();

        try {
            await Promise.allSettled(
                accounts.map(a => fetch('/api/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accountId: a.id }),
                }))
            );

            dispatch({ type: 'SET_SYNCING', isSyncing: false, syncMessage: '' });
            loadEmails(currentPageRef.current);
        } catch (err) {
            dispatch({ type: 'SET_SYNCING', isSyncing: false, syncMessage: 'Sync failed' });
        }
    }, [isSyncing, accounts, loadEmails]);

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

        dispatch({
            type: 'UPDATE_EMAILS',
            updater: (prev) => {
                const isExistingThread = prev.some(e => e.thread_id === newEmail.thread_id);
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
                // Only increment totalCount for genuinely new threads
                if (!isExistingThread) {
                    // We need to also update totalCount — dispatch separately
                    // This is fine because React batches dispatches from the same event
                    dispatch({ type: 'UPDATE_TOTAL_COUNT', delta: 1 });
                }
                return [enriched, ...filtered].slice(0, PAGE_SIZE);
            },
        });

        // Update Cache synchronously
        const currentKey = getCacheKey();
        if (globalMailboxCache[currentKey]) {
            const cached = globalMailboxCache[currentKey];
            const nextEmails = [newEmail, ...cached.emails.filter(e => e.thread_id !== newEmail.thread_id)].slice(0, PAGE_SIZE);
            globalMailboxCache[currentKey] = { ...cached, emails: nextEmails, totalCount: cached.totalCount + 1 };
        }
    }, [type, activeStage, clientEmail, selectedAccountId, accounts, getCacheKey]);

    const handleEmailUpdated = useCallback((updated: any) => {
        dispatch({
            type: 'UPDATE_EMAILS',
            updater: (prev) => {
                const exists = prev.some(e => e.id === updated.id);
                if (!exists) return prev;
                return prev.map(e => e.id === updated.id ? { ...e, ...updated } : e);
            },
        });

        // Update thread if open
        if (selectedEmailRef.current?.thread_id === updated.thread_id) {
            dispatch({
                type: 'UPDATE_THREAD_MESSAGES',
                updater: (prev) => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m),
            });
        }

        // Correctly update ALL relevant caches (immutable updates)
        Object.keys(globalMailboxCache).forEach(key => {
            const cached = globalMailboxCache[key];
            if (cached && cached.emails.some(e => e.id === updated.id)) {
                globalMailboxCache[key] = { ...cached, emails: cached.emails.map(e => e.id === updated.id ? { ...e, ...updated } : e) };
            }
        });
    }, []);

    const handleEmailDeleted = useCallback((id: string) => {
        dispatch({
            type: 'UPDATE_EMAILS',
            updater: (prev) => prev.filter(e => e.id !== id),
        });
        // Use ref to avoid stale closure (FE-025)
        if (selectedEmailRef.current?.id === id) {
            dispatch({ type: 'SET_SELECTED', selectedEmail: null });
        }

        // Update caches (immutable)
        Object.keys(globalMailboxCache).forEach(key => {
            const cached = globalMailboxCache[key];
            if (cached && cached.emails.some(e => e.id === id)) {
                globalMailboxCache[key] = {
                    ...cached,
                    emails: cached.emails.filter(e => e.id !== id),
                    totalCount: Math.max(0, cached.totalCount - 1),
                };
            }
        });
    }, []);

    useRealtimeInbox({
        accountIds: accounts.map(a => a.id),
        onNewEmail: handleNewEmail,
        onEmailUpdated: handleEmailUpdated,
        onEmailDeleted: handleEmailDeleted,
    });

    // ── Interaction Handlers ──────────────────────────────────────────────────
    const prefetchThread = useCallback(async (threadId: string) => {
        if (!threadId) return;
        const cached = globalThreadCache[threadId];
        if (cached && Date.now() - cached.timestamp < THREAD_CACHE_TTL) return;

        try {
            // Use server action (service role) to ensure body is returned
            const enriched = await getThreadMessagesAction(threadId);
            // Evict oldest entries if cache is full
            const keys = Object.keys(globalThreadCache);
            if (keys.length >= THREAD_CACHE_MAX_SIZE) {
                const oldest = keys.sort((a, b) => (globalThreadCache[a]?.timestamp ?? 0) - (globalThreadCache[b]?.timestamp ?? 0));
                for (let i = 0; i < Math.min(10, oldest.length); i++) {
                    delete globalThreadCache[oldest[i]!];
                }
            }
            globalThreadCache[threadId] = { data: enriched, timestamp: Date.now() };
        } catch (err) {
            console.warn('[useMailbox] Prefetch failed', err);
        }
    }, []);

    const handleSelectEmail = useCallback(async (email: any) => {
        // Optimized: Check if we have cached messages for instant display
        const cached = globalThreadCache[email.thread_id];
        const cachedThread = cached && (Date.now() - cached.timestamp < THREAD_CACHE_TTL) ? cached.data : null;
        if (cachedThread) {
            dispatch({ type: 'SELECT_EMAIL_AND_THREAD', selectedEmail: email, threadMessages: cachedThread });
        } else {
            dispatch({ type: 'SELECT_EMAIL_AND_THREAD', selectedEmail: email, threadMessages: [email] });
        }

        if (email.is_unread) {
            dispatch({
                type: 'UPDATE_EMAILS',
                updater: (prev) => prev.map(e => e.id === email.id ? { ...e, is_unread: false } : e),
            });
            markEmailAsReadAction(email.id); // fire and forget
        }

        if (email.thread_id) {
            // If not cached, or to refresh the cache, fetch background
            if (!cachedThread) dispatch({ type: 'SET_THREAD_LOADING', isThreadLoading: true });
            
            try {
                // Use server action (service role) to bypass RLS and ensure body is returned
                const enriched = await getThreadMessagesAction(email.thread_id);

                // Update cache
                globalThreadCache[email.thread_id] = { data: enriched, timestamp: Date.now() };
                dispatch({ type: 'SET_THREAD', threadMessages: enriched, isThreadLoading: false });
            } catch (err) {
                console.error('Thread load failed', err);
                dispatch({ type: 'SET_THREAD_LOADING', isThreadLoading: false });
            }
        }
    }, []);

    // ── Wrapper setters to preserve external API ──────────────────────────────
    const setSelectedEmail = useCallback((email: any) => {
        dispatch({ type: 'SET_SELECTED', selectedEmail: email });
    }, []);

    const setCurrentPage = useCallback((page: number) => {
        dispatch({ type: 'SET_EMAILS', emails, totalCount, totalPages, page });
    }, [emails, totalCount, totalPages]);

    const toggleSelectEmail = useCallback((id: string) => {
        dispatch({
            type: 'SET_SELECTED_IDS',
            selectedEmailIds: (() => {
                const next = new Set(selectedEmailIds);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            })(),
        });
    }, [selectedEmailIds]);

    const toggleSelectAll = useCallback(() => {
        if (selectedEmailIds.size > 0 && selectedEmailIds.size === emails.length) {
            dispatch({ type: 'SET_SELECTED_IDS', selectedEmailIds: new Set() });
        } else {
            dispatch({ type: 'SET_SELECTED_IDS', selectedEmailIds: new Set(emails.map(e => e.id)) });
        }
    }, [selectedEmailIds, emails]);

    const handleDelete = useCallback(async (id: string) => {
        if (!confirm('Delete this message?')) return;
        handleEmailDeleted(id);
        const res = await deleteEmailAction(id);
        if (!res.success) loadEmails(currentPage);
    }, [handleEmailDeleted, loadEmails, currentPage]);

    const handleBulkDelete = useCallback(async () => {
        const ids = Array.from(selectedEmailIds);
        if (!ids.length || !confirm(`Delete ${ids.length} messages?`)) return;
        dispatch({
            type: 'UPDATE_EMAILS',
            updater: (prev) => prev.filter(e => !selectedEmailIds.has(e.id)),
        });
        dispatch({ type: 'SET_SELECTED_IDS', selectedEmailIds: new Set() });
        await bulkDeleteEmailsAction(ids);
        loadEmails(currentPage);
    }, [selectedEmailIds, loadEmails, currentPage]);

    const handleToggleRead = useCallback(async (id: string, currentUnread: boolean) => {
        const next = !currentUnread;
        dispatch({
            type: 'UPDATE_EMAILS',
            updater: (prev) => prev.map(e => e.id === id ? { ...e, is_unread: next } : e),
        });
        if (next) await markEmailAsUnreadAction(id);
        else await markEmailAsReadAction(id);
    }, []);

    const handleBulkMarkAsRead = useCallback(async () => {
        const ids = Array.from(selectedEmailIds);
        if (!ids.length) return;
        dispatch({
            type: 'UPDATE_EMAILS',
            updater: (prev) => prev.map(e => selectedEmailIds.has(e.id) ? { ...e, is_unread: false } : e),
        });
        dispatch({ type: 'SET_SELECTED_IDS', selectedEmailIds: new Set() });
        await bulkMarkAsReadAction(ids);
    }, [selectedEmailIds]);

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
        prefetchThread,
    };
}
