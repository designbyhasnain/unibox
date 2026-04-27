'use client';

import { useReducer, useEffect, useCallback, useRef, useState } from 'react';
import { useIdleDetection } from './useIdleDetection';
import {
    getInboxEmailsAction,
    getInboxWithCountsAction,
    getSentEmailsAction,
    getClientEmailsAction,
    getThreadMessagesAction,
    batchGetThreadsAction,
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

const NOISE_DOMAINS = ['mailsuite.com', 'mailtrack.io', 'yesware.com', 'streak.com'];
export function isNoiseEmail(m: any): boolean {
    const from = (m.from_email || '').toLowerCase();
    return NOISE_DOMAINS.some(d => from.includes(d));
}
function filterNoiseMessages(messages: any[]): any[] {
    return messages.filter(m => !isNoiseEmail(m));
}

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
const THREAD_CACHE_TTL = 15 * 60 * 1000; // 15 minutes (was 5)
const THREAD_CACHE_MAX_SIZE = 200; // (was 100)
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

    // Wipe localStorage caches (all versions)
    if (typeof window !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (
                key.startsWith('unibox_cache_mailbox_') ||
                key.startsWith('unibox_cache_inbox_tabs_') ||
                key.startsWith('unibox_cache_inbox_') ||
                key.startsWith('unibox_cache_sent_') ||
                key.startsWith('unibox_cache_client_') ||
                key.startsWith('unibox_cache_search_')
            )) {
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
    // ── Idle detection — pause all polling after 5 min of inactivity ────────
    const { isIdle, resume: resumeFromIdle } = useIdleDetection();

    // 1. Generate a robust cache key
    // v2: bumped to evict old localStorage entries that lack account_display_name / account_profile_image
    const getCacheKey = useCallback(() => {
        if (type === 'inbox') return `inbox_v2_${activeStage}_${selectedAccountId}`;
        if (type === 'sent') return `sent_v2_${selectedAccountId}`;
        if (type === 'client') return `client_v2_${clientEmail}_${selectedAccountId}`;
        if (type === 'search') return `search_v2_${searchTerm}_${selectedAccountId}`;
        return 'default_v2';
    }, [type, activeStage, clientEmail, searchTerm, selectedAccountId]);

    const cacheKey = getCacheKey();
    const activeCountsKey = `inbox_tabs_${selectedAccountId}`;

    // Durable initialization logic
    // Initial state uses ONLY in-memory cache (same on SSR and client) —
    // localStorage is hydrated post-mount via effect to avoid #310.
    const getInitialState = (): MailboxState => {
        const initialCache = enabled ? globalMailboxCache[cacheKey] ?? null : null;
        const initialTabCounts = globalTabCountsCache[activeCountsKey] ?? {};

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

    // Post-mount: hydrate in-memory cache from localStorage once per cacheKey
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!globalMailboxCache[cacheKey]) {
            const saved = getFromLocalCache(`mailbox_${cacheKey}`);
            if (saved) globalMailboxCache[cacheKey] = saved;
        }
        if (!globalTabCountsCache[activeCountsKey]) {
            const saved = getFromLocalCache(activeCountsKey);
            if (saved) globalTabCountsCache[activeCountsKey] = saved;
        }
    }, [cacheKey, activeCountsKey]);

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
            // Same account, different tab/stage — show cached data instantly, refresh in background
            let syncCache = globalMailboxCache[cacheKey];
            if (!syncCache && typeof window !== 'undefined' && type !== 'search') {
                syncCache = getFromLocalCache(`mailbox_${cacheKey}`);
            }
            if (syncCache) {
                globalMailboxCache[cacheKey] = syncCache;
                dispatch({
                    type: 'RESTORE_FROM_CACHE',
                    prevCacheKey: cacheKey,
                    emails: syncCache.emails,
                    totalCount: syncCache.totalCount,
                    totalPages: syncCache.totalPages,
                    page: syncCache.page,
                });
                // Fresh data will load via useEffect → loadEmails (requestId prevents race condition)
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
                    // Single server action = 1 network round trip for both emails + counts
                    const combined = await getInboxWithCountsAction(page, PAGE_SIZE, activeStage, selectedAccountId);
                    result = combined.emails;
                    counts = combined.counts;
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

                // AGGRESSIVE PREFETCH: batch-load ALL visible threads in one call
                // This makes thread clicks instant (0ms) since data is already cached
                const uncachedThreadIds = (result.emails || [])
                    .map((e: any) => e.thread_id)
                    .filter((tid: string) => tid && !globalThreadCache[tid]);
                if (uncachedThreadIds.length > 0) {
                    batchGetThreadsAction([...new Set(uncachedThreadIds)] as string[]).then(threadMap => {
                        for (const [tid, msgs] of Object.entries(threadMap)) {
                            if (msgs && (msgs as any[]).length > 0) {
                                globalThreadCache[tid] = { data: msgs as any[], timestamp: Date.now() };
                            }
                        }
                    }).catch(() => {}); // Silent — prefetch failure is not critical
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

    // ── Prefetch next page silently ──────────────────────────────────────────
    const prefetchCacheRef = useRef<Map<string, any[]>>(new Map());

    useEffect(() => {
        if (!enabled || type === 'search') return;
        if (emails.length < PAGE_SIZE) return; // not a full page, no next page likely

        const nextPage = currentPage + 1;
        const nextKey = `${getCacheKey()}_page${nextPage}`;
        if (prefetchCacheRef.current.has(nextKey)) return;
        if (globalMailboxCache[`${getCacheKey()}_p${nextPage}`]) return;

        // Prefetch next page silently in background
        const prefetch = async () => {
            try {
                let result: any;
                if (type === 'inbox') {
                    result = await getInboxEmailsAction(nextPage, PAGE_SIZE, activeStage, selectedAccountId);
                } else if (type === 'sent') {
                    result = await getSentEmailsAction(nextPage, PAGE_SIZE, selectedAccountId);
                }
                if (result?.emails?.length > 0) {
                    prefetchCacheRef.current.set(nextKey, result.emails);
                    // Store in global cache for instant access
                    const nextCacheKey = getCacheKey();
                    globalMailboxCache[`${nextCacheKey}_p${nextPage}`] = {
                        emails: result.emails,
                        totalCount: result.totalCount,
                        totalPages: result.totalPages,
                        page: nextPage,
                        timestamp: Date.now(),
                    };
                }
            } catch {
                // Silent fail — prefetch is non-critical
            }
        };
        prefetch();
    }, [emails.length, currentPage, type, activeStage, selectedAccountId, getCacheKey, enabled]);

    // ── Tab visibility — sync on refocus ─────────────────────────────────────
    useEffect(() => {
        if (!enabled) return;
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                // User came back — refresh data in background (no loading state)
                const timeSinceSync = Date.now() - lastSyncTimeRef.current;
                if (timeSinceSync > 30_000) { // only if >30s since last sync
                    loadEmails(currentPageRef.current);
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [enabled, loadEmails]);

    // ── Auto-poll every 60s — catches emails webhooks miss ─────────────────
    // Paused when user is idle (no interaction for 5 min) to save Vercel CPU.
    useEffect(() => {
        if (!enabled || type !== 'inbox' || isIdle) return;
        const pollInterval = setInterval(async () => {
            if (document.visibilityState !== 'visible') return;
            try {
                const res = await fetch('/api/sync/poll');
                const data = await res.json();
                if (data.synced > 0) {
                    loadEmails(currentPageRef.current);
                }
            } catch { /* silent fail */ }
        }, 60_000);
        return () => clearInterval(pollInterval);
    }, [enabled, type, loadEmails, isIdle]);

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
        pollingIntervalMs: isIdle ? 0 : 30_000, // Disable polling when idle
    });

    // ── Optimistic Thread Updates ─────────────────────────────────────────────
    const appendThreadMessage = useCallback((message: any) => {
        dispatch({ type: 'UPDATE_THREAD_MESSAGES', updater: (prev) => [...prev, message] });
    }, []);

    const removeThreadMessage = useCallback((messageId: string) => {
        dispatch({ type: 'UPDATE_THREAD_MESSAGES', updater: (prev) => prev.filter((m: any) => m.id !== messageId) });
    }, []);

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
        // Step 1: INSTANT display — show cached thread or the clicked email immediately
        const cached = globalThreadCache[email.thread_id];
        const cachedThread = cached && (Date.now() - cached.timestamp < THREAD_CACHE_TTL) ? cached.data : null;
        if (cachedThread) {
            dispatch({ type: 'SELECT_EMAIL_AND_THREAD', selectedEmail: email, threadMessages: filterNoiseMessages(cachedThread) });
        } else {
            // Show the clicked email as a single message immediately (no loading spinner)
            dispatch({ type: 'SELECT_EMAIL_AND_THREAD', selectedEmail: email, threadMessages: [email] });
        }

        // Step 2: Mark as read (fire and forget — don't block UI)
        if (email.is_unread) {
            dispatch({
                type: 'UPDATE_EMAILS',
                updater: (prev) => prev.map(e => e.id === email.id ? { ...e, is_unread: false } : e),
            });
            markEmailAsReadAction(email.id);
        }

        // Step 3: Load full thread in background (non-blocking)
        if (email.thread_id) {
            if (!cachedThread) dispatch({ type: 'SET_THREAD_LOADING', isThreadLoading: true });

            // Don't await — let it load in background
            getThreadMessagesAction(email.thread_id).then(enriched => {
                globalThreadCache[email.thread_id] = { data: enriched, timestamp: Date.now() };
                dispatch({ type: 'SET_THREAD', threadMessages: filterNoiseMessages(enriched), isThreadLoading: false });
            }).catch(err => {
                console.error('Thread load failed', err);
                dispatch({ type: 'SET_THREAD_LOADING', isThreadLoading: false });
            });
        }
    }, []);

    // ── Wrapper setters to preserve external API ──────────────────────────────
    const setSelectedEmail = useCallback((email: any) => {
        dispatch({ type: 'SET_SELECTED', selectedEmail: email });
    }, []);

    const setCurrentPage = useCallback((page: number) => {
        // Check if we have prefetched data for this page
        const prefetchKey = `${getCacheKey()}_page${page}`;
        const globalKey = `${getCacheKey()}_p${page}`;
        const prefetched = prefetchCacheRef.current.get(prefetchKey);
        const globalPrefetch = globalMailboxCache[globalKey];

        if (prefetched) {
            dispatch({ type: 'SET_EMAILS', emails: prefetched, totalCount, totalPages, page });
            prefetchCacheRef.current.delete(prefetchKey);
            return;
        }
        if (globalPrefetch) {
            dispatch({
                type: 'SET_EMAILS',
                emails: globalPrefetch.emails,
                totalCount: globalPrefetch.totalCount,
                totalPages: globalPrefetch.totalPages,
                page,
            });
            return;
        }
        // No prefetch available — do normal load
        loadEmails(page);
    }, [totalCount, totalPages, getCacheKey, loadEmails]);

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

    // Resume handler: wake from idle + refresh data
    const handleResume = useCallback(() => {
        resumeFromIdle();
        loadEmails(currentPageRef.current);
    }, [resumeFromIdle, loadEmails]);

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
        isIdle,

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
        handleResume,
        appendThreadMessage,
        removeThreadMessage,
    };
}
