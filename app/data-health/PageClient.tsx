'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { getDataHealthAction, getGmailSyncHealthAction, type DataHealthSnapshot, type GmailSyncHealth } from '../../src/actions/dataHealthActions';
import { syncAllAccountsHealthAction } from '../../src/actions/accountActions';
import { LoadingText } from '../components/LoadingStates';
import { useUndoToast } from '../context/UndoToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useRegisterGlobalSearch } from '../context/GlobalSearchContext';

import { AlertTriangle, CheckCircle2, Mail, Database, Users, Briefcase, Clock, Zap, Activity } from 'lucide-react';

interface PerfRouteStats {
    route: string;
    n: number;
    p50: number;
    p95: number;
    max: number;
    recent: number[];
    breachesSlo: boolean;
}

export default function DataHealthPage() {
    const { showError } = useUndoToast();
    const confirm = useConfirm();
    const [db, setDb] = useState<DataHealthSnapshot | null>(null);
    const [gmail, setGmail] = useState<GmailSyncHealth | null>(null);
    const [perf, setPerf] = useState<PerfRouteStats[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [lastRun, setLastRun] = useState<string | null>(null);

    // Topbar search — filters integrity issues (Recent Failures and Perf
    // routes) by email / error text / route path. Real-time client-side
    // filter; the lists are short.
    const [searchTerm, setSearchTerm] = useState('');
    useRegisterGlobalSearch('/data-health', {
        placeholder: 'Search routes, errors, accounts',
        value: searchTerm,
        onChange: setSearchTerm,
        onClear: () => setSearchTerm(''),
    });

    const filteredFailures = useMemo(() => {
        const list = gmail?.recentlyFailed ?? [];
        const q = searchTerm.trim().toLowerCase();
        if (!q) return list;
        return list.filter(r => {
            const fields = [r.email, r.lastError];
            return fields.some(f => (f || '').toString().toLowerCase().includes(q));
        });
    }, [gmail, searchTerm]);

    const filteredPerf = useMemo(() => {
        const list = perf ?? [];
        const q = searchTerm.trim().toLowerCase();
        if (!q) return list;
        return list.filter(r => r.route.toLowerCase().includes(q));
    }, [perf, searchTerm]);

    const load = async () => {
        setLoading(true);
        const [dbRes, gmailRes, perfRes] = await Promise.all([
            getDataHealthAction(),
            getGmailSyncHealthAction(),
            fetch('/api/perf/stats').then(r => r.ok ? r.json() : { stats: [] }).catch(() => ({ stats: [] })),
        ]);
        if (dbRes.success && dbRes.data) setDb(dbRes.data);
        if (gmailRes.success && gmailRes.data) setGmail(gmailRes.data);
        setPerf(perfRes.stats || []);
        setLoading(false);
    };

    useEffect(() => {
        load();
        // Refresh perf stats every 30s while the page is open so an admin
        // watching the dashboard SLO sees fresh data.
        const interval = setInterval(() => {
            fetch('/api/perf/stats')
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (data?.stats) setPerf(data.stats); })
                .catch(() => { /* ignore */ });
        }, 30_000);
        return () => clearInterval(interval);
    }, []);

    const handleRunHealthCheck = async () => {
        const ok = await confirm({
            title: 'Run a bulk health check on all accounts?',
            message: 'Refreshes OAuth tokens and re-tests manual credentials in batches of 5. Read-only — no email is sent.',
            confirmLabel: 'Run health check',
        });
        if (!ok) return;
        setRunning(true);
        const res = await syncAllAccountsHealthAction();
        setRunning(false);
        if (res.success) {
            setLastRun(`Checked ${res.checked} · Recovered ${res.recovered} · Still failing ${res.stillFailing} · Permanently revoked ${res.permanent}`);
            load();
        } else {
            showError(res.error || 'Health check failed', { onRetry: handleRunHealthCheck });
        }
    };

    return (
        <div style={{ height: '100%', overflow: 'auto', background: 'var(--shell)', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>
            <div style={{ padding: '22px 26px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 18 }}>
                    <div>
                        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>Database hygiene</h2>
                        <div style={{ color: 'var(--ink-muted)', fontSize: 13, marginTop: 4 }}>Gmail sync status, rate-limit monitor, and database integrity</div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <button onClick={handleRunHealthCheck} disabled={running}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)', background: 'none', border: '1px solid var(--hairline-soft)', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                        <Zap size={14} />
                        {running ? 'Running…' : 'Re-scan'}
                    </button>
                </div>

                    {lastRun && (
                        <div style={{ background: 'var(--coach-soft)', border: '1px solid var(--coach)', color: 'var(--coach)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
                            Last check: {lastRun}
                        </div>
                    )}

                    {loading ? (
                        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                            <LoadingText context="data-health" />
                        </div>
                    ) : (
                        <>
                            {/* Performance Monitor — page-load timings reported by usePerfMonitor */}
                            <Section title="Performance" icon={<Activity size={16} />}>
                                <PerfTable rows={filteredPerf} searchTerm={searchTerm} totalRows={(perf || []).length} />
                            </Section>

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
                                                    {searchTerm && (
                                                        <span style={{ marginLeft: 6, color: 'var(--ink-muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                                                            ({filteredFailures.length}/{gmail.recentlyFailed.length})
                                                        </span>
                                                    )}
                                                </div>
                                                {filteredFailures.length === 0 ? (
                                                    <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--ink-muted)' }}>
                                                        No failures match “{searchTerm}”.
                                                    </div>
                                                ) : (
                                                <div style={{ background: 'var(--shell)', borderRadius: 10, border: '1px solid var(--hairline-soft)', overflow: 'hidden' }}>
                                                    {filteredFailures.map((r, idx) => (
                                                        <div key={r.email} style={{
                                                            padding: '10px 14px',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                            borderTop: idx === 0 ? 'none' : '1px solid var(--border-color, var(--surface-2))',
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
                                                )}
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
    );
}

function PerfTable({ rows, searchTerm, totalRows }: { rows: PerfRouteStats[]; searchTerm?: string; totalRows?: number }) {
    if (rows.length === 0) {
        if (searchTerm && totalRows && totalRows > 0) {
            return (
                <div style={{ padding: '20px 0', color: 'var(--ink-muted)', fontSize: 13 }}>
                    No routes match “{searchTerm}”.
                </div>
            );
        }
        return (
            <div style={{ padding: '20px 0', color: 'var(--ink-muted)', fontSize: 13 }}>
                No samples yet — load the dashboard / inbox / opportunities pages to start collecting timings.
            </div>
        );
    }
    return (
        <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 80px 80px 80px 80px 1fr', gap: 12, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-muted)', paddingBottom: 6, borderBottom: '1px solid var(--hairline-soft)' }}>
                <span>Route</span>
                <span style={{ textAlign: 'right' }}>Samples</span>
                <span style={{ textAlign: 'right' }}>p50</span>
                <span style={{ textAlign: 'right' }}>p95</span>
                <span style={{ textAlign: 'right' }}>Max</span>
                <span style={{ paddingLeft: 8 }}>Recent (last 20)</span>
            </div>
            {rows.map((r) => {
                const sloLabel = r.route === '/dashboard' ? '<1000ms' : '<1500ms';
                const sparkMax = Math.max(1, ...r.recent);
                return (
                    <div key={r.route} style={{ display: 'grid', gridTemplateColumns: '1.4fr 80px 80px 80px 80px 1fr', gap: 12, alignItems: 'center', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--hairline-soft)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <code style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5 }}>{r.route}</code>
                            {r.breachesSlo && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: 'color-mix(in oklab, var(--danger), transparent 85%)', color: 'var(--danger)' }} title={`SLO ${sloLabel} breached at p95`}>SLO</span>}
                        </span>
                        <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-muted)' }}>{r.n}</span>
                        <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.p50}<span style={{ color: 'var(--ink-muted)', fontSize: 10 }}>ms</span></span>
                        <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.breachesSlo ? 'var(--danger)' : undefined }}>{r.p95}<span style={{ color: 'var(--ink-muted)', fontSize: 10 }}>ms</span></span>
                        <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-muted)' }}>{r.max}<span style={{ fontSize: 10 }}>ms</span></span>
                        <svg width="100%" height="22" viewBox="0 0 200 22" preserveAspectRatio="none" style={{ paddingLeft: 8 }} aria-hidden="true">
                            {r.recent.length > 1 && (
                                <polyline
                                    fill="none"
                                    stroke={r.breachesSlo ? 'var(--danger)' : 'var(--coach)'}
                                    strokeWidth="1.5"
                                    points={r.recent.map((v, i) => `${(i / Math.max(1, r.recent.length - 1)) * 200},${22 - (v / sparkMax) * 22}`).join(' ')}
                                />
                            )}
                        </svg>
                    </div>
                );
            })}
        </div>
    );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section style={{ background: 'var(--shell)', border: '1px solid var(--hairline-soft)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ color: 'var(--accent, var(--accent))', display: 'inline-flex' }}>{icon}</span>
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted, var(--ink-muted))' }}>{title}</h2>
            </div>
            {children}
        </section>
    );
}

function Kpis({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {children}
        </div>
    );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string | number; tone?: 'green' | 'red' | 'amber' | 'blue' | 'neutral'; icon?: React.ReactNode }) {
    const colors: Record<string, string> = {
        green: 'var(--coach)', red: 'var(--danger)', amber: 'var(--warn)', blue: 'var(--accent)', neutral: 'var(--text-primary)',
    };
    const color = colors[tone || 'neutral'];
    return (
        <div style={{
            border: '1px solid var(--border-color, var(--hairline-soft))', borderRadius: 10, padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 4, minHeight: 70,
        }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, var(--ink-faint))', textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 4 }}>
                {icon}{label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
        </div>
    );
}

function EmptyNote({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
    return (
        <div style={{
            background: ok ? 'var(--coach-soft)' : 'var(--surface)',
            color: ok ? 'var(--coach)' : 'var(--text-muted)',
            border: `1px solid ${ok ? 'var(--coach)' : 'var(--hairline-soft)'}`,
            borderRadius: 10, padding: '14px 18px', fontSize: 13, marginTop: 12,
            display: 'flex', alignItems: 'center', gap: 8,
        }}>
            {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {children}
        </div>
    );
}
