'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Image as ImageIcon, Search, Check, RefreshCw } from 'lucide-react';
import {
    getIdentityFactoryAction,
    setIdentityFlagAction,
    type IdentityFactoryRow,
} from '../../src/actions/accountActions';
import { useUndoToast } from '../context/UndoToastContext';
import { LoadingText } from '../components/LoadingStates';

type Filter = 'all' | 'pending-google' | 'pending-gravatar' | 'pending-both' | 'done';

function StatusCheck({
    done,
    onChange,
    label,
}: {
    done: boolean;
    onChange: (next: boolean) => void;
    label: string;
}) {
    return (
        <label
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid var(--hairline-soft)',
                background: done ? 'color-mix(in oklab, var(--coach) 16%, transparent)' : 'var(--shell)',
                fontSize: 12,
                color: done ? 'var(--coach)' : 'var(--ink-muted)',
                fontWeight: done ? 600 : 500,
                whiteSpace: 'nowrap',
            }}
        >
            <input
                type="checkbox"
                checked={done}
                onChange={e => onChange(e.target.checked)}
                style={{ accentColor: 'var(--coach)', cursor: 'pointer' }}
                aria-label={label}
            />
            {done ? <><Check size={12} /> {label}</> : label}
        </label>
    );
}

export default function IdentityFactoryClient() {
    const { showSuccess, showError } = useUndoToast();
    const [rows, setRows] = useState<IdentityFactoryRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>('pending-both');
    const [search, setSearch] = useState('');
    const [savingId, setSavingId] = useState<string | null>(null);
    const [copyHint, setCopyHint] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        const res = await getIdentityFactoryAction();
        if (!res.success || !res.rows) {
            showError(res.error || 'Failed to load Identity Factory');
            setLoading(false);
            return;
        }
        setRows(res.rows);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const setFlag = async (id: string, flag: 'google' | 'gravatar', done: boolean) => {
        // Optimistic update.
        const prevRows = rows;
        setRows(prev => prev?.map(r => r.id === id ? {
            ...r,
            ...(flag === 'google' ? { google_registered_at: done ? new Date().toISOString() : null } : {}),
            ...(flag === 'gravatar' ? { gravatar_claimed_at: done ? new Date().toISOString() : null } : {}),
        } : r) ?? null);
        setSavingId(id);
        const res = await setIdentityFlagAction(id, flag, done);
        setSavingId(null);
        if (!res.success) {
            // Revert.
            setRows(prevRows);
            showError(res.error || 'Failed to save', { onRetry: () => setFlag(id, flag, done) });
        }
    };

    const handleTurboRegister = async (row: IdentityFactoryRow) => {
        // Open the magic Google sign-up URL in a new tab.
        window.open(row.googleSignupUrl, '_blank', 'noopener,noreferrer');
        // Don't auto-mark as done — admin clicks the checkbox after completing.
        showSuccess(`Opened Google sign-up for ${row.email}. Mark "Google ✓" once registered.`);
    };

    const handleLinkGravatar = async (row: IdentityFactoryRow) => {
        const imageUrl = row.profile_image;
        if (imageUrl) {
            try {
                await navigator.clipboard.writeText(imageUrl);
                setCopyHint(row.email);
                setTimeout(() => setCopyHint(null), 2500);
            } catch { /* clipboard may be blocked — ignore */ }
        }
        // Open Gravatar — start the connect flow with the email hint.
        const url = `https://gravatar.com/connect?email=${encodeURIComponent(row.email)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
        showSuccess(
            imageUrl
                ? `Image URL copied. Opened Gravatar for ${row.email} — paste the URL when uploading.`
                : `Opened Gravatar for ${row.email}. (No persona photo set yet — set one via Accounts → Persona first.)`
        );
    };

    const filtered = useMemo(() => {
        if (!rows) return [];
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (q && !r.email.includes(q) && !(r.display_name || '').toLowerCase().includes(q)) return false;
            const g = !!r.google_registered_at;
            const gv = !!r.gravatar_claimed_at;
            switch (filter) {
                case 'all': return true;
                case 'pending-google': return !g;
                case 'pending-gravatar': return !gv;
                case 'pending-both': return !g && !gv;
                case 'done': return g && gv;
            }
        });
    }, [rows, search, filter]);

    const stats = useMemo(() => {
        if (!rows) return { total: 0, googleDone: 0, gravatarDone: 0, bothDone: 0 };
        let g = 0, gv = 0, both = 0;
        for (const r of rows) {
            if (r.google_registered_at) g++;
            if (r.gravatar_claimed_at) gv++;
            if (r.google_registered_at && r.gravatar_claimed_at) both++;
        }
        return { total: rows.length, googleDone: g, gravatarDone: gv, bothDone: both };
    }, [rows]);

    return (
        <div style={{ height: '100%', overflow: 'auto', background: 'var(--shell)', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>
            <div style={{ padding: '22px 26px' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 18 }}>
                    <div>
                        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>Identity Factory</h2>
                        <div style={{ color: 'var(--ink-muted)', fontSize: 13, marginTop: 4 }}>
                            One-click registration of every sender address with Google and Gravatar. Track progress as you go.
                        </div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <button
                        onClick={load}
                        disabled={loading}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                        <RefreshCw size={14} /> Reload
                    </button>
                </div>

                {/* Stats strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
                    {[
                        { label: 'Total accounts', value: stats.total, sub: '' },
                        { label: 'Google registered', value: stats.googleDone, sub: stats.total ? `${Math.round(stats.googleDone / stats.total * 100)}% done` : '0%', tone: 'green' as const },
                        { label: 'Gravatar claimed', value: stats.gravatarDone, sub: stats.total ? `${Math.round(stats.gravatarDone / stats.total * 100)}% done` : '0%', tone: 'green' as const },
                        { label: 'Both complete', value: stats.bothDone, sub: stats.total ? `${Math.round(stats.bothDone / stats.total * 100)}%` : '0%', tone: 'green' as const },
                    ].map(s => (
                        <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)', borderRadius: 10, padding: '12px 14px' }}>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, color: s.tone === 'green' ? 'var(--coach)' : 'var(--ink)' }}>{s.value}</div>
                            {s.sub && <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>{s.sub}</div>}
                        </div>
                    ))}
                </div>

                {/* Filter row */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search email or name"
                            style={{ padding: '7px 10px 7px 30px', borderRadius: 8, border: '1px solid var(--hairline-soft)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12.5, width: 260, fontFamily: 'var(--font-ui)' }}
                        />
                    </div>
                    {(['pending-both', 'pending-google', 'pending-gravatar', 'done', 'all'] as const).map(k => (
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
                            {k === 'all' ? 'All' : k === 'pending-both' ? 'Pending both' : k === 'pending-google' ? 'Need Google' : k === 'pending-gravatar' ? 'Need Gravatar' : 'Done'}
                        </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                        {filtered.length} of {rows?.length ?? 0}
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-muted)' }}>
                        <LoadingText context="identity-factory" />
                    </div>
                ) : (
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                <thead>
                                    <tr style={{ background: 'var(--shell)', borderBottom: '1px solid var(--hairline-soft)' }}>
                                        <Th>Account</Th>
                                        <Th>Display name</Th>
                                        <Th>Google ID</Th>
                                        <Th>Gravatar</Th>
                                        <Th>Actions</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(row => {
                                        const googleDone = !!row.google_registered_at;
                                        const gravDone = !!row.gravatar_claimed_at;
                                        return (
                                            <tr key={row.id} style={{ borderBottom: '1px solid var(--hairline-soft)', opacity: savingId === row.id ? 0.6 : 1 }}>
                                                <Td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        {row.profile_image ? (
                                                            <img src={row.profile_image} alt="" width={28} height={28} style={{ borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--hairline-soft)', flex: '0 0 28px' }} />
                                                        ) : (
                                                            <div style={{ width: 28, height: 28, flex: '0 0 28px', borderRadius: '50%', background: 'var(--shell)', border: '1px solid var(--hairline-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--ink-muted)' }}>
                                                                {(row.email[0] || '?').toUpperCase()}
                                                            </div>
                                                        )}
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ color: 'var(--ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>
                                                                {row.email}
                                                            </div>
                                                            <div style={{ color: 'var(--ink-muted)', fontSize: 11 }}>
                                                                {row.connection_method === 'OAUTH' ? 'OAuth' : 'IMAP/SMTP'} · {row.domain}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Td>
                                                <Td>
                                                    {row.display_name ? (
                                                        <span style={{ color: 'var(--ink)' }}>{row.display_name}</span>
                                                    ) : (
                                                        <span style={{ color: 'var(--ink-muted)', fontStyle: 'italic' }}>not set</span>
                                                    )}
                                                </Td>
                                                <Td>
                                                    <StatusCheck
                                                        done={googleDone}
                                                        onChange={next => setFlag(row.id, 'google', next)}
                                                        label={googleDone ? 'Done' : 'Pending'}
                                                    />
                                                </Td>
                                                <Td>
                                                    <StatusCheck
                                                        done={gravDone}
                                                        onChange={next => setFlag(row.id, 'gravatar', next)}
                                                        label={gravDone ? 'Done' : 'Pending'}
                                                    />
                                                </Td>
                                                <Td>
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        <button
                                                            onClick={() => handleTurboRegister(row)}
                                                            className="btn btn-sm btn-secondary"
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                            title="Opens Google sign-up with this email pre-filled. Forces 'Use my current email address instead'."
                                                            disabled={googleDone}
                                                        >
                                                            <ExternalLink size={12} /> Turbo Register
                                                        </button>
                                                        <button
                                                            onClick={() => handleLinkGravatar(row)}
                                                            className="btn btn-sm btn-secondary"
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                            title="Copies the persona image URL to clipboard and opens Gravatar."
                                                            disabled={gravDone}
                                                        >
                                                            <ImageIcon size={12} />
                                                            {copyHint === row.email ? 'Copied!' : 'Link Gravatar'}
                                                        </button>
                                                    </div>
                                                </Td>
                                            </tr>
                                        );
                                    })}
                                    {filtered.length === 0 && (
                                        <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>No accounts match the current filter.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* How-to-use note */}
                <details style={{ marginTop: 18, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--hairline-soft)', borderRadius: 10, fontSize: 12.5, color: 'var(--ink-muted)' }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--ink)', fontWeight: 500, fontSize: 13 }}>How to use the Factory</summary>
                    <ol style={{ marginTop: 10, lineHeight: 1.7, paddingLeft: 18 }}>
                        <li><strong>Turbo Register</strong> opens Google&apos;s sign-up flow with the email pre-filled, forcing the &ldquo;Use my current email address instead&rdquo; option. Complete the sign-up (set name + photo to match the persona), then click the <strong>Google ✓</strong> checkbox here.</li>
                        <li><strong>Link Gravatar</strong> copies the persona image URL to your clipboard and opens Gravatar with the email hint. Sign in / sign up, add the email, paste the image URL when uploading. Then click the <strong>Gravatar ✓</strong> checkbox.</li>
                        <li>Filter to <strong>Pending both</strong> to see what&apos;s left. Once both are checked for an account, recipients on Google clients see the Google profile photo; third-party clients (Superhuman, Spark, Mimestream) see the Gravatar.</li>
                        <li>Reminder: even without Google or Gravatar, the inline HTML signature on every send already shows the photo inside the email body. The checkboxes here unlock the avatar circle on top of that.</li>
                    </ol>
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'color-mix(in oklab, var(--coach) 8%, transparent)', borderLeft: '2px solid var(--coach)', borderRadius: 4 }}>
                        First-time setup: paste <code>scripts/identity-factory-tables.sql</code> into the Supabase SQL editor to create the two tracking columns. The table won&apos;t persist toggles until that&apos;s done.
                    </div>
                </details>
            </div>
        </div>
    );
}

function Th({ children }: { children: React.ReactNode }) {
    return <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
    return <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>{children}</td>;
}
