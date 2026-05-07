'use client';

import React, { useState } from 'react';
import {
    findProjectsForContactAction,
    linkProjectToContactAction,
    type ProjectMatchCandidate,
} from '../../../src/actions/projectActions';
import { useUndoToast } from '../../context/UndoToastContext';
import { useConfirm } from '../../context/ConfirmContext';

const fmtMoney = (n: number | null) =>
    n == null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const confidenceColors: Record<ProjectMatchCandidate['confidence'], { bg: string; fg: string }> = {
    HIGH: { bg: 'var(--coach-soft)', fg: 'var(--coach)' },
    MEDIUM: { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
    LOW: { bg: 'var(--surface-2, var(--surface))', fg: 'var(--ink-muted)' },
};

type Props = {
    contact: { id: string; name: string | null };
    onLinked: () => void;
};

export default function AISuggestProjects({ contact, onLinked }: Props) {
    const { showError, showSuccess } = useUndoToast();
    const confirm = useConfirm();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [candidates, setCandidates] = useState<ProjectMatchCandidate[] | null>(null);
    const [linking, setLinking] = useState<string | null>(null);

    async function run() {
        setOpen(true);
        if (candidates) return; // already loaded once this mount; refresh on demand only
        setLoading(true);
        const res = await findProjectsForContactAction(contact.id);
        setLoading(false);
        if (!res.success) {
            showError(res.error);
            return;
        }
        setCandidates(res.candidates);
    }

    async function refresh() {
        setLoading(true);
        setCandidates(null);
        const res = await findProjectsForContactAction(contact.id);
        setLoading(false);
        if (!res.success) {
            showError(res.error);
            return;
        }
        setCandidates(res.candidates);
    }

    async function handleLink(c: ProjectMatchCandidate) {
        if (linking) return;
        if (c.currentClient) {
            const ok = await confirm({
                title: 'Reassign this project?',
                message:
                    `"${c.project.project_name || 'this project'}" is currently linked to ` +
                    `${c.currentClient.name || c.currentClient.email || 'another contact'}. ` +
                    `Reassigning will move the revenue to ${contact.name || 'this contact'}.`,
                confirmLabel: 'Reassign',
                danger: true,
            });
            if (!ok) return;
        }
        setLinking(c.project.id);
        const res = await linkProjectToContactAction(c.project.id, contact.id);
        setLinking(null);
        if (!res.success) {
            showError(res.error || 'Failed to link project.');
            return;
        }
        showSuccess(`Linked "${c.project.project_name || 'project'}"`);
        // Drop this candidate from the list (or close panel if it was the last one).
        setCandidates(prev => (prev || []).filter(x => x.project.id !== c.project.id));
        onLinked();
    }

    if (!open) {
        return (
            <button onClick={run} style={triggerBtn}>
                ✨ AI find projects
            </button>
        );
    }

    return (
        <div style={panel}>
            <div style={panelHeader}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                    AI-suggested projects for {contact.name || 'this contact'}
                </span>
                <div style={{ flex: 1 }} />
                <button onClick={refresh} style={ghostBtn} disabled={loading}>↻ Re-run</button>
                <button onClick={() => setOpen(false)} style={ghostBtn}>Hide</button>
            </div>
            {loading && <div style={muted}>Scanning {/* projects… */}…</div>}
            {!loading && candidates && candidates.length === 0 && (
                <div style={muted}>
                    No matching projects found. Use <strong>Link existing project</strong> to search manually.
                </div>
            )}
            {!loading && candidates && candidates.map(c => {
                const cConf = confidenceColors[c.confidence];
                return (
                    <div key={c.project.id} style={row}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {c.project.project_name || '(no name)'}
                                </span>
                                <span
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        padding: '2px 8px',
                                        borderRadius: 999,
                                        background: cConf.bg,
                                        color: cConf.fg,
                                    }}
                                >
                                    {c.confidence} · {Math.round(c.score * 100)}%
                                </span>
                                {c.currentClient && (
                                    <span style={chipReassign} title={c.currentClient.email || ''}>
                                        currently {c.currentClient.name || c.currentClient.email}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{c.evidence}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>
                                {fmtMoney(c.project.project_value)} · {c.project.paid_status || 'UNPAID'}
                                {c.project.created_at && ` · ${new Date(c.project.created_at).toLocaleDateString()}`}
                            </div>
                        </div>
                        <button
                            disabled={linking === c.project.id}
                            onClick={() => handleLink(c)}
                            style={c.currentClient ? btnDanger : btnPrimary}
                        >
                            {linking === c.project.id ? '…' : c.currentClient ? 'Reassign' : 'Link'}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const triggerBtn: React.CSSProperties = {
    background: 'var(--surface)',
    color: 'var(--ink)',
    border: '1px solid var(--hairline)',
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
};
const panel: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--hairline-soft)',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
};
const panelHeader: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderBottom: '1px solid var(--hairline-soft)',
    background: 'var(--surface-2, var(--surface))',
};
const ghostBtn: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'var(--ink-muted)',
    fontSize: 11,
    cursor: 'pointer',
    padding: '4px 8px',
    fontFamily: 'inherit',
};
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--ink-muted)', padding: 16, textAlign: 'center' };
const row: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    borderBottom: '1px solid var(--hairline-soft)',
};
const chipReassign: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--warn-soft)',
    color: 'var(--warn)',
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
