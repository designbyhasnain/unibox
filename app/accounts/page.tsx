'use client'

import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import ComposeModal from '../components/ComposeModal';
import {
    getGoogleAuthUrlAction,
    connectManualAccountAction,
    getAccountsAction,
    removeAccountAction,
    reSyncAccountAction
} from '../../src/actions/accountActions';

type AccountStatus = 'ACTIVE' | 'ERROR' | 'DISCONNECTED' | 'SYNCING';
type ConnectionMethod = 'OAUTH' | 'MANUAL';

interface GmailAccount {
    id: string;
    email: string;
    status: AccountStatus;
    connection_method: ConnectionMethod;
    last_synced_at: string | Date | null;
    emails_count?: number;
}

let globalAccountsCache: GmailAccount[] | null = null;

function StatusBadge({ status }: { status: AccountStatus }) {
    const map: Record<AccountStatus, { label: string; cls: string }> = {
        ACTIVE: { label: 'Active', cls: 'badge-green' },
        ERROR: { label: 'Error', cls: 'badge-red' },
        DISCONNECTED: { label: 'Disconnected', cls: 'badge-gray' },
        SYNCING: { label: 'Syncing...', cls: 'badge-blue' },
    };
    const { label, cls } = map[status] || { label: status, cls: 'badge-gray' };
    return <span className={`badge ${cls}`}>{label}</span>;
}

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<GmailAccount[]>(() => globalAccountsCache || []);
    const [isLoading, setIsLoading] = useState(() => !globalAccountsCache);
    const [isComposeOpen, setIsComposeOpen] = useState(false);
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
    const [smtpPort, setSmtpPort] = useState(465);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');


    const fetchAccounts = async () => {
        if (!globalAccountsCache) setIsLoading(true);
        try {
            const userId = '1ca1464d-1009-426e-96d5-8c5e8c84faac';
            const data = await getAccountsAction(userId);
            globalAccountsCache = data as unknown as GmailAccount[];
            setAccounts(data as unknown as GmailAccount[]);
        } catch (err) {
            console.error('Failed to fetch accounts:', err);
            setError('Failed to load accounts. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchAccounts(); }, []);

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
            const userId = '1ca1464d-1009-426e-96d5-8c5e8c84faac';
            const config = {
                imapHost,
                imapPort,
                smtpHost,
                smtpPort
            };
            const result = await connectManualAccountAction(manualEmail, appPassword, userId, config);
            if (result.success && result.account) {
                setAccounts(prev => [result.account as unknown as GmailAccount, ...prev]);
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


    const handleRemove = async (accountId: string) => {
        try {
            const result = await removeAccountAction(accountId);
            if (result.success) {
                setAccounts(prev => prev.filter(acc => acc.id !== accountId));
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

    const handleReSync = async (account: GmailAccount) => {
        setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: 'SYNCING' } : a));
        try {
            const result = await reSyncAccountAction(account.id, account.connection_method);
            if (!result.success) {
                alert('Failed to sync: ' + result.error);
                setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, status: account.status } : a));
            }
        } catch (err: any) {
            console.error(err);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        if (accounts.length === 0) {
            setIsSyncing(false);
            return;
        }
        try {
            const accountsToSync = accounts;
            await Promise.allSettled(accountsToSync.map(acc =>
                fetch('/api/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accountId: acc.id }),
                })
            ));
            setTimeout(async () => {
                await fetchAccounts();
                setIsSyncing(false);
            }, 2000);
        } catch {
            await fetchAccounts();
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

    return (
        <>
            <Sidebar onOpenCompose={() => setIsComposeOpen(true)} />

            <main className="main-area">
                <Topbar
                    searchTerm={searchQuery}
                    setSearchTerm={setSearchQuery}
                    placeholder="Search accounts..."
                    onSearch={() => { }}
                    onClearSearch={() => setSearchQuery('')}
                    leftContent={
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Accounts</h1>
                    }
                    rightContent={
                        <div className="topbar-actions">
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
                                className="btn btn-primary btn-sm"
                                onClick={() => { setShowSelectionModal(true); setError(null); }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14m-7-7h14" /></svg>
                                Add Account
                            </button>
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
                                <span className="count-label">{accounts.length} linked accounts</span>
                            </div>
                            <div className="list-toolbar-right">
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
                        </div>

                        <div className="list-area" style={{ padding: '0' }}>
                            {/* Error banners */}
                            {needsReauth.length > 0 && (
                                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'rgba(239,68,68,0.03)' }}>
                                    {needsReauth.map(acc => (
                                        <div key={acc.id} style={{
                                            background: 'var(--bg-base)', border: '1px solid var(--danger)',
                                            borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'
                                        }}>
                                            <span style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>
                                                <strong>{acc.email}</strong> needs to be reconnected.
                                            </span>
                                            <button className="btn btn-sm btn-danger" onClick={() => handleOAuthFlow()}>Re-authenticate</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {isLoading ? (
                                <div className="empty-state">
                                    <div className="spinner spinner-lg" />
                                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 8 }}>Loading accounts...</span>
                                </div>
                            ) : filteredAccounts.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-state-icon">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
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
                                            {/* Card header */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                                                <div style={{
                                                    width: 44, height: 44, borderRadius: 'var(--radius-md)',
                                                    background: 'var(--bg-elevated)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    flexShrink: 0,
                                                }}>
                                                    {acc.connection_method === 'OAUTH' ? <GoogleIcon /> : (
                                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                                            <polyline points="22,6 12,13 2,6" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {acc.email}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                                                        <StatusBadge status={acc.status} />
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                            {acc.connection_method === 'MANUAL' ? 'Manual/IMAP' : 'Google OAuth'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Last synced</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, marginTop: 1 }}>
                                                        {formatLastSynced(acc.last_synced_at)}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Emails synced */}
                                            {acc.emails_count != null && (
                                                <div style={{ marginTop: '0.875rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{acc.emails_count.toLocaleString()}</span> emails synced
                                                </div>
                                            )}

                                            {/* Error state */}
                                            {acc.status === 'ERROR' && (
                                                <div style={{
                                                    marginTop: '0.875rem', background: 'rgba(239,68,68,0.08)',
                                                    border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)',
                                                    padding: '0.6rem 0.75rem', fontSize: '0.775rem', color: 'var(--danger)'
                                                }}>
                                                    Authentication failed. Please re-authenticate to continue receiving emails.
                                                </div>
                                            )}

                                            {/* Sync progress */}
                                            {acc.status === 'SYNCING' && (
                                                <div style={{ marginTop: '0.875rem' }}>
                                                    <div className="sync-bar">
                                                        <div className="sync-bar-fill" style={{ width: '65%' }} />
                                                    </div>
                                                    <p style={{ fontSize: '0.72rem', color: 'var(--accent)', marginTop: '0.35rem', textAlign: 'center' }}>
                                                        Initial sync in progress...
                                                    </p>
                                                </div>
                                            )}

                                            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    {acc.status === 'ERROR' ? (
                                                        <button className="btn btn-sm btn-primary" onClick={() => handleOAuthFlow()}>
                                                            Re-connect
                                                        </button>
                                                    ) : acc.status !== 'SYNCING' && (
                                                        <button className="btn btn-sm btn-secondary" onClick={() => handleReSync(acc)}>
                                                            Re-sync
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

                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Account type selection modal */}
            {showSelectionModal && (
                <div className="modal-overlay" onClick={() => setShowSelectionModal(false)}>
                    <div className="modal-box animate-slide-in" onClick={e => e.stopPropagation()}>
                        <div className="modal-title">Add Gmail Account</div>
                        <div className="modal-sub">Choose how you&apos;d like to connect your account.</div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button
                                onClick={handleOAuthFlow}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '1rem',
                                    padding: '1rem 1.125rem', borderRadius: 'var(--radius-lg)',
                                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                                    color: 'var(--text-primary)',
                                }}
                                onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                            >
                                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c3.11 0 5.71-1.03 7.61-2.79l-3.57-2.77c-1.01.69-2.31 1.1-4.04 1.1-3.11 0-5.74-2.1-6.68-4.93H1.72v2.85C3.65 20.46 7.55 23 12 23z" fill="#34A853" />
                                        <path d="M5.32 13.62C7.15 13.23 7.15 12.63 7.15 12c0-.63.11-1.23.28-1.82L4.11 7.61c-.6 1.18-.96 2.51-.96 3.9 0 1.39.36 2.73.96 3.9l3.21-1.79z" fill="#FBBC05" />
                                        <path d="M12 6.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C16.46 3.9 14.42 3 12 3 8.55 3 5.61 4.63 4.11 7.61L7.43 10.2c.64-1.93 2.44-3.37 4.57-3.37z" fill="#EA4335" />
                                    </svg>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Google OAuth</div>
                                    <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: 2 }}>Recommended — secure automatic sync</div>
                                </div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                            </button>

                            <button
                                onClick={() => { setShowSelectionModal(false); setShowManualForm(true); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '1rem',
                                    padding: '1rem 1.125rem', borderRadius: 'var(--radius-lg)',
                                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                                    color: 'var(--text-primary)',
                                }}
                                onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                            >
                                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                        <polyline points="22,6 12,13 2,6" />
                                    </svg>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Manual App Password</div>
                                    <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: 2 }}>Uses IMAP/SMTP connection</div>
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
                    <div className="modal-box animate-slide-in" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-title">Custom Domain / IMAP Setup</div>
                        <div className="modal-sub">Enter your email details. For Gmail, use an App Password.</div>

                        {error && (
                            <div style={{
                                background: 'rgba(239,68,68,0.08)', color: 'var(--danger)',
                                padding: '0.65rem 0.875rem', borderRadius: 'var(--radius-sm)',
                                marginBottom: '1rem', fontSize: '0.8rem', border: '1px solid rgba(239,68,68,0.2)'
                            }}>
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleManualConnect} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.775rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                        Email Address
                                    </label>
                                    <input
                                        className="form-input"
                                        type="email"
                                        placeholder="you@yourdomain.com"
                                        required
                                        value={manualEmail}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setManualEmail(val);
                                            // Auto-guess host for common setups
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
                                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.775rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                        Password / App Password
                                    </label>
                                    <input
                                        className="form-input"
                                        type="password"
                                        placeholder="Your email password"
                                        required
                                        value={appPassword}
                                        onChange={e => setAppPassword(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.775rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                        IMAP Host
                                    </label>
                                    <input
                                        className="form-input"
                                        type="text"
                                        placeholder="imap.gmail.com"
                                        value={imapHost}
                                        onChange={e => setImapHost(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.775rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                        IMAP Port
                                    </label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        placeholder="993"
                                        value={imapPort}
                                        onChange={e => setImapPort(Number(e.target.value))}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.775rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                        SMTP Host
                                    </label>
                                    <input
                                        className="form-input"
                                        type="text"
                                        placeholder="smtp.gmail.com"
                                        value={smtpHost}
                                        onChange={e => setSmtpHost(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.775rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                        SMTP Port
                                    </label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        placeholder="465"
                                        value={smtpPort}
                                        onChange={e => setSmtpPort(Number(e.target.value))}
                                    />
                                </div>
                            </div>

                            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                                💡 Tip: For custom domains, Host is usually <code>mail.yourdomain.com</code>. For Gmail, use an <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>App Password</a>.
                            </p>

                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
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
                    <div className="modal-box animate-slide-in" onClick={e => e.stopPropagation()}>
                        <div className="modal-title">Remove Account</div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
                            Are you sure? All emails from <strong style={{ color: 'var(--text-primary)' }}>{accountToRemove.email}</strong> will be removed from Unibox. This will <em>not</em> delete emails from Gmail itself.
                        </p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                            Type <strong style={{ color: 'var(--text-primary)' }}>REMOVE</strong> to confirm.
                        </p>
                        <input
                            className="form-input"
                            type="text"
                            placeholder="REMOVE"
                            value={removeConfirmText}
                            onChange={e => setRemoveConfirmText(e.target.value)}
                            style={{ marginBottom: '1.25rem', textTransform: 'uppercase' }}
                        />
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => { setAccountToRemove(null); setRemoveConfirmText(''); }}>Cancel</button>
                            <button
                                className="btn btn-danger"
                                onClick={() => handleRemove(accountToRemove.id)}
                                disabled={removeConfirmText.toUpperCase() !== 'REMOVE'}
                            >
                                Yes, Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isComposeOpen && <ComposeModal onClose={() => setIsComposeOpen(false)} />}

        </>
    );
}
