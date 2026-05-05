'use client'

import React, { useState, useEffect } from 'react';
import { useGlobalFilter } from '../context/FilterContext';
import { useRegisterGlobalSearch } from '../context/GlobalSearchContext';
import { useUI } from '../context/UIContext';
import Topbar from '../components/Topbar';
import ManagePersonaModal, { type PersonaTarget } from '../components/ManagePersonaModal';
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
    syncGoogleProfilesAction,
    pushAllPersonasToGmailAction,
    checkAccountBrandingAction,
} from '../../src/actions/accountActions';
import {
    checkAllDomainsAction,
    checkDomainDNSAction,
    checkGravatarsAction,
    type DnsHealthResult,
    type DnsCheckStatus,
} from '../../src/actions/brandingActions';
import { PageLoader } from '../components/LoadingStates';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { useConfirm } from '../context/ConfirmContext';

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
    display_name?: string | null;
    profile_image?: string | null;
}

import { saveToLocalCache, getFromLocalCache } from '../utils/localCache';
import { useHydrated } from '../utils/useHydration';
import { useUndoToast } from '../context/UndoToastContext';

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

// ── Card primitives (inline so we don't add a new component file) ──

function DnsAuthSection({
    dns,
    onRecheck,
    rechecking,
    isFreeMail,
}: {
    dns: DnsHealthResult | undefined;
    onRecheck: () => void;
    rechecking: boolean;
    isFreeMail: boolean;
}) {
    const pill = (status: DnsCheckStatus, label: string, title?: string) => {
        const cls = status === 'pass' ? 'badge-green' : status === 'fail' ? 'badge-red' : 'badge-gray';
        return <span className={`badge badge-sm ${cls}`} title={title}>{label}</span>;
    };

    return (
        <div
            style={{
                marginTop: 12,
                padding: '10px 12px',
                background: 'color-mix(in oklab, var(--surface) 60%, transparent)',
                border: '1px solid var(--hairline-soft)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
            }}
        >
            <span style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                Domain auth
            </span>
            {isFreeMail ? (
                <span className="badge badge-sm badge-blue" title="Provider-managed domain (gmail/outlook/yahoo) — DNS is set by the provider">Provider-managed</span>
            ) : !dns ? (
                <span className="badge badge-sm badge-gray">Checking…</span>
            ) : (
                <>
                    {pill(dns.spf.status, 'SPF', dns.spf.record || dns.spf.note || 'SPF')}
                    {pill(dns.dkim.status, 'DKIM', dns.dkim.record || dns.dkim.note || 'DKIM')}
                    {pill(dns.dmarc.status, dns.dmarc.policy ? `DMARC: ${dns.dmarc.policy}` : 'DMARC', dns.dmarc.record || dns.dmarc.note || 'DMARC')}
                </>
            )}
            <div style={{ flex: 1 }} />
            {!isFreeMail && (
                <button
                    onClick={onRecheck}
                    disabled={rechecking}
                    className="btn btn-xs btn-secondary"
                    style={{ padding: '3px 8px', fontSize: 11 }}
                    title="Re-check DNS for this domain"
                >
                    {rechecking ? '…' : '↻ Re-check'}
                </button>
            )}
        </div>
    );
}

const FREE_MAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com',
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'yahoo.com', 'yahoo.co.uk', 'ymail.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'proton.me', 'protonmail.com',
]);

export default function AccountsPage() {
    const isHydrated = useHydrated();
    const { selectedAccountId, setSelectedAccountId, accounts, refreshAccounts, isLoadingAccounts, setAccounts } = useGlobalFilter();
    const [isLoading, setIsLoading] = useState(() => accounts.length === 0);
    const { isComposeOpen, setComposeOpen } = useUI();
    const { showError, showSuccess, showInfo } = useUndoToast();
    const confirm = useConfirm();
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
    useRegisterGlobalSearch('/accounts', {
        placeholder: 'Search accounts',
        value: searchQuery,
        onChange: setSearchQuery,
        onClear: () => setSearchQuery(''),
    });
    const [userRole, setUserRole] = useState<string | null>(null);
    const isAdmin = userRole === 'ADMIN' || userRole === 'ACCOUNT_MANAGER';
    const [isRenewingWatches, setIsRenewingWatches] = useState(false);
    const [isSyncingProfiles, setIsSyncingProfiles] = useState(false);
    const [profileSyncResult, setProfileSyncResult] = useState<string | null>(null);
    const [isPushingPersonas, setIsPushingPersonas] = useState(false);

    const handlePushAllToGmail = async () => {
        setIsPushingPersonas(true);
        try {
            const r = await pushAllPersonasToGmailAction();
            const reconnectNeeded = r.results.filter(x => /reconnect/i.test(x.error || '')).length;
            const detail = reconnectNeeded > 0 ? ` · ${reconnectNeeded} need a reconnect` : '';
            if (r.failed > 0) {
                showError(`Pushed ${r.succeeded}/${r.total} personas to Gmail Send-As${detail}.`);
            } else {
                showSuccess(`Pushed ${r.succeeded}/${r.total} personas to Gmail Send-As. Display name + signature now match the Persona on every OAuth account.`);
            }
        } catch (e: any) {
            showError(`Push failed: ${e?.message || 'Unknown error'}`, { onRetry: handlePushAllToGmail });
        } finally {
            setIsPushingPersonas(false);
        }
    };

    const handleBrandingDiagnostic = async (email: string) => {
        const r = await checkAccountBrandingAction(email);
        if (!r.success || !r.report) {
            showError(`Diagnostic failed: ${r.error || 'Unknown'}`);
            return;
        }
        const lines = [
            `DNS: ${r.report.dns}`,
            `Persona: ${r.report.persona}`,
            `Signature: ${r.report.signature}`,
            `Send-As: ${r.report.sendAs}`,
        ].join('  ·  ');
        showSuccess(`${email} — ${lines}`);
    };

    const handleSyncGoogleProfiles = async () => {
        setIsSyncingProfiles(true);
        setProfileSyncResult(null);
        try {
            const res = await syncGoogleProfilesAction();
            if (res.success) {
                setProfileSyncResult(`Done — ${res.updated} updated, ${res.failed} failed out of ${res.processed} accounts.`);
                refreshAccountsSilently();
            } else {
                setProfileSyncResult(`Error: ${res.error}`);
            }
        } catch (e: any) {
            setProfileSyncResult(`Error: ${e?.message || 'Unknown'}`);
        } finally {
            setIsSyncingProfiles(false);
        }
    };

    // Persona state — per-account edit OR bulk-apply to selection.
    const [personaTarget, setPersonaTarget] = useState<PersonaTarget | null>(null);
    const [personaBulkOpen, setPersonaBulkOpen] = useState(false);
    const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());

    // Kebab menu — only one card's action menu is open at a time. Closing on
    // outside click + Escape so the user never gets a stuck-open dropdown.
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    useEffect(() => {
        if (!openMenuId) return;
        const onDocClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && target.closest('.acct-kebab-wrap')) return;
            setOpenMenuId(null);
        };
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenuId(null); };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onEsc);
        };
    }, [openMenuId]);

    // Branding state — DNS health (per-domain) + Gravatar existence (per-email-hash).
    // Computed client-side, refreshed by a button. Read-only — no DB writes.
    const [dnsMap, setDnsMap] = useState<Record<string, DnsHealthResult>>({});
    const [gravatarMap, setGravatarMap] = useState<Record<string, boolean>>({});
    const [emailHashes, setEmailHashes] = useState<Record<string, string>>({}); // email → sha256 hex
    const [dnsLoading, setDnsLoading] = useState(false);
    const [recheckingDomain, setRecheckingDomain] = useState<string | null>(null);
    const toggleBulkSelect = (id: string) => {
        setSelectedForBulk(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const clearBulkSelection = () => setSelectedForBulk(new Set());


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

    // ── Branding: DNS + Gravatar checks ─────────────────────────────────
    // Runs once when accounts load. Read-only public DNS + Gravatar HEAD probe.
    // sha256 is computed client-side via SubtleCrypto so we don't need a
    // server round-trip just to get the hash.
    const loadBrandingChecks = async (accts: GmailAccount[]) => {
        if (!accts.length) return;
        setDnsLoading(true);
        try {
            // Compute sha256 for each unique email (Gravatar key).
            const emails = Array.from(new Set(accts.map(a => a.email.toLowerCase())));
            const hashes: Record<string, string> = {};
            for (const email of emails) {
                const buf = new TextEncoder().encode(email.trim().toLowerCase());
                const digest = await crypto.subtle.digest('SHA-256', buf);
                hashes[email] = Array.from(new Uint8Array(digest))
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');
            }
            setEmailHashes(hashes);

            const domains = Array.from(new Set(
                accts
                    .map(a => a.email.split('@')[1])
                    .filter((d): d is string => Boolean(d))
            ));
            const [dnsRes, gravRes] = await Promise.all([
                checkAllDomainsAction(domains),
                checkGravatarsAction(Object.values(hashes)),
            ]);
            if (dnsRes.success && dnsRes.results) setDnsMap(dnsRes.results);
            if (gravRes.success && gravRes.results) setGravatarMap(gravRes.results);
        } catch (err) {
            console.warn('Branding checks failed:', err);
        } finally {
            setDnsLoading(false);
        }
    };

    useEffect(() => {
        // Trigger when accounts first arrive (or count changes — new connect).
        if (accounts.length > 0 && Object.keys(dnsMap).length === 0) {
            loadBrandingChecks(accounts);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accounts.length]);

    const recheckDomain = async (domain: string) => {
        setRecheckingDomain(domain);
        const res = await checkDomainDNSAction(domain);
        if (res.success && res.result) {
            setDnsMap(prev => ({ ...prev, [domain]: res.result! }));
            showSuccess(`Re-checked ${domain}`);
        } else {
            showError(res.error || 'DNS re-check failed');
        }
        setRecheckingDomain(null);
    };

    const handleOAuthFlow = async () => {
        try {
            const url = await getGoogleAuthUrlAction();
            window.location.href = url;
        } catch (err: any) {
            showError('Failed to initiate Google OAuth: ' + err.message, { onRetry: handleOAuthFlow });
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
                const msg = result.error || 'Connection failed';
                setError(msg);
                showError(`Failed to connect ${manualEmail}. ${msg}. Check credentials or retry via OAuth.`);
            }
        } catch (err: any) {
            const msg = err.message || 'Connection failed';
            setError(msg);
            showError(`Failed to connect ${manualEmail}. ${msg}. Check credentials or retry via OAuth.`);
        } finally {
            setIsConnecting(false);
        }
    };


    const handleReSync = async (account: GmailAccount) => {
        setAccounts((prev: any[]) => prev.map(a => a.id === account.id ? { ...a, status: 'SYNCING', sync_progress: 0 } : a));
        try {
            const result = await reSyncAccountAction(account.id, account.connection_method);
            if (!result.success) {
                showError('Failed to sync: ' + result.error, { onRetry: () => handleReSync(account) });
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
        const ok = await confirm({
            title: 'Stop syncing this account?',
            message: 'Progress is saved on the server. You can re-sync any time and pick up where it left off.',
            confirmLabel: 'Stop sync',
        });
        if (!ok) return;
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
                showSuccess('Connection OK — IMAP + SMTP verified.');
            } else {
                setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: account.status, last_error_message: result.error || 'Test failed' } : a));
                showError('Re-test failed: ' + (result.error || 'Unknown error'), { onRetry: () => handleRetestManual(account) });
            }
        } catch (err: any) {
            setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: account.status } : a));
            showError('Re-test failed: ' + (err?.message || 'Unknown error'), { onRetry: () => handleRetestManual(account) });
        }
    };

    const [isCheckingHealth, setIsCheckingHealth] = useState(false);
    const handleSyncAllHealth = async () => {
        const ok = await confirm({
            title: `Run a bulk health check on all ${accounts.length} accounts?`,
            message: 'Refreshes OAuth tokens and re-tests manual credentials in batches of 5. It does not send any email.',
            confirmLabel: 'Run health check',
        });
        if (!ok) return;
        setIsCheckingHealth(true);
        try {
            const result = await syncAllAccountsHealthAction();
            if (result.success) {
                const summary = `Health check complete — checked ${result.checked}, recovered ${result.recovered}, still failing ${result.stillFailing}, revoked ${result.permanent}.`;
                if (result.failures.length > 0) {
                    showInfo(summary + ' See accounts table for failure details.', { autoDismissMs: 8000 });
                } else {
                    showSuccess(summary);
                }
                fetchAccounts();
            } else {
                showError(`Health check failed. ${result.error || 'Unknown error'}. Re-test IMAP + SMTP credentials, or switch the account to OAuth.`, { onRetry: handleSyncAllHealth });
            }
        } catch (err: any) {
            showError(`Health check failed. ${err?.message || 'Unknown error'}. Re-test IMAP + SMTP credentials, or switch the account to OAuth.`, { onRetry: handleSyncAllHealth });
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
                showError('Failed to remove account: ' + result.error);
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

    const selectionModalTitleId = 'selection-modal-title';
    const manualFormTitleId = 'manual-form-title';
    const removeModalTitleId = 'remove-modal-title';

    return (
        <div style={{ height: '100%', overflow: 'auto', background: 'var(--shell)', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>
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
                                            const ok = await confirm({
                                                title: 'Renew Gmail push notifications?',
                                                message: 'Re-registers the Pub/Sub watch for every connected Gmail account so push deliveries keep flowing past their 7-day expiry. Read-only.',
                                                confirmLabel: 'Renew all',
                                            });
                                            if (!ok) return;
                                            setIsRenewingWatches(true);
                                            try {
                                                const result = await renewAllWatchesAction();
                                                if (result.success) {
                                                    const failed = result.failed ?? 0;
                                                    const renewed = result.renewed ?? 0;
                                                    if (failed > 0) {
                                                        showInfo(`Renewed ${renewed} watches; ${failed} failed. See console for errors.`, { autoDismissMs: 8000 });
                                                        if (result.errors?.length) console.warn('[accounts] renew watches errors:', result.errors);
                                                    } else {
                                                        showSuccess(`Renewed ${renewed} Gmail watches`);
                                                    }
                                                    await fetchAccounts();
                                                } else {
                                                    showError(result.error || 'Failed to renew watches');
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
                                        className="btn btn-secondary btn-sm"
                                        onClick={handleSyncGoogleProfiles}
                                        disabled={isSyncingProfiles}
                                        title="Fetch Google profile name + photo for all OAuth accounts with empty persona"
                                        style={{ opacity: isSyncingProfiles ? 0.6 : 1 }}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                                        </svg>
                                        {isSyncingProfiles ? 'Syncing…' : 'Sync Google Profiles'}
                                    </button>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={handlePushAllToGmail}
                                        disabled={isPushingPersonas}
                                        title="Push display name + signature from each Unibox Persona into Gmail's Send-Mail-As settings (OAuth accounts only). Improves the chance Gmail surfaces the profile photo to recipients."
                                        style={{ opacity: isPushingPersonas ? 0.6 : 1 }}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
                                        </svg>
                                        {isPushingPersonas ? 'Pushing…' : 'Push to Gmail'}
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

                            {profileSyncResult && (
                                <div className={`acct-sync-banner ${profileSyncResult.startsWith('Error') ? 'acct-sync-banner--error' : 'acct-sync-banner--ok'}`}>
                                    {profileSyncResult}
                                    <button className="icon-btn" style={{ marginLeft: 8 }} onClick={() => setProfileSyncResult(null)} aria-label="Dismiss">×</button>
                                </div>
                            )}

                            {isAdmin && (
                                <details
                                    style={{
                                        margin: '0 1.5rem 1rem',
                                        padding: '12px 14px',
                                        background: 'var(--surface)',
                                        border: '1px solid var(--hairline-soft)',
                                        borderRadius: 10,
                                        fontSize: 12.5,
                                        color: 'var(--ink-muted)',
                                    }}
                                >
                                    <summary style={{ cursor: 'pointer', color: 'var(--ink)', fontWeight: 500, fontSize: 13 }}>
                                        Deliverability &amp; sender avatars — what each badge means {dnsLoading ? '· checking…' : ''}
                                    </summary>
                                    <div style={{ marginTop: 10, lineHeight: 1.65 }}>
                                        <div><strong>SPF / DKIM / DMARC</strong> — green means the domain is set up correctly. Untrusted domains land in spam more often and Gmail will never show their sender photo.</div>
                                        <div style={{ marginTop: 8 }}>
                                            <strong style={{ color: 'var(--ink)' }}>How we surface the photo (verified May 2026):</strong>
                                        </div>
                                        <ul style={{ marginTop: 4, paddingLeft: 18 }}>
                                            <li><strong>Inline HTML signature</strong> (every send from a custom domain) — the persona photo is rendered as a 60px circular image + bold display name in the email body. Recipients see the photo regardless of which client they use; this is the most reliable path that doesn&apos;t require a paid cert. Set the photo via the Persona button on each card.</li>
                                            <li><strong>Gmail avatar circle</strong> — hard-blocked without a paid VMC (~$1500/yr) or CMC (~$500–$1200/yr) certificate. No DNS / header / HTML trick turns it on. The signature above is our workaround.</li>
                                            <li><strong>Yahoo / AOL avatar</strong> — free with self-asserted BIMI: DMARC enforcement (<code>p=quarantine</code> or stricter) + a hosted SVG Tiny PS logo + a TXT record at <code>default._bimi.&lt;domain&gt;</code>. We already emit the <code>BIMI-Selector</code> header on every send, so it activates the moment the DNS record is added.</li>
                                            <li><strong>Apple Mail (iCloud recipients only)</strong> — free via Apple Business Connect &ldquo;Branded Mail&rdquo; enrollment (~7-day review). Apple Mail reading Gmail/IMAP doesn&apos;t render avatars at all.</li>
                                            <li><strong>Outlook</strong> — doesn&apos;t render BIMI anywhere as of April 2026.</li>
                                            <li><strong>Schema.org JSON-LD</strong> we inject is parsed by Gmail for action chips, NOT for avatar. We send it because it costs nothing.</li>
                                        </ul>
                                    </div>
                                </details>
                            )}

                            <PageLoader isLoading={!isHydrated || isLoading} type="grid" count={6} context="accounts">
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
                                    <div className="accounts-grid">
                                        {filteredAccounts.map(acc => {
                                            const domain = acc.email.split('@')[1]?.toLowerCase() || '';
                                            const isFreeMail = FREE_MAIL_DOMAINS.has(domain);
                                            const statusLabel = acc.status === 'ACTIVE' ? 'Live'
                                                : acc.status === 'SYNCING' ? 'Syncing'
                                                : acc.status === 'PAUSED' ? 'Paused'
                                                : acc.status === 'ERROR' ? 'Reconnect'
                                                : 'Disconnected';
                                            const initial = (acc.display_name || acc.email).trim().charAt(0).toUpperCase();
                                            const watchHoursLeft = acc.watch_expiry
                                                ? Math.round((new Date(acc.watch_expiry).getTime() - Date.now()) / (1000 * 60 * 60))
                                                : null;
                                            const hasWatchWarn = acc.connection_method === 'OAUTH'
                                                && acc.watch_status === 'ACTIVE'
                                                && watchHoursLeft !== null && watchHoursLeft > 0 && watchHoursLeft <= 48;
                                            const hasInvalidGrant = !!(acc.last_error_message && acc.status !== 'ERROR' && acc.last_error_message.includes('invalid_grant'));
                                            const hasWarmupErr = !!(acc.last_error_message && acc.status !== 'ERROR' && acc.last_error_message.startsWith('Warm-up:'));
                                            const hasPushExpired = acc.connection_method === 'OAUTH' && acc.watch_status !== 'ACTIVE' && acc.status !== 'ERROR';
                                            return (
                                            <div
                                                key={acc.id}
                                                className="acct-glass-card"
                                                data-status={acc.status}
                                            >
                                                {/* Top bar: avatar + identity + kebab. */}
                                                <div className="acct-glass-top">
                                                    {isAdmin && (
                                                        <label
                                                            className="acct-glass-check"
                                                            title="Select for bulk persona apply"
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedForBulk.has(acc.id)}
                                                                onChange={() => toggleBulkSelect(acc.id)}
                                                                aria-label={`Select ${acc.email} for bulk action`}
                                                            />
                                                        </label>
                                                    )}
                                                    <div className={`acct-glass-avatar${acc.profile_image ? ' has-photo' : ''}`}>
                                                        {acc.profile_image ? (
                                                            <img
                                                                src={acc.profile_image}
                                                                alt={acc.display_name || acc.email}
                                                                referrerPolicy="no-referrer"
                                                                onError={e => {
                                                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                                    const parent = e.currentTarget.parentElement;
                                                                    if (parent) parent.classList.remove('has-photo');
                                                                }}
                                                            />
                                                        ) : (
                                                            <span className="acct-glass-avatar-initial">{initial}</span>
                                                        )}
                                                        <span className={`acct-glass-pulse acct-glass-pulse--${acc.status.toLowerCase()}`} aria-hidden="true" />
                                                    </div>
                                                    <div className="acct-glass-identity">
                                                        <div className="acct-glass-name" title={acc.display_name || acc.email}>
                                                            {acc.display_name || acc.email.split('@')[0]}
                                                        </div>
                                                        {acc.display_name && (
                                                            <div className="acct-glass-email" title={acc.email}>{acc.email}</div>
                                                        )}
                                                        <div className="acct-glass-status">
                                                            <span className={`acct-glass-statuslabel acct-glass-statuslabel--${acc.status.toLowerCase()}`}>{statusLabel}</span>
                                                            <span className="acct-glass-dot">·</span>
                                                            <span>{acc.connection_method === 'OAUTH' ? 'Google OAuth' : 'IMAP / SMTP'}</span>
                                                        </div>
                                                    </div>
                                                    {isAdmin && (
                                                        <div className="acct-kebab-wrap">
                                                            <button
                                                                className="acct-kebab-btn"
                                                                aria-label={`Actions for ${acc.email}`}
                                                                aria-haspopup="menu"
                                                                aria-expanded={openMenuId === acc.id}
                                                                onClick={() => setOpenMenuId(prev => prev === acc.id ? null : acc.id)}
                                                            >
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <circle cx="12" cy="5" r="1.4" />
                                                                    <circle cx="12" cy="12" r="1.4" />
                                                                    <circle cx="12" cy="19" r="1.4" />
                                                                </svg>
                                                            </button>
                                                            {openMenuId === acc.id && (
                                                                <div className="acct-kebab-menu" role="menu">
                                                                    {acc.status === 'ERROR' ? (
                                                                        <button role="menuitem" className="acct-kebab-item acct-kebab-item--primary" onClick={() => { setOpenMenuId(null); handleOAuthFlow(); }}>
                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
                                                                            Re-connect
                                                                        </button>
                                                                    ) : acc.status === 'SYNCING' ? (
                                                                        <button role="menuitem" className="acct-kebab-item" onClick={() => { setOpenMenuId(null); handleStopSync(acc); }}>
                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>
                                                                            Stop sync
                                                                        </button>
                                                                    ) : (
                                                                        <button role="menuitem" className="acct-kebab-item" onClick={() => { setOpenMenuId(null); handleReSync(acc); }}>
                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                                                                            Re-sync now
                                                                        </button>
                                                                    )}
                                                                    {acc.status !== 'ERROR' && acc.status !== 'SYNCING' && (
                                                                        <button role="menuitem" className="acct-kebab-item" onClick={() => { setOpenMenuId(null); handleToggleSync(acc); }}>
                                                                            {acc.status === 'PAUSED' ? (
                                                                                <>
                                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                                                                                    Resume sync
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                                                                                    Pause sync
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                    {acc.connection_method === 'MANUAL' && acc.status !== 'SYNCING' && (
                                                                        <button role="menuitem" className="acct-kebab-item" onClick={() => { setOpenMenuId(null); handleRetestManual(acc); }}>
                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                                                                            Re-test IMAP / SMTP
                                                                        </button>
                                                                    )}
                                                                    <button role="menuitem" className="acct-kebab-item" onClick={() => {
                                                                        setOpenMenuId(null);
                                                                        setPersonaTarget({
                                                                            id: acc.id,
                                                                            email: acc.email,
                                                                            displayName: acc.display_name ?? null,
                                                                            profileImage: acc.profile_image ?? null,
                                                                        });
                                                                    }}>
                                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                                                                        Edit persona
                                                                    </button>
                                                                    <button role="menuitem" className="acct-kebab-item" onClick={() => { setOpenMenuId(null); handleBrandingDiagnostic(acc.email); }}>
                                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
                                                                        Run diagnostic
                                                                    </button>
                                                                    <div className="acct-kebab-sep" />
                                                                    <button role="menuitem" className="acct-kebab-item acct-kebab-item--danger" onClick={() => { setOpenMenuId(null); setAccountToRemove(acc); }}>
                                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                                                                        Remove account
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Stats: minimal high-density numerics. */}
                                                <div className="acct-glass-stats">
                                                    <div className="acct-glass-stat">
                                                        <div className="acct-glass-stat-label">Total emails</div>
                                                        <div className="acct-glass-stat-value">
                                                            {acc.emails_count != null ? acc.emails_count.toLocaleString() : '—'}
                                                        </div>
                                                    </div>
                                                    <div className="acct-glass-stat-divider" aria-hidden="true" />
                                                    <div className="acct-glass-stat">
                                                        <div className="acct-glass-stat-label">Last sync</div>
                                                        <div className="acct-glass-stat-value">
                                                            {formatLastSynced(acc.last_synced_at)}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Sync progress (only while syncing). */}
                                                {acc.status === 'SYNCING' && (
                                                    <div className="acct-glass-progress">
                                                        <div className="sync-bar" role="progressbar" aria-valuenow={acc.sync_progress || 0} aria-valuemin={0} aria-valuemax={100} aria-label={`Sync progress: ${acc.sync_progress || 0}%`}>
                                                            <div className="sync-bar-fill" style={{ width: `${acc.sync_progress || 0}%` }} />
                                                        </div>
                                                        <span className="acct-glass-progress-label">{acc.sync_progress || 0}%</span>
                                                    </div>
                                                )}

                                                {/* Critical inline warnings (kept above-fold). */}
                                                {acc.status === 'ERROR' && (
                                                    <div className="acct-glass-alert acct-glass-alert--danger">
                                                        <span>Authentication failed — reconnect required.</span>
                                                        <button className="btn btn-xs btn-primary" onClick={() => handleOAuthFlow()}>Re-connect</button>
                                                    </div>
                                                )}
                                                {hasInvalidGrant && (
                                                    <div className="acct-glass-alert acct-glass-alert--warn">
                                                        <span>Token expired — reconnect recommended.</span>
                                                        <button className="btn btn-xs btn-primary" onClick={() => handleOAuthFlow()}>Reconnect</button>
                                                    </div>
                                                )}
                                                {hasWarmupErr && (
                                                    <div className="acct-glass-alert acct-glass-alert--warn">
                                                        <span>Warm-up failed: {acc.last_error_message!.replace(/^Warm-up:\s*/, '').slice(0, 60)}</span>
                                                        {acc.connection_method === 'MANUAL' ? (
                                                            <button className="btn btn-xs btn-primary" onClick={() => handleRetestManual(acc)}>Re-test</button>
                                                        ) : (
                                                            <button className="btn btn-xs btn-primary" onClick={() => handleOAuthFlow()}>Reconnect</button>
                                                        )}
                                                    </div>
                                                )}
                                                {hasPushExpired && (
                                                    <div className="acct-glass-alert acct-glass-alert--danger">
                                                        <span>Push expired — no real-time sync.</span>
                                                        <button className="btn btn-xs btn-primary" onClick={async () => {
                                                            setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, watch_status: 'ACTIVE' } : a));
                                                            await renewAllWatchesAction();
                                                        }}>Fix now</button>
                                                    </div>
                                                )}
                                                {hasWatchWarn && (
                                                    <div className="acct-glass-alert acct-glass-alert--warn">
                                                        <span>Push expiring in {watchHoursLeft}h.</span>
                                                        <button className="btn btn-xs btn-secondary" onClick={async () => {
                                                            await renewAllWatchesAction();
                                                            refreshAccountsSilently();
                                                        }}>Renew</button>
                                                    </div>
                                                )}

                                                {/* Technical Health — folded by default to keep the card clean. */}
                                                <details className="acct-glass-tech">
                                                    <summary>
                                                        <span className="acct-glass-tech-icon" aria-hidden="true">
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                                        </span>
                                                        <span>Technical health</span>
                                                        <span className="acct-glass-tech-chev" aria-hidden="true">
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                                                        </span>
                                                    </summary>
                                                    <div className="acct-glass-tech-body">
                                                        <div className="acct-glass-tech-row">
                                                            <span className="acct-glass-tech-label">Push</span>
                                                            <WatchStatusBadge
                                                                watchStatus={acc.watch_status}
                                                                watchExpiry={acc.watch_expiry}
                                                                connectionMethod={acc.connection_method}
                                                            />
                                                        </div>
                                                        <DnsAuthSection
                                                            dns={dnsMap[domain]}
                                                            onRecheck={() => recheckDomain(domain)}
                                                            rechecking={recheckingDomain === domain}
                                                            isFreeMail={isFreeMail}
                                                        />
                                                    </div>
                                                </details>
                                            </div>
                                        );})}
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


            {/* Persona modal (per-account OR bulk) */}
            {(personaTarget || personaBulkOpen) && (
                <ManagePersonaModal
                    target={personaTarget || undefined}
                    bulkTargets={
                        personaBulkOpen
                            ? accounts
                                .filter((a: any) => selectedForBulk.has(a.id))
                                .map((a: any) => ({ id: a.id, email: a.email }))
                            : undefined
                    }
                    onClose={() => { setPersonaTarget(null); setPersonaBulkOpen(false); }}
                    onApplied={() => {
                        refreshAccountsSilently();
                        clearBulkSelection();
                    }}
                />
            )}

            {/* Bulk persona bar — floats at bottom when any accounts are checked */}
            {isAdmin && selectedForBulk.size > 0 && (
                <div className="bulk-bar" role="region" aria-label="Bulk persona actions">
                    <div className="bulk-bar-count">{selectedForBulk.size} selected</div>
                    <div className="bulk-bar-actions">
                        <button className="btn btn-secondary btn-sm" onClick={clearBulkSelection}>Clear</button>
                        <button className="btn btn-primary btn-sm" onClick={() => setPersonaBulkOpen(true)}>
                            Apply persona to {selectedForBulk.size}
                        </button>
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
                    color: var(--danger);
                }
                .acct-warning-orange {
                    background: rgba(245,158,11,0.07);
                    border: 1px solid rgba(245,158,11,0.18);
                    color: var(--warn);
                }
                .acct-warning-yellow {
                    background: rgba(234,179,8,0.07);
                    border: 1px solid rgba(234,179,8,0.18);
                    color: var(--warn);
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
                    background: #fff; /* white badge holds Google logo SVG — must stay white for brand parity */
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
