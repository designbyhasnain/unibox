'use client'

import React, { useState, useEffect } from 'react';
import { useGlobalFilter } from '../context/FilterContext';
import { useUI } from '../context/UIContext';
import Topbar from '../components/Topbar';
import {
    getGoogleAuthUrlAction,
    connectManualAccountAction,
    getAccountsAction,
    removeAccountAction,
    reSyncAccountAction,
    toggleSyncStatusAction,
    stopSyncingAction,
    renewAllWatchesAction,
    retestManualAccountAction,
    syncAllAccountsHealthAction,
} from '../../src/actions/accountActions';
import { PageLoader } from '../components/LoadingStates';
import { getCurrentUserAction } from '../../src/actions/authActions';

type AccountStatus = 'ACTIVE' | 'ERROR' | 'DISCONNECTED' | 'SYNCING' | 'PAUSED';
type ConnectionMethod = 'OAUTH' | 'MANUAL';

interface GmailAccount {
    id: string;
    email: string;
    status: AccountStatus;
    connection_method: ConnectionMethod;
    last_synced_at: string | Date | null;
    emails_count?: number;
    sync_progress?: number;
    watch_expiry?: string | null;
    watch_status?: string | null;
    last_error_message?: string | null;
    health_score?: number | null;
}

import { saveToLocalCache, getFromLocalCache } from '../utils/localCache';
import { useHydrated } from '../utils/useHydration';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 100; // Max entries before clearing

let globalAccountsCache: GmailAccount[] | null = null;
let globalAccountsCacheTimestamp = 0;

if (typeof window !== 'undefined') {
    const savedAccounts = getFromLocalCache('accounts_data');
    if (savedAccounts) {
        globalAccountsCache = savedAccounts;
        globalAccountsCacheTimestamp = 0; // Treat restored cache as stale
    }
}

function isAccountsCacheValid(): boolean {
    if (!globalAccountsCache) return false;
    if (Date.now() - globalAccountsCacheTimestamp > CACHE_TTL_MS) return false;
    if (globalAccountsCache.length > CACHE_MAX_SIZE) {
        globalAccountsCache = null;
        globalAccountsCacheTimestamp = 0;
        return false;
    }
    return true;
}

function StatusBadge({ status }: { status: AccountStatus }) {
    const map: Record<AccountStatus, { label: string; cls: string }> = {
        ACTIVE: { label: 'Active', cls: 'badge-green' },
        ERROR: { label: 'Error', cls: 'badge-red' },
        DISCONNECTED: { label: 'Disconnected', cls: 'badge-gray' },
        SYNCING: { label: 'Syncing...', cls: 'badge-blue' },
        PAUSED: { label: 'Paused', cls: 'badge-orange' },
    };
    const { label, cls } = map[status] || { label: status, cls: 'badge-gray' };
    return <span className={`badge ${cls}`}>{label}</span>;
}

function WatchStatusBadge({ watchStatus, watchExpiry, connectionMethod }: {
    watchStatus?: string | null;
    watchExpiry?: string | null;
    connectionMethod: ConnectionMethod;
}) {
    if (connectionMethod === 'MANUAL') {
        return (
            <span className="badge badge-sm badge-blue" title="Emails sync automatically every 15 minutes via IMAP polling">
                Auto-sync 15m
            </span>
        );
    }
    if (connectionMethod !== 'OAUTH') return null;

    const hoursLeft = watchExpiry
        ? Math.round((new Date(watchExpiry).getTime() - Date.now()) / (1000 * 60 * 60))
        : null;

    if (watchStatus === 'ACTIVE' && hoursLeft && hoursLeft > 36) {
        return (
            <span className="badge badge-sm badge-green" title={`Watch expires in ${Math.round(hoursLeft / 24)} days`}>
                Push active
            </span>
        );
    }

    if (watchStatus === 'ACTIVE' && hoursLeft && hoursLeft <= 36 && hoursLeft > 0) {
        return (
            <span className="badge badge-sm badge-yellow" title={`Watch expires in ${hoursLeft} hours`}>
                Expiring soon
            </span>
        );
    }

    if (watchStatus === 'ERROR') {
        return <span className="badge badge-sm badge-red">Watch error</span>;
    }

    return (
        <span className="badge badge-sm badge-gray" title="No push notifications — emails sync via polling only">
            No push
        </span>
    );
}

export default function AccountsPage() {
    const isHydrated = useHydrated();
    const { selectedAccountId, setSelectedAccountId, accounts, refreshAccounts, isLoadingAccounts, setAccounts } = useGlobalFilter();
    const [isLoading, setIsLoading] = useState(() => accounts.length === 0);
    const { isComposeOpen, setComposeOpen } = useUI();
    const [isSyncing, setIsSyncing] = useState(false);
    const [showSelectionModal, setShowSelectionModal] = useState(false);
    const [showManualForm, setShowManualForm] = useState(false);
    const [accountToRemove, setAccountToRemove] = useState<GmailAccount | null>(null);
    const [removeConfirmText, setRemoveConfirmText] = useState('');
    const [manualEmail, setManualEmail] = useState('');
    const [appPassword, setAppPassword] = useState('');
    const [imapHost, setImapHost] = useState('imap.gmail.com');
    const [imapPort, setImapPort] = useState(993);
    const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
    const [smtpPort, setSmtpPort] = useState(587);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [userRole, setUserRole] = useState<string | null>(null);
    const isAdmin = userRole === 'ADMIN' || userRole === 'ACCOUNT_MANAGER';
    const [isRenewingWatches, setIsRenewingWatches] = useState(false);


    const fetchAccounts = async () => {
        setIsLoading(true);
        await refreshAccounts();
        setIsLoading(false);
    };

    useEffect(() => {
        getCurrentUserAction().then(session => {
            if (session) setUserRole(session.role);
        });
        if (accounts.length === 0) {
            fetchAccounts();
        } else {
            setIsLoading(false);
        }
    }, []);

    // Separated background refresh for better handling
    const refreshAccountsSilently = async () => {
        try {
            const result = await getAccountsAction();
            if (result.success) {
                const accts = result.accounts as unknown as GmailAccount[];
                globalAccountsCache = accts;
                globalAccountsCacheTimestamp = Date.now();
                saveToLocalCache('accounts_data', accts);
                setAccounts(accts);
            }
        } catch (err) {
            console.warn('Background account refresh failed (ignoring):', err);
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, []);

    useEffect(() => {
        const hasSyncing = accounts.some(a => a.status === 'SYNCING');
        if (!hasSyncing && !isSyncing) return;

        const interval = setInterval(() => {
            refreshAccountsSilently();
        }, 5000);

        return () => clearInterval(interval);
    }, [accounts, isSyncing]);

    const handleOAuthFlow = async () => {
        try {
            const url = await getGoogleAuthUrlAction();
            window.location.href = url;
        } catch (err: any) {
            alert('Failed to initiate Google OAuth: ' + err.message);
        }
    };

    const handleManualConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsConnecting(true);
        setError(null);
        try {
            const config = {
                imapHost,
                imapPort,
                smtpHost,
                smtpPort
            };
            const result = await connectManualAccountAction(manualEmail, appPassword, config);
            if (result.success && result.account) {
                setAccounts((prev: any[]) => [result.account as unknown as GmailAccount, ...prev]);
                setShowManualForm(false);
                setManualEmail('');
                setAppPassword('');
            } else {
                setError(result.error || 'Connection failed');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsConnecting(false);
        }
    };


    const handleReSync = async (account: GmailAccount) => {
        setAccounts((prev: any[]) => prev.map(a => a.id === account.id ? { ...a, status: 'SYNCING', sync_progress: 0 } : a));
        try {
            const result = await reSyncAccountAction(account.id, account.connection_method);
            if (!result.success) {
                alert('Failed to sync: ' + result.error);
                setAccounts((prev: any[]) => prev.map(a => a.id === account.id ? { ...a, status: account.status } : a));
            }
            // Don't refetch — local state already shows SYNCING and the
            // polling interval (every 5s) will pick up real progress.
        } catch (err: any) {
            console.error('Re-sync failed:', err);
            setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: account.status } : a));
        }
    };

    const handleToggleSync = async (account: GmailAccount) => {
        const newStatus = account.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
        setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: newStatus as AccountStatus } : a));
        try {
            const result = await toggleSyncStatusAction(account.id, account.status);
            if (!result.success) {
                setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: account.status } : a));
            }
        } catch (err) {
            console.error('Toggle sync failed:', err);
            setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: account.status } : a));
        }
    };

    const handleStopSync = async (account: GmailAccount) => {
        if (!confirm('Are you sure you want to stop syncing? Progress will be saved but the process will end.')) return;
        setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: 'ACTIVE' as AccountStatus } : a));
        try {
            const result = await stopSyncingAction(account.id);
            if (!result.success) {
                setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: account.status } : a));
            }
        } catch (err) {
            console.error('Stop sync failed:', err);
            setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: account.status } : a));
        }
    };

    const handleRetestManual = async (account: GmailAccount) => {
        setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: 'SYNCING' as AccountStatus } : a));
        try {
            const result = await retestManualAccountAction(account.id);
            if (result.success) {
                setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: 'ACTIVE', last_error_message: null } : a));
                alert('Connection OK — IMAP + SMTP verified.');
            } else {
                setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: account.status, last_error_message: result.error || 'Test failed' } : a));
                alert('Re-test failed: ' + (result.error || 'Unknown error'));
            }
        } catch (err: any) {
            setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: account.status } : a));
            alert('Re-test failed: ' + (err?.message || 'Unknown error'));
        }
    };

    const [isCheckingHealth, setIsCheckingHealth] = useState(false);
    const handleSyncAllHealth = async () => {
        if (!confirm(`Run a bulk health check on all ${accounts.length} accounts?\n\nThis refreshes OAuth tokens + re-tests manual credentials in batches of 5. It does not send any email.`)) return;
        setIsCheckingHealth(true);
        try {
            const result = await syncAllAccountsHealthAction();
            if (result.success) {
                alert(
                    `Health check complete.\n` +
                    `Checked: ${result.checked}\n` +
                    `Recovered: ${result.recovered}\n` +
                    `Still failing: ${result.stillFailing}\n` +
                    `Permanently revoked: ${result.permanent}\n\n` +
                    (result.failures.length > 0 ? 'First few failures:\n' + result.failures.slice(0, 8).map(f => `• ${f.email}: ${f.reason}`).join('\n') : '')
                );
                fetchAccounts();
            } else {
                alert('Health check failed: ' + (result.error || 'Unknown error'));
            }
        } catch (err: any) {
            alert('Health check failed: ' + (err?.message || 'Unknown error'));
        } finally {
            setIsCheckingHealth(false);
        }
    };

    const handleRemove = async (accountId: string) => {
        try {
            const result = await removeAccountAction(accountId);
            if (result.success) {
                setAccounts((prev: any[]) => prev.filter(acc => acc.id !== accountId));
            } else {
                alert('Failed to remove account: ' + result.error);
            }
        } catch (err: any) {
            console.error(err);
        } finally {
            setAccountToRemove(null);
            setRemoveConfirmText('');
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        if (accounts.length === 0) {
            setIsSyncing(false);
            return;
        }
        try {
            // Mark all accounts as SYNCING immediately in local state
            setAccounts(prev => prev.map(a =>
                ['ACTIVE', 'PAUSED'].includes(a.status)
                    ? { ...a, status: 'SYNCING' as AccountStatus, sync_progress: 0 }
                    : a
            ));
            await Promise.allSettled(accounts.map(acc =>
                fetch('/api/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accountId: acc.id }),
                })
            ));
            // Don't call fetchAccounts — polling interval handles updates
            setIsSyncing(false);
        } catch {
            setIsSyncing(false);
        }
    };

    const formatLastSynced = (date: string | Date | null) => {
        if (!date) return 'Never';
        const d = new Date(date);
        const diff = Date.now() - d.getTime();
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString();
    };


    const filteredAccounts = accounts.filter(acc =>
        acc.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.status.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const needsReauth = accounts.filter(acc => acc.status === 'ERROR');

    const GoogleIcon = () => (
        <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c3.11 0 5.71-1.03 7.61-2.79l-3.57-2.77c-1.01.69-2.31 1.1-4.04 1.1-3.11 0-5.74-2.1-6.68-4.93H1.72v2.85C3.65 20.46 7.55 23 12 23z" fill="#34A853" />
            <path d="M5.32 13.62C7.26 13.23 7.15 12.63 7.15 12c0-.63.11-1.23.28-1.82L4.11 7.61c-.6 1.18-.96 2.51-.96 3.9 0 1.39.36 2.73.96 3.9l3.21-1.79z" fill="#FBBC05" />
            <path d="M12 6.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C16.46 3.9 14.42 3 12 3 8.55 3 5.61 4.63 4.11 7.61L7.43 10.2c.64-1.93 2.44-3.37 4.57-3.37z" fill="#EA4335" />
        </svg>
    );

    const selectionModalTitleId = 'selection-modal-title';
    const manualFormTitleId = 'manual-form-title';
    const removeModalTitleId = 'remove-modal-title';

    return (
        <div className="mailbox-wrapper">
            <div className="main-area">
                <Topbar
                    searchTerm={searchQuery}
                    setSearchTerm={setSearchQuery}
                    placeholder="Search accounts..."
                    onSearch={() => { }}
                    onClearSearch={() => setSearchQuery('')}
                    leftContent={
                        <h1 className="page-title">Accounts</h1>
                    }
                    rightContent={
                        <div className="topbar-actions">
                            {isAdmin && (
                                <>
                                    <button
                                        className="icon-btn"
                                        onClick={handleSync}
                                        disabled={isSyncing}
                                        title={isSyncing ? 'Syncing...' : 'Sync all accounts'}
                                    >
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>
                                            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                                        </svg>
                                    </button>
                                    <button
                                        className="icon-btn"
                                        onClick={async () => {
                                            if (!confirm('Renew Gmail push notification watches for all accounts?')) return;
                                            setIsRenewingWatches(true);
                                            try {
                                                const result = await renewAllWatchesAction();
                                                if (result.success) {
                                                    const msg = `Renewed: ${result.renewed}, Failed: ${result.failed}` +
                                                        (result.errors && result.errors.length > 0
                                                            ? `\n\nErrors:\n${result.errors.join('\n')}`
                                                            : '');
                                                    alert(msg);
                                                    await fetchAccounts();
                                                } else {
                                                    alert(result.error || 'Failed to renew watches');
                                                }
                                            } finally {
                                                setIsRenewingWatches(false);
                                            }
                                        }}
                                        disabled={isRenewingWatches}
                                        title="Renew all Gmail push notification watches"
                                        style={{ opacity: isRenewingWatches ? 0.5 : 1 }}
                                    >
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m3 11 18-5v12L3 14v-3z" />
                                            <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
                                        </svg>
                                    </button>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => { setShowSelectionModal(true); setError(null); }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14m-7-7h14" /></svg>
                                        Add Account
                                    </button>
                                </>
                            )}
                            <div className="avatar-btn">A</div>
                        </div>
                    }
                />

                {/* Tabs / Sub-header */}
                <div className="tabs-bar">
                    <div className="tab active">Connected Accounts</div>
                </div>

                <div className="content-split">
                    <div className="list-panel">
                        {/* Toolbar */}
                        <div className="list-toolbar">
                            <div className="list-toolbar-left">
                                <span className="count-label">{isHydrated ? accounts.length : 0} linked accounts</span>
                            </div>
                            {isAdmin && (
                            <div className="list-toolbar-right">
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleSyncAllHealth}
                                    disabled={isCheckingHealth}
                                    title="Refresh tokens + re-test every account in batches of 5. Never sends email."
                                >
                                    {isCheckingHealth ? 'Checking…' : 'Check All Health'}
                                </button>
                                <button className="icon-btn" onClick={handleSync} disabled={isSyncing} title="Sync All">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>
                                        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                                    </svg>
                                </button>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => { setShowSelectionModal(true); setError(null); }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14m-7-7h14" /></svg>
                                    Add Account
                                </button>
                            </div>
                            )}
                        </div>

                        <div className="list-area" style={{ padding: '0' }}>
                            {/* Global Error Banner */}
                            {error && (
                                <div className="acct-error-banner">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Error banners */}
                            {needsReauth.length > 0 && (
                                <div className="acct-reauth-section">
                                    {needsReauth.map(acc => (
                                        <div key={acc.id} className="acct-reauth-item">
                                            <span className="acct-reauth-text">
                                                <strong>{acc.email}</strong> needs to be reconnected.
                                            </span>
                                            <button className="btn btn-sm btn-danger" onClick={() => handleOAuthFlow()}>Re-authenticate</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <PageLoader isLoading={!isHydrated || isLoading} type="grid" count={6}>
                                {filteredAccounts.length === 0 ? (
                                    <div className="empty-state">
                                        <div className="empty-state-icon">
                                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
                                                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                            </svg>
                                        </div>
                                        <div className="empty-state-title">No accounts yet</div>
                                        <div className="empty-state-desc">Connect a Gmail account to start sending and receiving emails.</div>
                                    </div>
                                ) : (
                                    <div className="accounts-grid" style={{ padding: '1.5rem' }}>
                                        {filteredAccounts.map(acc => (
                                            <div
                                                key={acc.id}
                                                className={`account-item-card${acc.status === 'ERROR' ? ' account-error' : acc.status === 'SYNCING' ? ' account-syncing' : ''}`}
                                            >
                                                {/* Card Content */}
                                                <div className="acct-card-header">
                                                    <div className="acct-card-icon">
                                                        {acc.connection_method === 'OAUTH' ? <GoogleIcon /> : (
                                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                                                <polyline points="22,6 12,13 2,6" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <div className="acct-card-info">
                                                        <div className="acct-card-email">
                                                            {acc.email}
                                                        </div>
                                                        <div className="acct-card-meta">
                                                            <StatusBadge status={acc.status} />
                                                            <WatchStatusBadge
                                                                watchStatus={acc.watch_status}
                                                                watchExpiry={acc.watch_expiry}
                                                                connectionMethod={acc.connection_method}
                                                            />
                                                            <span className="acct-card-method">
                                                                {acc.connection_method === 'MANUAL' ? 'Manual/IMAP' : 'Google OAuth'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="acct-card-sync-info">
                                                        <div className="acct-card-sync-label">Last synced</div>
                                                        <div className="acct-card-sync-value">
                                                            {formatLastSynced(acc.last_synced_at)}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="acct-card-status-box">
                                                    <div className="acct-card-status-label">
                                                        Synchronization Status
                                                    </div>
                                                    <div className="acct-card-status-value">
                                                        {acc.emails_count != null ? `${acc.emails_count.toLocaleString()} emails synced` : 'Scanning...'}
                                                    </div>
                                                </div>

                                                {acc.status === 'ERROR' && (
                                                    <div className="acct-card-error-msg">
                                                        Authentication failed — please reconnect this account.
                                                    </div>
                                                )}

                                                {acc.last_error_message && acc.status !== 'ERROR' && acc.last_error_message.includes('invalid_grant') && (
                                                    <div className="acct-warning-banner acct-warning-orange">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                                        <span>Token issue detected — reconnect recommended</span>
                                                        <button className="btn btn-xs btn-primary" onClick={() => handleOAuthFlow()}>Reconnect</button>
                                                    </div>
                                                )}

                                                {/* Warm-up failure warning. Shows when a recent warm-up run for this
                                                    account couldn't send. Not a token issue — usually app-password
                                                    rotation, SMTP quota, or a transient network blip. */}
                                                {acc.last_error_message && acc.status !== 'ERROR' && acc.last_error_message.startsWith('Warm-up:') && (
                                                    <div className="acct-warning-banner acct-warning-yellow">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                                        <span>Warm-up failed: {acc.last_error_message.replace(/^Warm-up:\s*/, '').slice(0, 80)}</span>
                                                        {acc.connection_method === 'MANUAL' ? (
                                                            <button className="btn btn-xs btn-primary" onClick={() => handleRetestManual(acc)}>Re-test</button>
                                                        ) : (
                                                            <button className="btn btn-xs btn-primary" onClick={() => handleOAuthFlow()}>Reconnect</button>
                                                        )}
                                                    </div>
                                                )}

                                                {acc.connection_method === 'OAUTH' && acc.watch_status !== 'ACTIVE' && acc.status !== 'ERROR' && (
                                                    <div className="acct-warning-banner acct-warning-red">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                                                        <span>Push expired — no real-time sync</span>
                                                        <button className="btn btn-xs btn-primary" onClick={async () => {
                                                            setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, watch_status: 'ACTIVE' } : a));
                                                            await renewAllWatchesAction();
                                                        }}>Fix Now</button>
                                                    </div>
                                                )}

                                                {acc.connection_method === 'OAUTH' && acc.watch_status === 'ACTIVE' && acc.watch_expiry && (() => {
                                                    const hoursLeft = (new Date(acc.watch_expiry).getTime() - Date.now()) / (1000 * 60 * 60);
                                                    return hoursLeft > 0 && hoursLeft <= 48;
                                                })() && (
                                                    <div className="acct-warning-banner acct-warning-yellow">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                        <span>Push expiring in {Math.round((new Date(acc.watch_expiry!).getTime() - Date.now()) / (1000 * 60 * 60))}h</span>
                                                        <button className="btn btn-xs btn-secondary" onClick={async () => {
                                                            await renewAllWatchesAction();
                                                            refreshAccountsSilently();
                                                        }}>Renew</button>
                                                    </div>
                                                )}

                                                {acc.status === 'SYNCING' && (
                                                    <div className="acct-sync-progress">
                                                        <div className="sync-bar" role="progressbar" aria-valuenow={acc.sync_progress || 0} aria-valuemin={0} aria-valuemax={100} aria-label={`Sync progress: ${acc.sync_progress || 0}%`}>
                                                            <div className="sync-bar-fill" style={{ width: `${acc.sync_progress || 0}%` }} />
                                                        </div>
                                                        <p className="acct-sync-label">
                                                            <span>Syncing... {acc.sync_progress || 0}%</span>
                                                        </p>
                                                    </div>
                                                )}

                                                {isAdmin && (
                                                <div className="acct-card-actions">
                                                    <div className="acct-card-actions-left">
                                                        {acc.status === 'ERROR' ? (
                                                            <button className="btn btn-sm btn-primary" onClick={() => handleOAuthFlow()}>
                                                                Re-connect
                                                            </button>
                                                        ) : acc.status === 'SYNCING' ? (
                                                            <button className="btn btn-sm btn-secondary" onClick={() => handleStopSync(acc)}>
                                                                Stop Sync
                                                            </button>
                                                        ) : (
                                                            <button className="btn btn-sm btn-secondary" onClick={() => handleReSync(acc)}>
                                                                Re-sync
                                                            </button>
                                                        )}

                                                        {acc.status !== 'ERROR' && acc.status !== 'SYNCING' && (
                                                            <button
                                                                className={`btn btn-sm ${acc.status === 'PAUSED' ? 'btn-primary' : 'btn-secondary'}`}
                                                                onClick={() => handleToggleSync(acc)}
                                                            >
                                                                {acc.status === 'PAUSED' ? 'Resume Sync' : 'Pause Sync'}
                                                            </button>
                                                        )}
                                                        {acc.connection_method === 'MANUAL' && acc.status !== 'SYNCING' && (
                                                            <button
                                                                className="btn btn-sm btn-secondary"
                                                                onClick={() => handleRetestManual(acc)}
                                                                title="Re-test IMAP/SMTP with the stored app password"
                                                            >
                                                                Re-test
                                                            </button>
                                                        )}
                                                        <button
                                                            className="btn btn-sm btn-danger"
                                                            onClick={() => setAccountToRemove(acc)}
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </PageLoader>
                        </div>
                    </div>
                </div>
            </div>

            {/* Account type selection modal */}
            {showSelectionModal && (
                <div className="modal-overlay" onClick={() => setShowSelectionModal(false)}>
                    <div
                        className="modal-box animate-slide-in"
                        onClick={e => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={selectionModalTitleId}
                    >
                        <div className="modal-title" id={selectionModalTitleId}>Add Gmail Account</div>
                        <div className="modal-sub">Choose how you&apos;d like to connect your account.</div>

                        <div className="acct-modal-options">
                            <button
                                className="acct-modal-option-btn"
                                onClick={handleOAuthFlow}
                            >
                                <div className="acct-modal-option-icon acct-modal-option-icon--oauth">
                                    <svg width="20" height="20" viewBox="0 0 24 24">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c3.11 0 5.71-1.03 7.61-2.79l-3.57-2.77c-1.01.69-2.31 1.1-4.04 1.1-3.11 0-5.74-2.1-6.68-4.93H1.72v2.85C3.65 20.46 7.55 23 12 23z" fill="#34A853" />
                                        <path d="M5.32 13.62C7.15 13.23 7.15 12.63 7.15 12c0-.63.11-1.23.28-1.82L4.11 7.61c-.6 1.18-.96 2.51-.96 3.9 0 1.39.36 2.73.96 3.9l3.21-1.79z" fill="#FBBC05" />
                                        <path d="M12 6.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C16.46 3.9 14.42 3 12 3 8.55 3 5.61 4.63 4.11 7.61L7.43 10.2c.64-1.93 2.44-3.37 4.57-3.37z" fill="#EA4335" />
                                    </svg>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div className="acct-modal-option-title">Google OAuth</div>
                                    <div className="acct-modal-option-desc">Recommended -- secure automatic sync</div>
                                </div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                            </button>

                            <button
                                className="acct-modal-option-btn"
                                onClick={() => { setShowSelectionModal(false); setShowManualForm(true); }}
                            >
                                <div className="acct-modal-option-icon acct-modal-option-icon--manual">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                        <polyline points="22,6 12,13 2,6" />
                                    </svg>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div className="acct-modal-option-title">Manual App Password</div>
                                    <div className="acct-modal-option-desc">Uses IMAP/SMTP connection</div>
                                </div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                            </button>
                        </div>

                        <button className="btn btn-secondary btn-lg" style={{ width: '100%', marginTop: '1.25rem' }} onClick={() => setShowSelectionModal(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Manual form modal */}
            {showManualForm && (
                <div className="modal-overlay" onClick={() => setShowManualForm(false)}>
                    <div
                        className="modal-box animate-slide-in"
                        style={{ maxWidth: '500px' }}
                        onClick={e => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={manualFormTitleId}
                    >
                        <div className="modal-title" id={manualFormTitleId}>Custom Domain / IMAP Setup</div>
                        <div className="modal-sub">Enter your email details. For Gmail, use an App Password.</div>

                        {error && (
                            <div className="acct-form-error">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleManualConnect} className="acct-manual-form">
                            <div className="acct-manual-form-grid">
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label className="acct-form-label" htmlFor="manual-email">
                                        Email Address
                                    </label>
                                    <input
                                        className="form-input"
                                        id="manual-email"
                                        type="email"
                                        placeholder="you@yourdomain.com"
                                        required
                                        aria-label="Email address for manual connection"
                                        value={manualEmail}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setManualEmail(val);
                                            if (val.includes('@')) {
                                                const domain = val.split('@')[1];
                                                if (domain && !domain.includes('gmail.com')) {
                                                    setImapHost(`mail.${domain}`);
                                                    setSmtpHost(`mail.${domain}`);
                                                } else if (domain === 'gmail.com') {
                                                    setImapHost('imap.gmail.com');
                                                    setSmtpHost('smtp.gmail.com');
                                                    setImapPort(993);
                                                    setSmtpPort(587);
                                                }
                                            }
                                        }}
                                    />
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label className="acct-form-label" htmlFor="manual-password">
                                        Password / App Password
                                    </label>
                                    <input
                                        className="form-input"
                                        id="manual-password"
                                        type="password"
                                        placeholder="Your email password"
                                        required
                                        aria-label="Password or app password"
                                        value={appPassword}
                                        onChange={e => setAppPassword(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="acct-form-label" htmlFor="manual-imap-host">
                                        IMAP Host
                                    </label>
                                    <input
                                        className="form-input"
                                        id="manual-imap-host"
                                        type="text"
                                        placeholder="imap.gmail.com"
                                        aria-label="IMAP server hostname"
                                        value={imapHost}
                                        onChange={e => setImapHost(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="acct-form-label" htmlFor="manual-imap-port">
                                        IMAP Port
                                    </label>
                                    <input
                                        className="form-input"
                                        id="manual-imap-port"
                                        type="number"
                                        placeholder="993"
                                        aria-label="IMAP server port number"
                                        value={imapPort}
                                        onChange={e => setImapPort(Number(e.target.value))}
                                    />
                                </div>

                                <div>
                                    <label className="acct-form-label" htmlFor="manual-smtp-host">
                                        SMTP Host
                                    </label>
                                    <input
                                        className="form-input"
                                        id="manual-smtp-host"
                                        type="text"
                                        placeholder="smtp.gmail.com"
                                        aria-label="SMTP server hostname"
                                        value={smtpHost}
                                        onChange={e => setSmtpHost(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="acct-form-label" htmlFor="manual-smtp-port">
                                        SMTP Port
                                    </label>
                                    <input
                                        className="form-input"
                                        id="manual-smtp-port"
                                        type="number"
                                        placeholder="465"
                                        aria-label="SMTP server port number"
                                        value={smtpPort}
                                        onChange={e => setSmtpPort(Number(e.target.value))}
                                    />
                                </div>
                            </div>

                            <p className="acct-form-tip">
                                Tip: For custom domains, Host is usually <code>mail.yourdomain.com</code>. For Gmail, use an <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>App Password</a>.
                            </p>

                            <div className="acct-form-actions">
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowManualForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isConnecting}>
                                    {isConnecting ? <><div className="spinner spinner-sm" />Connecting...</> : 'Connect Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}


            {/* Remove confirmation modal */}
            {accountToRemove && (
                <div className="modal-overlay" onClick={() => { setAccountToRemove(null); setRemoveConfirmText(''); }}>
                    <div
                        className="modal-box animate-slide-in"
                        onClick={e => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={removeModalTitleId}
                    >
                        <div className="modal-title" id={removeModalTitleId}>Remove Account</div>
                        <p className="acct-remove-desc">
                            Are you sure? All emails from <strong style={{ color: 'var(--text-primary)' }}>{accountToRemove.email}</strong> will be removed from Unibox. This will <em>not</em> delete emails from Gmail itself.
                        </p>
                        <p className="acct-remove-hint">
                            Type <strong style={{ color: 'var(--text-primary)' }}>REMOVE</strong> to confirm.
                        </p>
                        <input
                            className="form-input"
                            type="text"
                            placeholder="REMOVE"
                            value={removeConfirmText}
                            onChange={e => setRemoveConfirmText(e.target.value)}
                            aria-label="Type REMOVE to confirm account removal"
                            style={{ marginBottom: '1.25rem' }}
                        />
                        <div className="acct-remove-actions">
                            <button className="btn btn-secondary" onClick={() => { setAccountToRemove(null); setRemoveConfirmText(''); }}>Cancel</button>
                            <button
                                className="btn btn-danger"
                                onClick={() => handleRemove(accountToRemove.id)}
                                disabled={removeConfirmText.trim().toUpperCase() !== 'REMOVE'}
                            >
                                Yes, Remove
                            </button>
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
                .acct-error-banner {
                    margin: 16px 24px;
                    padding: 12px 16px;
                    background: rgba(239,68,68,0.08);
                    border: 1px solid rgba(239,68,68,0.2);
                    border-radius: var(--radius-md);
                    color: var(--danger);
                    font-size: 0.8125rem;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .acct-reauth-section {
                    padding: 16px 24px;
                    border-bottom: 1px solid var(--border);
                    background: rgba(239,68,68,0.03);
                }
                .acct-reauth-item {
                    background: var(--bg-base);
                    border: 1px solid var(--danger);
                    border-radius: var(--radius-md);
                    padding: 12px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                .acct-reauth-text {
                    font-size: 0.8125rem;
                    color: var(--danger);
                }
                .acct-card-header {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .acct-card-icon {
                    width: 44px;
                    height: 44px;
                    border-radius: var(--radius-md);
                    background: var(--bg-elevated);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .acct-card-info {
                    flex: 1;
                    min-width: 0;
                }
                .acct-card-email {
                    font-weight: 600;
                    font-size: 0.875rem;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .acct-card-meta {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-top: 4px;
                }
                .acct-card-method {
                    font-size: 0.7rem;
                    color: var(--text-muted);
                }
                .acct-card-sync-info {
                    text-align: right;
                    flex-shrink: 0;
                }
                .acct-card-sync-label {
                    font-size: 0.72rem;
                    color: var(--text-muted);
                }
                .acct-card-sync-value {
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    font-weight: 500;
                    margin-top: 1px;
                }
                .acct-card-status-box {
                    margin-top: 16px;
                    padding: 16px;
                    background: var(--bg-elevated);
                    border-radius: var(--radius-md);
                    border: 1px solid var(--border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .acct-card-status-label {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }
                .acct-card-status-value {
                    font-size: 0.8125rem;
                    font-weight: 600;
                    color: var(--text-primary);
                }
                .acct-card-error-msg {
                    margin-top: 16px;
                    background: rgba(239,68,68,0.08);
                    border: 1px solid rgba(239,68,68,0.2);
                    border-radius: var(--radius-sm);
                    padding: 8px 12px;
                    font-size: 0.775rem;
                    color: var(--danger);
                }
                .acct-warning-banner {
                    margin-top: 10px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    font-weight: 500;
                }
                .acct-warning-banner .btn-xs {
                    margin-left: auto;
                    padding: 3px 10px;
                    font-size: 0.68rem;
                    border-radius: var(--radius-full);
                    flex-shrink: 0;
                }
                .acct-warning-red {
                    background: rgba(239,68,68,0.07);
                    border: 1px solid rgba(239,68,68,0.18);
                    color: #dc2626;
                }
                .acct-warning-orange {
                    background: rgba(245,158,11,0.07);
                    border: 1px solid rgba(245,158,11,0.18);
                    color: #d97706;
                }
                .acct-warning-yellow {
                    background: rgba(234,179,8,0.07);
                    border: 1px solid rgba(234,179,8,0.18);
                    color: #a16207;
                }
                .acct-sync-progress {
                    margin-top: 16px;
                }
                .acct-sync-label {
                    font-size: 0.72rem;
                    color: var(--accent);
                    margin-top: 6px;
                    text-align: center;
                }
                .acct-card-actions {
                    margin-top: 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .acct-card-actions-left {
                    display: flex;
                    gap: 8px;
                }
                .acct-modal-options {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .acct-modal-option-btn {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px 18px;
                    border-radius: var(--radius-lg);
                    background: var(--bg-elevated);
                    border: 1px solid var(--border);
                    cursor: pointer;
                    text-align: left;
                    transition: all 0.2s;
                    color: var(--text-primary);
                }
                .acct-modal-option-btn:hover {
                    border-color: var(--border-strong);
                    background: var(--bg-hover);
                }
                .acct-modal-option-icon {
                    width: 36px;
                    height: 36px;
                    border-radius: var(--radius-sm);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .acct-modal-option-icon--oauth {
                    background: #fff;
                }
                .acct-modal-option-icon--manual {
                    background: var(--bg-tertiary);
                }
                .acct-modal-option-title {
                    font-weight: 600;
                    font-size: 0.9rem;
                }
                .acct-modal-option-desc {
                    font-size: 0.775rem;
                    color: var(--text-muted);
                    margin-top: 2px;
                }
                .acct-form-error {
                    background: rgba(239,68,68,0.08);
                    color: var(--danger);
                    padding: 10px 14px;
                    border-radius: var(--radius-sm);
                    margin-bottom: 16px;
                    font-size: 0.8rem;
                    border: 1px solid rgba(239,68,68,0.2);
                }
                .acct-manual-form {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .acct-manual-form-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                }
                .acct-form-label {
                    display: block;
                    margin-bottom: 6px;
                    font-size: 0.775rem;
                    color: var(--text-secondary);
                    font-weight: 500;
                }
                .acct-form-tip {
                    font-size: 0.72rem;
                    color: var(--text-muted);
                    margin-top: 6px;
                }
                .acct-form-actions {
                    display: flex;
                    gap: 12px;
                    margin-top: 4px;
                }
                .acct-remove-desc {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                    margin-bottom: 16px;
                    line-height: 1.6;
                }
                .acct-remove-hint {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                    margin-bottom: 8px;
                }
                .acct-remove-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                }
            `}</style>
        </div>
    );
}
