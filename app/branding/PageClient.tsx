'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, AlertTriangle, ExternalLink, RefreshCw, UserSquare2, Image as ImageIcon, Search } from 'lucide-react';
import {
    getBrandingDashboardAction,
    checkAllDomainsAction,
    checkDomainDNSAction,
    checkGravatarsAction,
    type BrandingRow,
    type DnsHealthResult,
    type DnsCheckStatus,
} from '../../src/actions/brandingActions';
import ManagePersonaModal, { type PersonaTarget } from '../components/ManagePersonaModal';
import { useUndoToast } from '../context/UndoToastContext';
import { LoadingText } from '../components/LoadingStates';

type DnsMap = Record<string, DnsHealthResult>;
type GravatarMap = Record<string, boolean>;

function StatusPill({ status, label, title }: { status: DnsCheckStatus; label: string; title?: string }) {
    const map: Record<DnsCheckStatus, string> = {
        pass: 'badge-green',
        fail: 'badge-red',
        unknown: 'badge-gray',
    };
    return <span className={`badge badge-sm ${map[status]}`} title={title}>{label}</span>;
}

function OverallBadge({ status }: { status: DnsCheckStatus }) {
    if (status === 'pass') return <span className="badge badge-green" title="SPF + DKIM + DMARC all valid — Gmail will trust this domain">✓ Trusted</span>;
    if (status === 'fail') return <span className="badge badge-red" title="One or more DNS records missing — Gmail may not show your photo">⚠ Untrusted</span>;
    return <span className="badge badge-gray" title="DNS check pending or inconclusive">… Checking</span>;
}

function GoogleIdentityBadge({ row, gravatarExists }: { row: BrandingRow; gravatarExists: boolean | null }) {
    // Honest signal: Gmail will show your photo only if (a) Gravatar exists for the
    // address, OR (b) you've registered a Google account for it. We can detect (a)
    // for sure; (b) is a heuristic — OAuth-connected accounts are by definition
    // already Google accounts.
    if (row.connection_method === 'OAUTH') {
        return <span className="badge badge-green" title="Connected via Google OAuth — has a Google profile">Google linked</span>;
    }
    if (gravatarExists === true) {
        return <span className="badge badge-green" title="Gravatar profile found for this address — photo will appear in most clients">Gravatar ✓</span>;
    }
    if (gravatarExists === false) {
        return <span className="badge badge-orange" title="No Google account or Gravatar — recipient inboxes show only initials">No identity</span>;
    }
    return <span className="badge badge-gray">…</span>;
}

function GravatarStatusBadge({ exists }: { exists: boolean | null }) {
    if (exists === true) return <span className="badge badge-sm badge-green" title="Gravatar found — photo will appear in Gmail/Outlook web for this address">✓ Yes</span>;
    if (exists === false) return <span className="badge badge-sm badge-gray" title="No Gravatar registered for this email">— None</span>;
    return <span className="badge badge-sm badge-gray">…</span>;
}

export default function BrandingPage() {
    const { showError, showSuccess } = useUndoToast();
    const [rows, setRows] = useState<BrandingRow[] | null>(null);
    const [dnsMap, setDnsMap] = useState<DnsMap>({});
    const [gravatarMap, setGravatarMap] = useState<GravatarMap>({});
    const [loading, setLoading] = useState(true);
    const [dnsLoading, setDnsLoading] = useState(false);
    const [gravLoading, setGravLoading] = useState(false);
    const [filter, setFilter] = useState<'all' | 'trusted' | 'untrusted' | 'no-identity'>('all');
    const [search, setSearch] = useState('');
    const [recheckingDomain, setRecheckingDomain] = useState<string | null>(null);
    const [personaTarget, setPersonaTarget] = useState<PersonaTarget | null>(null);

    const loadAll = async () => {
        setLoading(true);
        const res = await getBrandingDashboardAction();
        if (!res.success || !res.rows) {
            showError(res.error || 'Failed to load accounts');
            setLoading(false);
            return;
        }
        setRows(res.rows);
        setLoading(false);

        // Kick off DNS + Gravatar checks in parallel — these can take a few seconds.
        runDnsChecks(res.rows);
        runGravatarChecks(res.rows);
    };

    const runDnsChecks = async (rs: BrandingRow[]) => {
        setDnsLoading(true);
        const domains = Array.from(new Set(rs.map(r => r.domain).filter(Boolean)));
        const res = await checkAllDomainsAction(domains);
        if (res.success && res.results) {
            setDnsMap(prev => ({ ...prev, ...res.results }));
        }
        setDnsLoading(false);
    };

    const runGravatarChecks = async (rs: BrandingRow[]) => {
        setGravLoading(true);
        const hashes = rs.map(r => r.gravatar_hash);
        const res = await checkGravatarsAction(hashes);
        if (res.success && res.results) {
            setGravatarMap(prev => ({ ...prev, ...res.results }));
        }
        setGravLoading(false);
    };

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

    useEffect(() => {
        loadAll();
        // No polling — this is a tool, not a live dashboard. User clicks Re-scan.
    }, []);

    // ── Aggregate metrics for the header cards ──────────────────────────
    const stats = useMemo(() => {
        if (!rows) return { total: 0, trusted: 0, untrusted: 0, withGravatar: 0, oauth: 0, fullyVisible: 0 };
        let trusted = 0, untrusted = 0, withGravatar = 0, oauth = 0, fullyVisible = 0;
        for (const r of rows) {
            const dns = dnsMap[r.domain];
            const gv = gravatarMap[r.gravatar_hash];
            if (r.connection_method === 'OAUTH') oauth++;
            if (gv === true) withGravatar++;
            if (dns?.overall === 'pass') trusted++;
            else if (dns?.overall === 'fail') untrusted++;
            // "Fully visible" = trusted DNS AND (OAuth OR Gravatar)
            if (dns?.overall === 'pass' && (r.connection_method === 'OAUTH' || gv === true)) {
                fullyVisible++;
            }
        }
        return { total: rows.length, trusted, untrusted, withGravatar, oauth, fullyVisible };
    }, [rows, dnsMap, gravatarMap]);

    const filtered = useMemo(() => {
        if (!rows) return [];
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (q && !r.email.includes(q) && !(r.display_name || '').toLowerCase().includes(q)) return false;
            if (filter === 'all') return true;
            const dns = dnsMap[r.domain];
            const gv = gravatarMap[r.gravatar_hash];
            if (filter === 'trusted') return dns?.overall === 'pass';
            if (filter === 'untrusted') return dns?.overall === 'fail';
            if (filter === 'no-identity') return r.connection_method !== 'OAUTH' && gv !== true;
            return true;
        });
    }, [rows, search, filter, dnsMap, gravatarMap]);

    const handlePersonaApplied = () => {
        setPersonaTarget(null);
        loadAll();
    };

    return (
        <div style={{ height: '100%', overflow: 'auto', background: 'var(--shell)', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>
            <div style={{ padding: '22px 26px' }}>
                {/* ── Header ─────────────────────────────────────────────── */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 18 }}>
                    <div>
                        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>Branding & Deliverability</h2>
                        <div style={{ color: 'var(--ink-muted)', fontSize: 13, marginTop: 4 }}>
                            DNS health, Google identity, and Gravatar status across all sender accounts. Goal: 100% avatar visibility.
                        </div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <button
                        onClick={() => rows && Promise.all([runDnsChecks(rows), runGravatarChecks(rows)])}
                        disabled={dnsLoading || gravLoading || !rows}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)', background: 'none', border: '1px solid var(--hairline-soft)', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
                    >
                        <RefreshCw size={14} />
                        {(dnsLoading || gravLoading) ? 'Re-scanning…' : 'Re-scan all'}
                    </button>
                </div>

                {/* ── Stats strip ────────────────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
                    {[
                        { label: 'Total accounts', value: stats.total, sub: '' },
                        { label: 'Fully visible', value: stats.fullyVisible, sub: stats.total ? `${Math.round(stats.fullyVisible / stats.total * 100)}%` : '0%', tone: 'green' as const },
                        { label: 'DNS trusted', value: stats.trusted, sub: stats.total ? `${Math.round(stats.trusted / stats.total * 100)}%` : '0%' },
                        { label: 'DNS untrusted', value: stats.untrusted, sub: stats.untrusted > 0 ? 'needs SPF/DKIM/DMARC' : '', tone: stats.untrusted > 0 ? 'red' as const : undefined },
                        { label: 'Gravatar set', value: stats.withGravatar, sub: '' },
                        { label: 'Google linked', value: stats.oauth, sub: 'OAuth' },
                    ].map((s) => (
                        <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)', borderRadius: 10, padding: '12px 14px' }}>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, color: s.tone === 'green' ? 'var(--coach)' : s.tone === 'red' ? 'var(--negative)' : 'var(--ink)' }}>{s.value}</div>
                            {s.sub && <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>{s.sub}</div>}
                        </div>
                    ))}
                </div>

                {/* ── Filter / search row ────────────────────────────────── */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search email or name"
                            style={{ padding: '7px 10px 7px 30px', borderRadius: 8, border: '1px solid var(--hairline-soft)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12.5, width: 240, fontFamily: 'var(--font-ui)' }}
                        />
                    </div>
                    {(['all', 'trusted', 'untrusted', 'no-identity'] as const).map(k => (
                        <button
                            key={k}
                            onClick={() => setFilter(k)}
                            style={{
                                padding: '6px 11px',
                                borderRadius: 8,
                                fontSize: 12.5,
                                fontWeight: 500,
                                background: filter === k ? 'var(--ink)' : 'none',
                                color: filter === k ? 'var(--shell)' : 'var(--ink-2)',
                                border: filter === k ? '1px solid var(--ink)' : '1px solid var(--hairline-soft)',
                                cursor: 'pointer',
                                fontFamily: 'var(--font-ui)',
                            }}
                        >
                            {k === 'all' ? 'All' : k === 'trusted' ? '✓ Trusted' : k === 'untrusted' ? '⚠ Untrusted' : 'No identity'}
                        </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                        {filtered.length} of {rows?.length ?? 0}
                    </div>
                </div>

                {/* ── Table ──────────────────────────────────────────────── */}
                {loading ? (
                    <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-muted)' }}>
                        <LoadingText context="branding-dashboard" />
                    </div>
                ) : (
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                <thead>
                                    <tr style={{ background: 'var(--shell)', borderBottom: '1px solid var(--hairline-soft)' }}>
                                        <Th>Email</Th>
                                        <Th>Display name</Th>
                                        <Th title="SPF, DKIM, DMARC validity for the sender domain">DNS health</Th>
                                        <Th>SPF</Th>
                                        <Th>DKIM</Th>
                                        <Th>DMARC</Th>
                                        <Th>Google identity</Th>
                                        <Th>Gravatar</Th>
                                        <Th>Actions</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(row => {
                                        const dns = dnsMap[row.domain];
                                        const gv = gravatarMap[row.gravatar_hash];
                                        return (
                                            <tr key={row.id} style={{ borderBottom: '1px solid var(--hairline-soft)' }}>
                                                {/* Email + tiny avatar preview */}
                                                <Td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        {row.profile_image ? (
                                                            <img src={row.profile_image} alt="" width={22} height={22} style={{ borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--hairline-soft)' }} />
                                                        ) : gv ? (
                                                            <img src={`https://gravatar.com/avatar/${row.gravatar_hash}?s=44&d=mp`} alt="" width={22} height={22} style={{ borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--hairline-soft)' }} />
                                                        ) : (
                                                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--shell)', border: '1px solid var(--hairline-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--ink-muted)' }}>
                                                                {(row.email[0] || '?').toUpperCase()}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div style={{ color: 'var(--ink)', fontWeight: 500 }}>{row.email}</div>
                                                            <div style={{ color: 'var(--ink-muted)', fontSize: 11 }}>
                                                                {row.connection_method === 'OAUTH' ? 'OAuth' : 'IMAP/SMTP'}
                                                                {row.isFreeMail && <span title="Provider-managed domain (gmail/outlook/yahoo) — DNS is set by the provider"> · provider-managed</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Td>
                                                <Td>
                                                    {row.display_name ? (
                                                        <span style={{ color: 'var(--ink)' }}>{row.display_name}</span>
                                                    ) : (
                                                        <span style={{ color: 'var(--ink-muted)', fontStyle: 'italic' }}>—</span>
                                                    )}
                                                </Td>
                                                <Td>
                                                    {dns ? <OverallBadge status={dns.overall} /> : <span style={{ color: 'var(--ink-muted)' }}>…</span>}
                                                </Td>
                                                <Td>{dns ? <StatusPill status={dns.spf.status} label="SPF" title={dns.spf.record || dns.spf.note || ''} /> : <span>·</span>}</Td>
                                                <Td>{dns ? <StatusPill status={dns.dkim.status} label="DKIM" title={dns.dkim.record || dns.dkim.note || ''} /> : <span>·</span>}</Td>
                                                <Td>{dns ? <StatusPill status={dns.dmarc.status} label={dns.dmarc.policy ? `DMARC: ${dns.dmarc.policy}` : 'DMARC'} title={dns.dmarc.record || dns.dmarc.note || ''} /> : <span>·</span>}</Td>
                                                <Td><GoogleIdentityBadge row={row} gravatarExists={gv ?? null} /></Td>
                                                <Td><GravatarStatusBadge exists={gv ?? null} /></Td>
                                                <Td>
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        {row.connection_method !== 'OAUTH' && (
                                                            <a
                                                                href={row.googleSignupUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                title="Open Google sign-up with this email pre-filled (forces 'Use my current email' flow)"
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--ink-2)', background: 'var(--shell)', border: '1px solid var(--hairline-soft)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                                                            >
                                                                <ExternalLink size={11} /> Register w/ Google
                                                            </a>
                                                        )}
                                                        <a
                                                            href={`https://en.gravatar.com/connect/?email=${encodeURIComponent(row.email)}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title="Create or claim a Gravatar profile for this address"
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--ink-2)', background: 'var(--shell)', border: '1px solid var(--hairline-soft)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                                                        >
                                                            <ImageIcon size={11} /> Gravatar
                                                        </a>
                                                        <button
                                                            onClick={() => setPersonaTarget({ id: row.id, email: row.email, displayName: row.display_name, profileImage: row.profile_image })}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--ink-2)', background: 'var(--shell)', border: '1px solid var(--hairline-soft)', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
                                                            title="Edit display name + profile photo"
                                                        >
                                                            <UserSquare2 size={11} /> Persona
                                                        </button>
                                                        {!row.isFreeMail && (
                                                            <button
                                                                onClick={() => recheckDomain(row.domain)}
                                                                disabled={recheckingDomain === row.domain}
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--ink-2)', background: 'var(--shell)', border: '1px solid var(--hairline-soft)', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
                                                                title={`Re-check DNS for ${row.domain}`}
                                                            >
                                                                <RefreshCw size={11} /> {recheckingDomain === row.domain ? '…' : 'Re-check'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </Td>
                                            </tr>
                                        );
                                    })}
                                    {filtered.length === 0 && (
                                        <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>No accounts match the current filter.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── Footnote: what each badge means ──────────────────── */}
                <div style={{ marginTop: 18, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--hairline-soft)', borderRadius: 10, fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink)', marginBottom: 6, fontWeight: 600, fontSize: 12.5 }}>
                        <ShieldCheck size={14} /> What unlocks the Gmail avatar circle
                    </div>
                    <div>
                        <strong>1. DNS trusted (SPF + DKIM + DMARC pass)</strong> — Gmail will not show a sender photo for untrusted domains. Fix DNS first.
                    </div>
                    <div>
                        <strong>2. Google identity</strong> — either a Google Workspace account on the domain, OR a free Google account registered for the address (use the <em>Register w/ Google</em> link). Recipients on Gmail will see whatever profile photo is on that Google account.
                    </div>
                    <div>
                        <strong>3. Gravatar</strong> — Apple Mail, Outlook web, and a long tail of clients use Gravatar. It&apos;s a 5-minute setup per address and covers the gap when (2) isn&apos;t done.
                    </div>
                    <div style={{ marginTop: 6, color: 'var(--ink-muted)' }}>
                        <AlertTriangle size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Gmail&apos;s BIMI program (forced avatar circle) requires a $1500/yr VMC certificate — out of scope for this tool. Schema.org JSON-LD metadata is auto-injected into every send (see <code>src/utils/identitySchema.ts</code>) so Apple/Outlook can read it without enrollment.
                    </div>
                </div>
            </div>

            {personaTarget && (
                <ManagePersonaModal
                    target={personaTarget}
                    onClose={() => setPersonaTarget(null)}
                    onApplied={handlePersonaApplied}
                />
            )}
        </div>
    );
}

// ── Tiny table primitives ───────────────────────────────────────────────
function Th({ children, title }: { children: React.ReactNode; title?: string }) {
    return (
        <th title={title} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
            {children}
        </th>
    );
}
function Td({ children }: { children: React.ReactNode }) {
    return <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>{children}</td>;
}
