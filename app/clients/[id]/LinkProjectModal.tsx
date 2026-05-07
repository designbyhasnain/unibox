'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
    searchProjectsAction,
    linkProjectToContactAction,
    type ProjectSearchHit,
} from '../../../src/actions/projectActions';
import { useUndoToast } from '../../context/UndoToastContext';
import { useConfirm } from '../../context/ConfirmContext';

const fmtMoney = (n: number | null) =>
    n == null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

type Props = {
    contact: { id: string; name: string | null; email: string | null };
    onClose: () => void;
    onLinked: () => void;
};

export default function LinkProjectModal({ contact, onClose, onLinked }: Props) {
    const { showError, showSuccess } = useUndoToast();
    const confirm = useConfirm();
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Pre-populate with the contact's name (most useful starting query).
    const [query, setQuery] = useState((contact.name || contact.email || '').trim());
    const [results, setResults] = useState<ProjectSearchHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [linking, setLinking] = useState<string | null>(null);

    // Auto-run the initial query, debounce subsequent typing.
    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
        runSearch(query);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => runSearch(query), 250);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    async function runSearch(q: string) {
        if (q.trim().length < 2) {
            setResults([]);
            return;
        }
        setSearching(true);
        const res = await searchProjectsAction(q);
        setSearching(false);
        if (!res.success) {
            showError(res.error);
            setResults([]);
            return;
        }
        setResults(res.results);
    }

    async function handleLink(p: ProjectSearchHit) {
        if (linking) return;
        // Reassignment confirm — only when the project is currently linked
        // to a different contact.
        if (p.currentClient && p.currentClient.id !== contact.id) {
            const ok = await confirm({
                title: 'Reassign this project?',
                message:
                    `"${p.project_name || 'this project'}" is currently linked to ` +
                    `${p.currentClient.name || p.currentClient.email || 'another contact'}. ` +
                    `Reassigning will move the revenue from there to ${contact.name || 'this contact'}.`,
                confirmLabel: 'Reassign',
                danger: true,
            });
            if (!ok) return;
        }
        setLinking(p.id);
        const res = await linkProjectToContactAction(p.id, contact.id);
        setLinking(null);
        if (!res.success) {
            showError(res.error || 'Failed to link project.');
            return;
        }
        showSuccess(`Linked "${p.project_name || 'project'}" to ${contact.name || 'this contact'}`);
        onLinked();
        onClose();
    }

    return (
        <div style={overlay} onClick={onClose}>
            <div style={modal} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
                        Link existing project to {contact.name || contact.email}
                    </h2>
                    <button onClick={onClose} aria-label="Close" style={closeBtn}>
                        ✕
                    </button>
                </div>
                <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search project name, brief, or reference"
                    style={input}
                />
                <div style={{ marginTop: 12, maxHeight: 360, overflow: 'auto' }}>
                    {searching && results.length === 0 && (
                        <div style={muted}>Searching…</div>
                    )}
                    {!searching && results.length === 0 && (
                        <div style={muted}>
                            {query.trim().length < 2 ? 'Type at least 2 characters.' : 'No matching projects.'}
                        </div>
                    )}
                    {results.map(p => (
                        <div key={p.id} style={row}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {p.project_name || '(no name)'}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--ink-muted)', display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                                    <span>{fmtMoney(p.project_value)}</span>
                                    <span>·</span>
                                    <span>{p.paid_status || 'UNPAID'}</span>
                                    {p.created_at && (
                                        <>
                                            <span>·</span>
                                            <span>{new Date(p.created_at).toLocaleDateString()}</span>
                                        </>
                                    )}
                                    {p.currentClient && (
                                        <span style={chipReassign} title={p.currentClient.email || ''}>
                                            currently {p.currentClient.name || p.currentClient.email}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                disabled={linking === p.id}
                                onClick={() => handleLink(p)}
                                style={p.currentClient ? btnDanger : btnPrimary}
                            >
                                {linking === p.id ? '…' : p.currentClient ? 'Reassign' : 'Link'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 80,
    zIndex: 1000,
};
const modal: React.CSSProperties = {
    background: 'var(--bg-surface, var(--shell))',
    color: 'var(--ink)',
    border: '1px solid var(--hairline-soft)',
    borderRadius: 14,
    padding: 20,
    width: 'min(560px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 120px)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
    fontFamily: 'var(--font-ui)',
};
const closeBtn: React.CSSProperties = {
    marginLeft: 'auto',
    background: 'transparent',
    border: 'none',
    color: 'var(--ink-muted)',
    cursor: 'pointer',
    fontSize: 16,
};
const input: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--hairline)',
    background: 'var(--bg-surface, var(--shell))',
    color: 'var(--ink)',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
};
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--ink-muted)', padding: 16, textAlign: 'center' };
const row: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderBottom: '1px solid var(--hairline-soft)',
};
const chipReassign: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--warn-soft)',
    color: 'var(--warn)',
    marginLeft: 4,
};
const btnPrimary: React.CSSProperties = {
    background: 'var(--ink)',
    color: 'var(--canvas)',
    border: 'none',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
};
const btnDanger: React.CSSProperties = {
    background: 'var(--danger)',
    color: '#fff',
    border: 'none',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
};
