'use client';

import React, { useEffect, useState } from 'react';
import { getDataHealthAction, getGmailSyncHealthAction, type DataHealthSnapshot, type GmailSyncHealth } from '../../src/actions/dataHealthActions';
import { syncAllAccountsHealthAction } from '../../src/actions/accountActions';
import Topbar from '../components/Topbar';
import { AlertTriangle, CheckCircle2, Mail, Database, Users, Briefcase, Clock, Zap } from 'lucide-react';

export default function DataHealthPage() {
    const [db, setDb] = useState<DataHealthSnapshot | null>(null);
    const [gmail, setGmail] = useState<GmailSyncHealth | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [lastRun, setLastRun] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        const [dbRes, gmailRes] = await Promise.all([
            getDataHealthAction(),
            getGmailSyncHealthAction(),
        ]);
        if (dbRes.success && dbRes.data) setDb(dbRes.data);
        if (gmailRes.success && gmailRes.data) setGmail(gmailRes.data);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const handleRunHealthCheck = async () => {
        if (!confirm('Run a bulk health check on all accounts?\n\nThis refreshes OAuth tokens + re-tests manual credentials in batches of 5. It does not send any email.')) return;
        setRunning(true);
        const res = await syncAllAccountsHealthAction();
        setRunning(false);
        if (res.success) {
            setLastRun(`Checked ${res.checked} · Recovered ${res.recovered} · Still failing ${res.stillFailing} · Permanently revoked ${res.permanent}`);
            load();
        } else {
            alert(res.error || 'Health check failed');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <Topbar searchTerm="" setSearchTerm={() => {}} onSearch={() => {}} onClearSearch={() => {}} leftContent={<h1 className="page-title">Data Health</h1>} />
            <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
                <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <div>
                            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>System Health</h1>
                            <p style={{ fontSize: 13, color: 'var(--text-muted, #94a3b8)', marginTop: 4 }}>
                                Gmail sync status, rate-limit monitor, and database integrity in one place.
                            </p>
                        </div>
                        <button onClick={handleRunHealthCheck} disabled={running} className="btn btn-primary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Zap size={14} />
                            {running ? 'Running…' : 'Run Health Check'}
                        </button>
                    </div>

                    {lastRun && (
                        <div style={{ background: '#e6f4ea', border: '1px solid #a6d5b7', color: '#1e8e3e', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
                            Last check: {lastRun}
                        </div>
                    )}

                    {loading ? (
                        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
                    ) : (
                        <>
                            {/* Gmail Sync Health */}
                            <Section title="Gmail Sync" icon={<Mail size={16} />}>
                                {gmail ? (
                                    <>
                                        <Kpis>
                                            <Kpi label="Total Accounts" value={gmail.totalAccounts} />
                                            <Kpi label="Active" value={gmail.active} tone={gmail.active > 0 ? 'green' : 'neutral'} />
                                            <Kpi label="Syncing" value={gmail.syncing} tone="blue" />
                                            <Kpi label="Error" value={gmail.error} tone={gmail.error > 0 ? 'red' : 'neutral'} />
                                            <Kpi label="Rate limited" value={gmail.rateLimited} tone={gmail.rateLimited > 0 ? 'amber' : 'neutral'} />
                                            <Kpi label="OAuth / Manual" value={`${gmail.oauth} / ${gmail.manual}`} />
                                            <Kpi label="Fresh (≤ 6h)" value={gmail.freshAccounts} tone="green" />
                                            <Kpi label="Stalest" value={gmail.stalestAccount ? `${gmail.stalestAccount.daysAgo}d` : '—'} tone={gmail.stalestAccount && gmail.stalestAccount.daysAgo > 7 ? 'amber' : 'neutral'} />
                                        </Kpis>

                                        {gmail.recentlyFailed.length > 0 ? (
                                            <div style={{ marginTop: 20 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                                                    Recent failures
                                                </div>
                                                <div style={{ background: 'var(--bg-surface, #fff)', borderRadius: 10, border: '1px solid var(--border-color, #e5e7eb)', overflow: 'hidden' }}>
                                                    {gmail.recentlyFailed.map((r, idx) => (
                                                        <div key={r.email} style={{
                                                            padding: '10px 14px',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                            borderTop: idx === 0 ? 'none' : '1px solid var(--border-color, #f0f0f0)',
                                                            fontSize: 13,
                                                        }}>
                                                            <div>
                                                                <div style={{ fontWeight: 500 }}>{r.email}</div>
                                                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.lastError || 'No error message'}</div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                                                                <span>{r.failCount} fails</span>
                                                                <span>{r.lastErrorAt ? new Date(r.lastErrorAt).toLocaleString() : '—'}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <EmptyNote ok>All accounts are healthy. No recent failures.</EmptyNote>
                                        )}
                                    </>
                                ) : <EmptyNote>Gmail sync health is unavailable.</EmptyNote>}
                            </Section>

                            {/* Database Integrity */}
                            <Section title="Database" icon={<Database size={16} />}>
                                {db ? (
                                    <Kpis>
                                        <Kpi label="Total Emails" value={db.totalEmails.toLocaleString()} icon={<Mail size={14} />} />
                                        <Kpi label="Total Contacts" value={db.totalContacts.toLocaleString()} icon={<Users size={14} />} />
                                        <Kpi label="Total Projects" value={db.totalProjects.toLocaleString()} icon={<Briefcase size={14} />} />
                                        <Kpi label="Orphan Emails" value={db.orphanEmails.toLocaleString()} tone={db.orphanEmails > 0 ? 'amber' : 'green'} />
                                        <Kpi label="Orphan Projects" value={db.orphanProjects.toLocaleString()} tone={db.orphanProjects > 0 ? 'amber' : 'green'} />
                                        <Kpi label="Unassigned Contacts" value={db.unassignedContacts.toLocaleString()} tone={db.unassignedContacts > 0 ? 'amber' : 'green'} />
                                        <Kpi label="Stale Leads (60d+)" value={db.contactsNotTouched60d.toLocaleString()} tone={db.contactsNotTouched60d > 0 ? 'amber' : 'green'} icon={<Clock size={14} />} />
                                        <Kpi label="Overdue Unpaid" value={db.overdueUnpaid.toLocaleString()} tone={db.overdueUnpaid > 0 ? 'red' : 'green'} />
                                    </Kpis>
                                ) : <EmptyNote>Database stats are unavailable.</EmptyNote>}
                            </Section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section style={{ background: 'var(--bg-surface, #fff)', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ color: 'var(--accent, #1a73e8)', display: 'inline-flex' }}>{icon}</span>
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted, #64748b)' }}>{title}</h2>
            </div>
            {children}
        </section>
    );
}

function Kpis({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {children}
        </div>
    );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string | number; tone?: 'green' | 'red' | 'amber' | 'blue' | 'neutral'; icon?: React.ReactNode }) {
    const colors: Record<string, string> = {
        green: '#1e8e3e', red: '#d93025', amber: '#b45309', blue: '#1a73e8', neutral: 'var(--text-primary)',
    };
    const color = colors[tone || 'neutral'];
    return (
        <div style={{
            border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 10, padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 4, minHeight: 70,
        }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 4 }}>
                {icon}{label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
        </div>
    );
}

function EmptyNote({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
    return (
        <div style={{
            background: ok ? '#e6f4ea' : '#f9fafb',
            color: ok ? '#1e8e3e' : 'var(--text-muted)',
            border: `1px solid ${ok ? '#a6d5b7' : 'var(--border-color, #e5e7eb)'}`,
            borderRadius: 10, padding: '14px 18px', fontSize: 13, marginTop: 12,
            display: 'flex', alignItems: 'center', gap: 8,
        }}>
            {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {children}
        </div>
    );
}
