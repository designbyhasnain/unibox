'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { listUsersAction, assignGmailToUserAction, removeGmailFromUserAction, updateUserRoleAction, deactivateUserAction, reactivateUserAction } from '../../src/actions/userManagementActions';
import { sendInviteAction, listInvitesAction, revokeInviteAction, resendInviteAction } from '../../src/actions/inviteActions';
import { getAccountsAction } from '../../src/actions/accountActions';
import Topbar from '../components/Topbar';

export default function TeamPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');
    const [users, setUsers] = useState<any[]>([]);
    const [invitations, setInvitations] = useState<any[]>([]);
    const [allAccounts, setAllAccounts] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [debugError, setDebugError] = useState<string | null>(null);

    // Modal states
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showManageAccountsModal, setShowManageAccountsModal] = useState<any>(null);
    const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'SALES' as 'ADMIN' | 'SALES', assignedGmailAccountIds: [] as string[] });
    const [inviteResult, setInviteResult] = useState<{ success: boolean; inviteUrl?: string; error?: string } | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [userResult, user, inviteResult, accountResult] = await Promise.all([
                listUsersAction(),
                getCurrentUserAction(),
                listInvitesAction(),
                getAccountsAction(),
            ]);
            if (user && user.role !== 'ADMIN' && user.role !== 'ACCOUNT_MANAGER') {
                router.push('/');
                return;
            }
            setCurrentUser(user);
            if (userResult.success) setUsers(userResult.users);
            else setDebugError(`listUsers: ${userResult.error}`);
            if (inviteResult.success) setInvitations(inviteResult.invitations);
            if (accountResult.success) setAllAccounts(accountResult.accounts);
        } catch (err) {
            console.error('Failed to load team data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [router]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSendInvite = async () => {
        setActionLoading('invite');
        const result = await sendInviteAction(inviteForm);
        setInviteResult(result);
        if (result.success) {
            await loadData();
        }
        setActionLoading(null);
    };

    const handleRevokeInvite = async (id: string) => {
        if (!confirm('Revoke this invitation?')) return;
        setActionLoading(id);
        await revokeInviteAction(id);
        await loadData();
        setActionLoading(null);
    };

    const handleResendInvite = async (id: string) => {
        setActionLoading(id);
        const result = await resendInviteAction(id);
        if (result.success && result.inviteUrl) {
            alert('Invitation resent! New link:\n' + result.inviteUrl);
        }
        await loadData();
        setActionLoading(null);
    };

    const handleRoleChange = async (targetUserId: string, newRole: 'ADMIN' | 'SALES') => {
        setActionLoading(targetUserId);
        await updateUserRoleAction(targetUserId, newRole);
        await loadData();
        setActionLoading(null);
    };

    const handleDeactivate = async (targetUserId: string) => {
        if (!confirm('Deactivate this user? They will lose access.')) return;
        setActionLoading(targetUserId);
        await deactivateUserAction(targetUserId);
        await loadData();
        setActionLoading(null);
    };

    const handleReactivate = async (targetUserId: string) => {
        setActionLoading(targetUserId);
        await reactivateUserAction(targetUserId);
        await loadData();
        setActionLoading(null);
    };

    const handleToggleAccount = async (targetUserId: string, gmailAccountId: string, isAssigned: boolean) => {
        if (isAssigned) {
            await removeGmailFromUserAction(targetUserId, gmailAccountId);
        } else {
            await assignGmailToUserAction(targetUserId, gmailAccountId);
        }
        await loadData();
    };

    if (isLoading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Topbar searchTerm="" setSearchTerm={() => {}} onSearch={() => {}} onClearSearch={() => {}} leftContent={<h1 className="page-title">Team Management</h1>} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                    <div className="login-spinner"></div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <Topbar searchTerm="" setSearchTerm={() => {}} onSearch={() => {}} onClearSearch={() => {}} leftContent={<h1 className="page-title">Team Management</h1>} />
            <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
                <div style={{ maxWidth: 960, margin: '0 auto' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>Team Management</h1>
                        <button onClick={() => { setShowInviteModal(true); setInviteResult(null); setInviteForm({ name: '', email: '', role: 'SALES', assignedGmailAccountIds: [] }); }}
                            style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                            + Invite User
                        </button>
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-color, #e0e0e0)', marginBottom: 20 }}>
                        {(['members', 'invitations'] as const).map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)}
                                style={{
                                    padding: '10px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', background: 'none',
                                    color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                                    borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                                }}>
                                {tab === 'members' ? `Team Members (${users.length})` : `Invitations (${invitations.length})`}
                            </button>
                        ))}
                    </div>

                    {/* Members Tab */}
                    {activeTab === 'members' && (
                        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color, #e0e0e0)' }}>
                                        <th style={thStyle}>User</th>
                                        <th style={thStyle}>Role</th>
                                        <th style={thStyle}>Status</th>
                                        <th style={thStyle}>Assigned Accounts</th>
                                        <th style={thStyle}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(user => (
                                        <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color, #e0e0e0)' }}>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{
                                                        width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-light, #e8f0fe)',
                                                        color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 13, fontWeight: 600, flexShrink: 0,
                                                    }}>
                                                        {user.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} /> : (user.name?.[0] || '?').toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{user.name}</div>
                                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{user.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={tdStyle}>
                                                <select value={user.role} disabled={user.id === currentUser?.userId || actionLoading === user.id}
                                                    onChange={(e) => handleRoleChange(user.id, e.target.value as 'ADMIN' | 'SALES')}
                                                    style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color, #dadce0)', background: 'var(--bg-surface)', cursor: 'pointer' }}>
                                                    <option value="ADMIN">Admin</option>
                                                    <option value="SALES">Sales</option>
                                                </select>
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                                                    background: user.status === 'ACTIVE' ? '#e6f4ea' : '#fce8e6',
                                                    color: user.status === 'ACTIVE' ? '#1e8e3e' : '#d93025',
                                                }}>
                                                    {user.status}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                    {user.assignedAccounts?.slice(0, 2).map((a: any) => (
                                                        <span key={a.gmailAccountId} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--bg-elevated, #f1f3f4)', color: 'var(--text-secondary)' }}>
                                                            {a.email}
                                                        </span>
                                                    ))}
                                                    {user.assignedAccounts?.length > 2 && (
                                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{user.assignedAccounts.length - 2}</span>
                                                    )}
                                                    {(!user.assignedAccounts || user.assignedAccounts.length === 0) && user.role === 'ADMIN' && (
                                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>All (admin)</span>
                                                    )}
                                                </div>
                                                <button onClick={() => setShowManageAccountsModal(user)}
                                                    style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: 2 }}>
                                                    Manage
                                                </button>
                                            </td>
                                            <td style={tdStyle}>
                                                {user.id !== currentUser?.userId && (
                                                    user.status === 'ACTIVE' ? (
                                                        <button onClick={() => handleDeactivate(user.id)} disabled={actionLoading === user.id}
                                                            style={{ fontSize: 12, color: '#d93025', background: 'none', border: '1px solid #d93025', padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>
                                                            Deactivate
                                                        </button>
                                                    ) : (
                                                        <button onClick={() => handleReactivate(user.id)} disabled={actionLoading === user.id}
                                                            style={{ fontSize: 12, color: '#1e8e3e', background: 'none', border: '1px solid #1e8e3e', padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>
                                                            Reactivate
                                                        </button>
                                                    )
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {users.length === 0 && (
                                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                    {debugError ? <div style={{ color: 'red', marginBottom: 8 }}>{debugError}</div> : null}
                                    No team members yet. Invite someone to get started.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Invitations Tab */}
                    {activeTab === 'invitations' && (
                        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color, #e0e0e0)' }}>
                                        <th style={thStyle}>Name</th>
                                        <th style={thStyle}>Email</th>
                                        <th style={thStyle}>Role</th>
                                        <th style={thStyle}>Status</th>
                                        <th style={thStyle}>Sent</th>
                                        <th style={thStyle}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invitations.map(inv => (
                                        <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-color, #e0e0e0)' }}>
                                            <td style={tdStyle}>{inv.name}</td>
                                            <td style={tdStyle}><span style={{ color: 'var(--text-secondary)' }}>{inv.email}</span></td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                                                    background: inv.role === 'ADMIN' ? '#e8f0fe' : '#fef7e0',
                                                    color: inv.role === 'ADMIN' ? '#1a73e8' : '#e37400',
                                                }}>{inv.role}</span>
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                                                    background: inv.status === 'PENDING' ? '#fef7e0' : inv.status === 'ACCEPTED' ? '#e6f4ea' : '#fce8e6',
                                                    color: inv.status === 'PENDING' ? '#e37400' : inv.status === 'ACCEPTED' ? '#1e8e3e' : '#d93025',
                                                }}>{inv.status}</span>
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                    {new Date(inv.created_at).toLocaleDateString()}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                {inv.status === 'PENDING' && (
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <button onClick={() => handleResendInvite(inv.id)} disabled={actionLoading === inv.id}
                                                            style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: '1px solid var(--accent)', padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>
                                                            Resend
                                                        </button>
                                                        <button onClick={() => handleRevokeInvite(inv.id)} disabled={actionLoading === inv.id}
                                                            style={{ fontSize: 12, color: '#d93025', background: 'none', border: '1px solid #d93025', padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>
                                                            Revoke
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {invitations.length === 0 && (
                                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No invitations sent yet.</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
                <div style={overlayStyle} onClick={() => setShowInviteModal(false)}>
                    <div style={modalStyle} onClick={e => e.stopPropagation()}>
                        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>Invite User</h2>

                        {inviteResult?.success ? (
                            <div>
                                <div style={{ background: '#e6f4ea', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                                    <p style={{ color: '#1e8e3e', fontWeight: 500, marginBottom: 8 }}>Invitation sent!</p>
                                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Share this link if the email doesn't arrive:</p>
                                    <input type="text" readOnly value={inviteResult.inviteUrl || ''} onClick={(e) => { (e.target as HTMLInputElement).select(); navigator.clipboard.writeText(inviteResult.inviteUrl || ''); }}
                                        style={{ width: '100%', fontSize: 11, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color, #dadce0)', background: 'var(--bg-surface)', cursor: 'pointer' }} />
                                </div>
                                <button onClick={() => setShowInviteModal(false)} style={btnPrimary}>Done</button>
                            </div>
                        ) : (
                            <>
                                {inviteResult?.error && (
                                    <div style={{ background: '#fce8e6', borderRadius: 8, padding: 12, marginBottom: 16, color: '#d93025', fontSize: 13 }}>
                                        {inviteResult.error}
                                    </div>
                                )}
                                <div style={{ marginBottom: 16 }}>
                                    <label style={labelStyle}>Name</label>
                                    <input type="text" value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))} placeholder="John Doe" style={inputStyle} />
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={labelStyle}>Email</label>
                                    <input type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" style={inputStyle} />
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={labelStyle}>Role</label>
                                    <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as 'ADMIN' | 'SALES' }))} style={inputStyle}>
                                        <option value="SALES">Sales</option>
                                        <option value="ADMIN">Admin</option>
                                    </select>
                                </div>
                                {inviteForm.role === 'SALES' && allAccounts.length > 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                        <label style={labelStyle}>Assign Gmail Accounts</label>
                                        <div style={{ maxHeight: 150, overflow: 'auto', border: '1px solid var(--border-color, #dadce0)', borderRadius: 8, padding: 8 }}>
                                            {allAccounts.map(acc => (
                                                <label key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', fontSize: 13 }}>
                                                    <input type="checkbox" checked={inviteForm.assignedGmailAccountIds.includes(acc.id)}
                                                        onChange={e => {
                                                            setInviteForm(f => ({
                                                                ...f,
                                                                assignedGmailAccountIds: e.target.checked
                                                                    ? [...f.assignedGmailAccountIds, acc.id]
                                                                    : f.assignedGmailAccountIds.filter((id: string) => id !== acc.id),
                                                            }));
                                                        }} />
                                                    {acc.email}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                                    <button onClick={() => setShowInviteModal(false)} style={btnSecondary}>Cancel</button>
                                    <button onClick={handleSendInvite} disabled={!inviteForm.name || !inviteForm.email || actionLoading === 'invite'} style={btnPrimary}>
                                        {actionLoading === 'invite' ? 'Sending...' : 'Send Invite'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Manage Accounts Modal */}
            {showManageAccountsModal && (
                <div style={overlayStyle} onClick={() => setShowManageAccountsModal(null)}>
                    <div style={modalStyle} onClick={e => e.stopPropagation()}>
                        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Manage Account Access</h2>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>{showManageAccountsModal.name} ({showManageAccountsModal.email})</p>
                        <div style={{ maxHeight: 300, overflow: 'auto' }}>
                            {allAccounts.map(acc => {
                                const isAssigned = showManageAccountsModal.assignedAccounts?.some((a: any) => a.gmailAccountId === acc.id);
                                return (
                                    <label key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', cursor: 'pointer', borderBottom: '1px solid var(--border-color, #f0f0f0)' }}>
                                        <input type="checkbox" checked={isAssigned}
                                            onChange={() => handleToggleAccount(showManageAccountsModal.id, acc.id, isAssigned)} />
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{acc.email}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{acc.connection_method} · {acc.status}</div>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                            <button onClick={() => setShowManageAccountsModal(null)} style={btnPrimary}>Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' };
const tdStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalStyle: React.CSSProperties = { background: 'var(--bg-surface, white)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '80vh', overflow: 'auto' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color, #dadce0)', fontSize: 14, background: 'var(--bg-surface)', outline: 'none' };
const btnPrimary: React.CSSProperties = { background: 'var(--accent, #1a73e8)', color: 'white', border: 'none', padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { background: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border-color, #dadce0)', padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' };
