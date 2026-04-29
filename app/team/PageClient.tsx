'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { listUsersAction, assignGmailToUserAction, removeGmailFromUserAction, updateUserRoleAction, deactivateUserAction, reactivateUserAction, setUserPasswordAction, deleteUserAction } from '../../src/actions/userManagementActions';
import { sendInviteAction, listInvitesAction, revokeInviteAction, resendInviteAction, deleteInvitationAction } from '../../src/actions/inviteActions';
import { getAccountsAction } from '../../src/actions/accountActions';
import { saveToLocalCache, getFromLocalCache } from '../utils/localCache';
import { PageLoader } from '../components/LoadingStates';

// Cache for instant team page load
let teamCache: { users: any[]; invitations: any[]; accounts: any[] } | null = null;

export default function TeamPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');
    const [users, setUsers] = useState<any[]>([]);
    const [invitations, setInvitations] = useState<any[]>([]);
    const [allAccounts, setAllAccounts] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Modal states
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showManageAccountsModal, setShowManageAccountsModal] = useState<any>(null);
    const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'SALES' as 'ADMIN' | 'SALES' | 'VIDEO_EDITOR', assignedGmailAccountIds: [] as string[] });
    const [inviteResult, setInviteResult] = useState<{ success: boolean; inviteUrl?: string; error?: string } | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [passwordModal, setPasswordModal] = useState<{ userId: string; name: string } | null>(null);
    const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' });
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    // Recently-deleted IDs we don't trust the server about for ~5s. Defeats Supabase
    // read-replica lag where a freshly DELETE'd row can briefly reappear on the next
    // SELECT. Refs don't trigger re-renders or invalidate loadData's deps.
    const pendingDeletesRef = useRef<Set<string>>(new Set());

    const loadData = useCallback(async () => {
        if (!teamCache) setIsLoading(true);
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
            const pending = pendingDeletesRef.current;
            const newUsers = (userResult.success ? userResult.users : []).filter((u: any) => !pending.has(u.id));
            const newInvites = (inviteResult.success ? inviteResult.invitations : []).filter((i: any) => !pending.has(i.id));
            const newAccounts = accountResult.success ? accountResult.accounts : [];
            setUsers(newUsers);
            setInvitations(newInvites);
            setAllAccounts(newAccounts);
            // Cache for instant load next time
            teamCache = { users: newUsers, invitations: newInvites, accounts: newAccounts };
            saveToLocalCache('team_data', teamCache);
        } catch (err) {
            console.error('Failed to load team data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [router]);

    useEffect(() => {
        // Restore from localStorage cache for instant render
        if (!teamCache) {
            const saved = getFromLocalCache('team_data');
            if (saved) teamCache = saved;
        }
        if (teamCache) {
            setUsers(teamCache.users);
            setInvitations(teamCache.invitations);
            setAllAccounts(teamCache.accounts);
            setIsLoading(false);
        }
        loadData();
    }, [loadData]);

    const handleSendInvite = async () => {
        setActionLoading('invite');
        // For ADMIN: auto-assign all accounts; for VIDEO_EDITOR: none; for SALES: as-selected
        const effectiveIds = inviteForm.role === 'ADMIN'
            ? allAccounts.map(a => a.id)
            : inviteForm.role === 'VIDEO_EDITOR'
                ? []
                : inviteForm.assignedGmailAccountIds;
        const payload = { ...inviteForm, assignedGmailAccountIds: effectiveIds };
        const result = await sendInviteAction(payload);
        setInviteResult(result);
        if (result.success) {
            await loadData();
        }
        setActionLoading(null);
    };

    // Optimistic: remove the row immediately; reload in background to reconcile.
    const handleRevokeInvite = async (id: string) => {
        if (!confirm('Revoke this invitation?')) return;
        const snapshot = invitations;
        setInvitations(prev => prev.filter(i => i.id !== id));
        const res = await revokeInviteAction(id);
        if (!res.success) {
            setInvitations(snapshot);
            alert(res.error || 'Failed to revoke invitation');
            return;
        }
        loadData();
    };

    // Optimistic: mark row as PENDING immediately, update created_at timestamp.
    const handleResendInvite = async (id: string) => {
        const snapshot = invitations;
        setInvitations(prev => prev.map(i => i.id === id ? { ...i, status: 'PENDING', created_at: new Date().toISOString() } : i));
        setActionLoading(id);
        const result = await resendInviteAction(id);
        setActionLoading(null);
        if (!result.success) {
            setInvitations(snapshot);
            alert(result.error || 'Failed to resend invitation');
            return;
        }
        if (result.inviteUrl) alert('Invitation resent! New link:\n' + result.inviteUrl);
        loadData();
    };

    // Optimistic: update role in local state immediately.
    const handleRoleChange = async (targetUserId: string, newRole: 'ADMIN' | 'SALES' | 'VIDEO_EDITOR') => {
        const snapshot = users;
        setUsers(prev => prev.map(u => u.id === targetUserId ? { ...u, role: newRole } : u));
        const res = await updateUserRoleAction(targetUserId, newRole);
        if (!res.success) {
            setUsers(snapshot);
            alert(res.error || 'Failed to update role');
            return;
        }
        loadData();
    };

    // Optimistic deactivate — flip crm_status locally, reload in background.
    const handleDeactivate = async (targetUserId: string) => {
        if (!confirm('Deactivate this user? They will lose access.')) return;
        const snapshot = users;
        setUsers(prev => prev.map(u => u.id === targetUserId ? { ...u, crm_status: 'REVOKED' } : u));
        const res = await deactivateUserAction(targetUserId);
        if (!res.success) {
            setUsers(snapshot);
            alert(res.error || 'Failed to deactivate user');
            return;
        }
        loadData();
    };

    const handleReactivate = async (targetUserId: string) => {
        const snapshot = users;
        setUsers(prev => prev.map(u => u.id === targetUserId ? { ...u, crm_status: 'ACTIVE' } : u));
        const res = await reactivateUserAction(targetUserId);
        if (!res.success) {
            setUsers(snapshot);
            alert(res.error || 'Failed to reactivate user');
            return;
        }
        loadData();
    };

    // Instant optimistic delete: state + module cache + localStorage all flip in the
    // same React tick, then the server runs in the background. No post-success
    // refetch (would risk the row reappearing on a stale read replica). pendingDeletesRef
    // also guards any unrelated loadData() that fires within 5s.
    const handleDeleteUser = async (targetUserId: string) => {
        if (!confirm('Are you sure you want to permanently remove this member? This action cannot be undone.')) return;
        const snapshot = users;
        const filtered = users.filter(u => u.id !== targetUserId);

        pendingDeletesRef.current.add(targetUserId);
        setUsers(filtered);
        if (teamCache) {
            teamCache = { ...teamCache, users: filtered };
            saveToLocalCache('team_data', teamCache);
        }

        try {
            const res = await deleteUserAction(targetUserId);
            if (!res.success) throw new Error(res.error || 'Failed to delete user');
            setTimeout(() => pendingDeletesRef.current.delete(targetUserId), 5000);
        } catch (err: any) {
            pendingDeletesRef.current.delete(targetUserId);
            setUsers(snapshot);
            if (teamCache) {
                teamCache = { ...teamCache, users: snapshot };
                saveToLocalCache('team_data', teamCache);
            }
            alert(err?.message || 'Failed to delete user');
        }
    };

    const handleDeleteInvitation = async (id: string) => {
        if (!confirm('Are you sure you want to permanently remove this invitation? This action cannot be undone.')) return;
        const snapshot = invitations;
        const filtered = invitations.filter(i => i.id !== id);

        pendingDeletesRef.current.add(id);
        setInvitations(filtered);
        if (teamCache) {
            teamCache = { ...teamCache, invitations: filtered };
            saveToLocalCache('team_data', teamCache);
        }

        try {
            const res = await deleteInvitationAction(id);
            if (!res.success) throw new Error(res.error || 'Failed to delete invitation');
            setTimeout(() => pendingDeletesRef.current.delete(id), 5000);
        } catch (err: any) {
            pendingDeletesRef.current.delete(id);
            setInvitations(snapshot);
            if (teamCache) {
                teamCache = { ...teamCache, invitations: snapshot };
                saveToLocalCache('team_data', teamCache);
            }
            alert(err?.message || 'Failed to delete invitation');
        }
    };

    // Optimistic checkbox toggle — mutate assignedAccounts locally first.
    const handleToggleAccount = async (targetUserId: string, gmailAccountId: string, isAssigned: boolean) => {
        const snapshot = users;
        setUsers(prev => prev.map(u => {
            if (u.id !== targetUserId) return u;
            const assignedAccounts = isAssigned
                ? (u.assignedAccounts || []).filter((a: any) => a.gmailAccountId !== gmailAccountId)
                : [...(u.assignedAccounts || []), { gmailAccountId, email: allAccounts.find(x => x.id === gmailAccountId)?.email || '' }];
            return { ...u, assignedAccounts };
        }));
        // Keep the open modal synced with the new state
        setShowManageAccountsModal((prev: any) => prev && prev.id === targetUserId
            ? { ...prev, assignedAccounts: isAssigned
                ? (prev.assignedAccounts || []).filter((a: any) => a.gmailAccountId !== gmailAccountId)
                : [...(prev.assignedAccounts || []), { gmailAccountId, email: allAccounts.find(x => x.id === gmailAccountId)?.email || '' }] }
            : prev);
        const res = isAssigned
            ? await removeGmailFromUserAction(targetUserId, gmailAccountId)
            : await assignGmailToUserAction(targetUserId, gmailAccountId);
        if (!res.success) {
            setUsers(snapshot);
            alert(res.error || 'Failed to update account assignment');
            return;
        }
        loadData();
    };

    const handleSetPassword = async () => {
        if (!passwordModal) return;
        setPasswordError('');
        setPasswordSuccess('');
        if (passwordForm.password.length < 8) { setPasswordError('Password must be at least 8 characters'); return; }
        if (passwordForm.password !== passwordForm.confirm) { setPasswordError('Passwords do not match'); return; }
        setActionLoading('password');
        const result = await setUserPasswordAction(passwordModal.userId, passwordForm.password);
        if (result.success) {
            setPasswordSuccess('Password updated for ' + passwordModal.name);
            setPasswordForm({ password: '', confirm: '' });
            await loadData();
            setTimeout(() => { setPasswordModal(null); setPasswordSuccess(''); }, 1500);
        } else {
            setPasswordError(result.error || 'Failed to set password');
        }
        setActionLoading(null);
    };

    const activeCount = users.filter(u => u.crm_status === 'ACTIVE').length;
    const managerCount = users.filter(u => u.role === 'ADMIN' || u.role === 'ACCOUNT_MANAGER').length;
    const editorCount = users.filter(u => u.role === 'VIDEO_EDITOR').length;

    if (isLoading) {
        return <PageLoader isLoading={true} type="table" count={5} context="team"><div /></PageLoader>;
    }

    return (
        <div style={{ height: '100%', overflow: 'auto', background: 'var(--shell)', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>
            <div style={{ padding: '22px 26px' }}>
                {/* Page head */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 18 }}>
                    <div>
                        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>Team members <span style={{ fontWeight: 400, color: 'var(--ink-muted)', fontSize: 14 }}>· {activeCount} active, {invitations.filter(i => i.status === 'PENDING').length} pending invite</span></h2>
                        <div style={{ color: 'var(--ink-muted)', fontSize: 13, marginTop: 4 }}>Roles control account visibility · editors see only assigned edit jobs · managers see all clients on their accounts</div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => { setShowInviteModal(true); setInviteResult(null); setInviteForm({ name: '', email: '', role: 'SALES', assignedGmailAccountIds: [] }); }}
                        style={{ background: 'var(--ink)', color: 'var(--canvas)', border: 'none', padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-ui)', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        + Invite member
                    </button>
                </div>

                {/* KPI grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)', borderRadius: 14, padding: '14px 16px' }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-muted)', fontWeight: 500 }}>Active</div>
                        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', margin: '6px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{activeCount}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>of {users.length} seats</div>
                    </div>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)', borderRadius: 14, padding: '14px 16px' }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-muted)', fontWeight: 500 }}>Managers</div>
                        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', margin: '6px 0 2px' }}>{managerCount}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>across {allAccounts.length} accounts</div>
                    </div>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)', borderRadius: 14, padding: '14px 16px' }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-muted)', fontWeight: 500 }}>Editors</div>
                        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', margin: '6px 0 2px' }}>{editorCount}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>handling edit jobs</div>
                    </div>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)', borderRadius: 14, padding: '14px 16px' }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-muted)', fontWeight: 500 }}>Plan</div>
                        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', margin: '6px 0 2px' }}>Studio</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>{users.length} seats</div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--hairline-soft)', width: 'fit-content', marginBottom: 14 }}>
                    {(['members', 'invitations'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '4px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
                                borderRadius: 6, fontFamily: 'var(--font-ui)',
                                background: activeTab === tab ? 'var(--shell)' : 'none',
                                color: activeTab === tab ? 'var(--ink)' : 'var(--ink-muted)',
                                boxShadow: activeTab === tab ? '0 1px 2px rgba(0,0,0,0.25)' : 'none',
                            }}>
                            {tab === 'members' ? `Members (${users.length})` : `Invites (${invitations.length})`}
                        </button>
                    ))}
                </div>

                    {/* Members Tab */}
                    {activeTab === 'members' && (
                        <div className="team-table-wrapper" style={{ background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden' }}>
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color, var(--hairline))' }}>
                                        <th style={thStyle}>User</th>
                                        <th style={thStyle}>Role</th>
                                        <th style={thStyle}>Status</th>
                                        <th style={thStyle}>Password</th>
                                        <th style={thStyle}>Assigned Accounts</th>
                                        <th style={thStyle}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user, idx) => (
                                        <tr key={user.id} style={{ borderBottom: '1px solid var(--hairline)', background: idx % 2 === 1 ? 'var(--surface)' : 'var(--shell)' }}>
                                            <td style={tdRowStyle}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <div style={{
                                                        width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-light, var(--info-soft))',
                                                        color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 15, fontWeight: 600, flexShrink: 0, overflow: 'hidden',
                                                    }}>
                                                        {user.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} /> : (user.name?.[0] || '?').toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{user.name}</div>
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted, var(--ink-faint))' }}>{user.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={tdRowStyle}>
                                                <select value={user.role} disabled={user.id === currentUser?.userId || actionLoading === user.id}
                                                    onChange={(e) => handleRoleChange(user.id, e.target.value as 'ADMIN' | 'SALES' | 'VIDEO_EDITOR')}
                                                    style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-color, var(--hairline))', background: 'var(--bg-surface)', cursor: 'pointer' }}>
                                                    <option value="ADMIN">Admin</option>
                                                    <option value="SALES">Sales</option>
                                                    <option value="VIDEO_EDITOR">Video Editor</option>
                                                </select>
                                            </td>
                                            <td style={tdRowStyle}>
                                                <span style={{
                                                    display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '4px 14px', borderRadius: 20, minWidth: 64, textAlign: 'center',
                                                    background: user.crm_status === 'ACTIVE' ? 'var(--coach-soft)' : 'var(--surface-2)',
                                                    color: user.crm_status === 'ACTIVE' ? 'var(--coach)' : 'var(--ink-muted)',
                                                }}>
                                                    {user.crm_status === 'ACTIVE' ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td style={tdRowStyle}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{
                                                        display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20, minWidth: 64, textAlign: 'center',
                                                        background: user.password ? 'var(--coach-soft)' : 'var(--warn-soft)',
                                                        color: user.password ? 'var(--coach)' : 'var(--warn)',
                                                    }}>
                                                        {user.password ? 'Set \u2713' : 'Not set'}
                                                    </span>
                                                    <button onClick={() => { setPasswordModal({ userId: user.id, name: user.name }); setPasswordForm({ password: '', confirm: '' }); setPasswordError(''); setPasswordSuccess(''); }}
                                                        style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                                                        Set
                                                    </button>
                                                </div>
                                            </td>
                                            <td style={tdRowStyle}>
                                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                                    {user.assignedAccounts?.slice(0, 2).map((a: any) => (
                                                        <span key={a.gmailAccountId} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, background: 'var(--bg-elevated, var(--surface-2))', color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                                            {a.email}
                                                        </span>
                                                    ))}
                                                    {user.assignedAccounts?.length > 2 && (
                                                        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 12, background: 'var(--bg-elevated, var(--surface-2))', color: 'var(--text-muted)' }}>+{user.assignedAccounts.length - 2}</span>
                                                    )}
                                                    {(!user.assignedAccounts || user.assignedAccounts.length === 0) && user.role === 'ADMIN' && (
                                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>All (admin)</span>
                                                    )}
                                                </div>
                                                <button onClick={() => setShowManageAccountsModal(user)}
                                                    style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: 4 }}>
                                                    Manage
                                                </button>
                                            </td>
                                            <td style={tdRowStyle}>
                                                {user.id !== currentUser?.userId && (
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        {user.crm_status === 'ACTIVE' ? (
                                                            <button onClick={() => handleDeactivate(user.id)} disabled={actionLoading === user.id}
                                                                style={{ fontSize: 12, color: 'var(--ink-muted)', background: 'none', border: '1px solid var(--hairline)', padding: '5px 14px', borderRadius: 6, cursor: 'pointer' }}>
                                                                Deactivate
                                                            </button>
                                                        ) : (
                                                            <button onClick={() => handleReactivate(user.id)} disabled={actionLoading === user.id}
                                                                style={{ fontSize: 12, color: '#fff', background: 'var(--coach)', border: 'none', padding: '5px 14px', borderRadius: 6, cursor: 'pointer' }}>
                                                                Reactivate
                                                            </button>
                                                        )}
                                                        {currentUser?.role === 'ADMIN' && (
                                                            <button onClick={() => handleDeleteUser(user.id)} disabled={actionLoading === user.id}
                                                                style={{ fontSize: 12, color: '#fff', background: 'var(--danger)', border: '1px solid var(--danger)', padding: '5px 14px', borderRadius: 6, cursor: 'pointer' }}>
                                                                Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                            {users.length === 0 && (
                                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                    No team members yet. Invite someone to get started.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Invitations Tab */}
                    {activeTab === 'invitations' && (
                        <div className="team-table-wrapper" style={{ background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden' }}>
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color, var(--hairline))' }}>
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
                                        <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-color, var(--hairline))' }}>
                                            <td style={tdStyle}>{inv.name}</td>
                                            <td style={tdStyle}><span style={{ color: 'var(--text-secondary)' }}>{inv.email}</span></td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                                                    background: inv.role === 'ADMIN' ? 'var(--info-soft)' : inv.role === 'VIDEO_EDITOR' ? 'color-mix(in oklab, var(--accent), transparent 88%)' : 'var(--warn-soft)',
                                                    color: inv.role === 'ADMIN' ? 'var(--accent)' : inv.role === 'VIDEO_EDITOR' ? 'var(--accent)' : 'var(--warn)',
                                                }}>{{ ADMIN: 'Admin', SALES: 'Sales', VIDEO_EDITOR: 'Video Editor' }[inv.role as string] || inv.role}</span>
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                                                    background: inv.status === 'PENDING' ? 'var(--warn-soft)' : inv.status === 'ACCEPTED' ? 'var(--coach-soft)' : 'var(--danger-soft)',
                                                    color: inv.status === 'PENDING' ? 'var(--warn)' : inv.status === 'ACCEPTED' ? 'var(--coach)' : 'var(--danger)',
                                                }}>{inv.status}</span>
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                    {new Date(inv.created_at).toLocaleDateString()}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                {inv.status === 'PENDING' && (
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        <button onClick={() => handleResendInvite(inv.id)} disabled={actionLoading === inv.id}
                                                            style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: '1px solid var(--accent)', padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>
                                                            Resend
                                                        </button>
                                                        <button onClick={() => handleRevokeInvite(inv.id)} disabled={actionLoading === inv.id}
                                                            style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: '1px solid var(--danger)', padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>
                                                            Revoke
                                                        </button>
                                                        {currentUser?.role === 'ADMIN' && (
                                                            <button onClick={() => handleDeleteInvitation(inv.id)} disabled={actionLoading === inv.id}
                                                                style={{ fontSize: 12, color: '#fff', background: 'var(--danger)', border: '1px solid var(--danger)', padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>
                                                                Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {inv.status === 'EXPIRED' && (
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        <button onClick={() => handleResendInvite(inv.id)} disabled={actionLoading === inv.id}
                                                            style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: '1px solid var(--accent)', padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>
                                                            Resend
                                                        </button>
                                                        <button onClick={() => handleRevokeInvite(inv.id)} disabled={actionLoading === inv.id}
                                                            style={{ fontSize: 12, color: 'var(--ink-muted)', background: 'none', border: '1px solid var(--hairline)', padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>
                                                            Remove
                                                        </button>
                                                        {currentUser?.role === 'ADMIN' && (
                                                            <button onClick={() => handleDeleteInvitation(inv.id)} disabled={actionLoading === inv.id}
                                                                style={{ fontSize: 12, color: '#fff', background: 'var(--danger)', border: '1px solid var(--danger)', padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>
                                                                Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                            {invitations.length === 0 && (
                                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No invitations sent yet.</div>
                            )}
                        </div>
                    )}
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
                <div style={overlayStyle} onClick={() => setShowInviteModal(false)}>
                    <div style={modalStyle} onClick={e => e.stopPropagation()}>
                        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>Invite User</h2>

                        {inviteResult?.success ? (
                            <div>
                                <div style={{ background: 'var(--coach-soft)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                                    <p style={{ color: 'var(--coach)', fontWeight: 500, marginBottom: 8 }}>Invitation sent!</p>
                                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Share this link if the email doesn't arrive:</p>
                                    <input type="text" readOnly value={inviteResult.inviteUrl || ''} onClick={(e) => { (e.target as HTMLInputElement).select(); navigator.clipboard.writeText(inviteResult.inviteUrl || ''); }}
                                        style={{ width: '100%', fontSize: 11, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color, var(--hairline))', background: 'var(--bg-surface)', cursor: 'pointer' }} />
                                </div>
                                <button onClick={() => setShowInviteModal(false)} style={btnPrimary}>Done</button>
                            </div>
                        ) : (
                            <>
                                {inviteResult?.error && (
                                    <div style={{ background: 'var(--danger-soft)', borderRadius: 8, padding: 12, marginBottom: 16, color: 'var(--danger)', fontSize: 13 }}>
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
                                    <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as 'ADMIN' | 'SALES' | 'VIDEO_EDITOR' }))} style={inputStyle}>
                                        <option value="SALES">Sales</option>
                                        <option value="ADMIN">Admin</option>
                                        <option value="VIDEO_EDITOR">Video Editor</option>
                                    </select>
                                </div>
                                {inviteForm.role === 'ADMIN' && allAccounts.length > 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                        <label style={labelStyle}>Assign Gmail Accounts</label>
                                        <div style={{ maxHeight: 150, overflow: 'auto', border: '1px solid var(--border-color, var(--hairline))', borderRadius: 8, padding: 8, background: 'var(--surface)' }}>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 6px 8px', fontStyle: 'italic' }}>
                                                Admins automatically have access to all {allAccounts.length} accounts.
                                            </div>
                                            {allAccounts.map(acc => (
                                                <label key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', fontSize: 13, opacity: 0.6 }}>
                                                    <input type="checkbox" checked disabled readOnly />
                                                    {acc.email}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {inviteForm.role === 'SALES' && allAccounts.length > 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                        <label style={labelStyle}>Assign Gmail Accounts</label>
                                        <div style={{ maxHeight: 150, overflow: 'auto', border: '1px solid var(--border-color, var(--hairline))', borderRadius: 8, padding: 8 }}>
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
                                {/* VIDEO_EDITOR: no Gmail section — editors do not need email access */}
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

            {/* Set Password Modal */}
            {passwordModal && (
                <div style={overlayStyle} onClick={() => setPasswordModal(null)}>
                    <div style={modalStyle} onClick={e => e.stopPropagation()}>
                        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Set Password</h2>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>{passwordModal.name}</p>
                        {passwordSuccess ? (
                            <div style={{ background: 'var(--coach-soft)', borderRadius: 8, padding: 16, color: 'var(--coach)', fontWeight: 500, textAlign: 'center' }}>
                                {passwordSuccess}
                            </div>
                        ) : (
                            <>
                                {passwordError && (
                                    <div style={{ background: 'var(--danger-soft)', borderRadius: 8, padding: 12, marginBottom: 16, color: 'var(--danger)', fontSize: 13 }}>
                                        {passwordError}
                                    </div>
                                )}
                                <div style={{ marginBottom: 16 }}>
                                    <label style={labelStyle}>New Password</label>
                                    <input type="password" value={passwordForm.password} onChange={e => setPasswordForm(f => ({ ...f, password: e.target.value }))}
                                        placeholder="Min 8 characters" style={inputStyle} autoComplete="new-password" />
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={labelStyle}>Confirm Password</label>
                                    <input type="password" value={passwordForm.confirm} onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
                                        placeholder="Re-enter password" style={inputStyle} autoComplete="new-password" />
                                </div>
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                                    <button onClick={() => setPasswordModal(null)} style={btnSecondary}>Cancel</button>
                                    <button onClick={handleSetPassword} disabled={actionLoading === 'password'} style={btnPrimary}>
                                        {actionLoading === 'password' ? 'Saving...' : 'Save Password'}
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
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                            {showManageAccountsModal.name} ({showManageAccountsModal.email}) — {showManageAccountsModal.role}
                        </p>

                        {showManageAccountsModal.role === 'VIDEO_EDITOR' ? (
                            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--surface)', borderRadius: 8 }}>
                                Video editors do not need Gmail account access.
                            </div>
                        ) : showManageAccountsModal.role === 'ADMIN' || showManageAccountsModal.role === 'ACCOUNT_MANAGER' ? (
                            <>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 0 12px', fontStyle: 'italic' }}>
                                    Admins automatically have access to all {allAccounts.length} accounts.
                                </div>
                                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                                    {allAccounts.map(acc => (
                                        <label key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid var(--border-color, var(--surface-2))', opacity: 0.6 }}>
                                            <input type="checkbox" checked disabled readOnly />
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{acc.email}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{acc.connection_method} · {acc.status}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div style={{ maxHeight: 300, overflow: 'auto' }}>
                                {allAccounts.map(acc => {
                                    const isAssigned = showManageAccountsModal.assignedAccounts?.some((a: any) => a.gmailAccountId === acc.id);
                                    return (
                                        <label key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', cursor: 'pointer', borderBottom: '1px solid var(--border-color, var(--surface-2))' }}>
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
                        )}

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

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted, var(--ink-faint))', textTransform: 'uppercase', letterSpacing: '0.5px', background: 'var(--surface)' };
const tdStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' };
const tdRowStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle', height: 64 };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalStyle: React.CSSProperties = { background: 'var(--bg-surface, white)', borderRadius: 16, padding: 28, width: 'calc(100% - 32px)', maxWidth: 480, maxHeight: '80vh', overflow: 'auto' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color, var(--hairline))', fontSize: 14, background: 'var(--bg-surface)', outline: 'none' };
const btnPrimary: React.CSSProperties = { background: 'var(--accent, var(--accent))', color: 'white', border: 'none', padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { background: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border-color, var(--hairline))', padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' };
