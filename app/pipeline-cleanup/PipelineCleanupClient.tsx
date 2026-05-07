'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    previewMisclassifiedClientsAction,
    reconcileClientStatusAction,
    type MisclassifiedContact,
    type PipelineReconcilePreview,
    type PipelineReconcileApply,
} from '../../src/actions/pipelineReconcileActions';
import ContactLink from '../components/ContactLink';

const fmtMoney = (n: number) =>
    `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

type PreviewSuccess = Extract<PipelineReconcilePreview, { success: true }>;
type ApplySuccess = Extract<PipelineReconcileApply, { success: true }>;

export default function PipelineCleanupClient() {
    const [preview, setPreview] = useState<PreviewSuccess | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [applyResult, setApplyResult] = useState<ApplySuccess | null>(null);
    const [confirming, setConfirming] = useState(false);

    const refresh = async () => {
        setLoading(true);
        setError(null);
        const res = await previewMisclassifiedClientsAction();
        setLoading(false);
        if (!res.success) {
            setError(res.error);
            setPreview(null);
            return;
        }
        setPreview(res);
    };

    useEffect(() => {
        refresh();
    }, []);

    const apply = async () => {
        setApplying(true);
        setError(null);
        const res = await reconcileClientStatusAction();
        setApplying(false);
        setConfirming(false);
        if (!res.success) {
            setError(res.error);
            return;
        }
        setApplyResult(res);
        // Re-pull the preview so the screen reflects the new "0 misclassifications" state.
        refresh();
    };

    return (
        <div style={{ height: '100%', overflow: 'auto', background: 'var(--shell)', color: 'var(--ink)', fontFamily: 'var(--font-ui)' }}>
            <div style={{ padding: '22px 26px', maxWidth: 1080, margin: '0 auto' }}>
                <div style={{ marginBottom: 16 }}>
                    <Link href="/" style={{ color: 'var(--ink-muted)', fontSize: 13, textDecoration: 'none' }}>
                        ← Back to inbox
                    </Link>
                </div>
                <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
                    Pipeline cleanup
                </h1>
                <p style={{ color: 'var(--ink-muted)', fontSize: 14, margin: '0 0 24px', maxWidth: 720 }}>
                    The rule: <strong>any contact with at least one project linked to them is a paid client.</strong>
                    {' '}This screen shows contacts where the data already proves a deal closed but the
                    pipeline stage hasn&apos;t caught up. One click promotes them all to{' '}
                    <code style={{ fontSize: 12, padding: '1px 6px', background: 'var(--surface)', borderRadius: 4 }}>CLOSED</code>.
                </p>

                {loading && (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
                        Scanning projects + contacts…
                    </div>
                )}

                {error && (
                    <div style={{
                        background: 'var(--danger-soft)',
                        color: 'var(--danger)',
                        border: '1px solid var(--danger)',
                        borderRadius: 12,
                        padding: '12px 16px',
                        marginBottom: 18,
                        fontSize: 13,
                    }}>
                        {error}
                    </div>
                )}

                {applyResult && (
                    <div style={{
                        background: 'var(--coach-soft)',
                        color: 'var(--coach)',
                        border: '1px solid var(--coach)',
                        borderRadius: 12,
                        padding: '12px 16px',
                        marginBottom: 18,
                        fontSize: 13,
                    }}>
                        ✓ Promoted <strong>{applyResult.flipped.toLocaleString()}</strong> contact{applyResult.flipped === 1 ? '' : 's'} to CLOSED.
                        {applyResult.failed > 0 && ` ${applyResult.failed} failed (see server log).`}
                    </div>
                )}

                {preview && (
                    <>
                        {/* Summary tiles */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
                            <Stat label="Contacts with projects" value={preview.summary.contactsWithProjects.toLocaleString()} />
                            <Stat
                                label="Misclassified"
                                value={preview.summary.misclassifiedCount.toLocaleString()}
                                sub={preview.summary.misclassifiedCount > 0 ? 'will flip on Apply' : 'all aligned ✓'}
                            />
                            <Stat
                                label="Project value already booked"
                                value={fmtMoney(preview.summary.totalProjectValue)}
                                sub="across all linked projects"
                            />
                        </div>

                        {/* Stage breakdown chips */}
                        {Object.keys(preview.summary.byStage).length > 0 && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                                {Object.entries(preview.summary.byStage).map(([stage, count]) => (
                                    <span
                                        key={stage}
                                        style={{
                                            fontSize: 12,
                                            padding: '4px 10px',
                                            borderRadius: 999,
                                            background: 'var(--surface)',
                                            border: '1px solid var(--hairline-soft)',
                                            color: 'var(--ink-muted)',
                                        }}
                                    >
                                        {stage} → CLOSED: <strong style={{ color: 'var(--ink)' }}>{count}</strong>
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Apply CTA */}
                        {preview.summary.misclassifiedCount > 0 && (
                            <div
                                style={{
                                    background: 'var(--surface)',
                                    border: '1px solid var(--hairline-soft)',
                                    borderRadius: 12,
                                    padding: '16px 18px',
                                    marginBottom: 24,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 14,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 240 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                                        Promote {preview.summary.misclassifiedCount.toLocaleString()} contacts to CLOSED
                                    </div>
                                    <div style={{ color: 'var(--ink-muted)', fontSize: 12, marginTop: 2 }}>
                                        Sets pipeline_stage=CLOSED, is_client=true, and backfills became_client_at
                                        from the earliest linked project. Existing CLOSED rows are untouched.
                                    </div>
                                </div>
                                {!confirming ? (
                                    <button onClick={() => setConfirming(true)} style={btnPrimary}>
                                        Apply →
                                    </button>
                                ) : (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button onClick={() => setConfirming(false)} style={btnSecondary} disabled={applying}>
                                            Cancel
                                        </button>
                                        <button onClick={apply} style={btnDanger} disabled={applying}>
                                            {applying ? 'Applying…' : 'Yes, apply now'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Misclassified table */}
                        {preview.misclassified.length > 0 ? (
                            <div style={{
                                background: 'var(--surface)',
                                border: '1px solid var(--hairline-soft)',
                                borderRadius: 12,
                                overflow: 'hidden',
                            }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--hairline-soft)', background: 'var(--surface-2, var(--surface))' }}>
                                            <th style={th}>Contact</th>
                                            <th style={th}>Current stage</th>
                                            <th style={th}>Projects</th>
                                            <th style={thRight}>Total value</th>
                                            <th style={th}>Earliest project</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.misclassified.slice(0, 200).map(c => <Row key={c.id} c={c} />)}
                                    </tbody>
                                </table>
                                {preview.misclassified.length > 200 && (
                                    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--hairline-soft)', color: 'var(--ink-muted)', fontSize: 12 }}>
                                        Showing top 200 by project value · {preview.misclassified.length - 200} more will also be promoted on Apply.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-muted)', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--hairline-soft)' }}>
                                ✓ Pipeline is clean. Every contact with a project is already marked CLOSED.
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function Row({ c }: { c: MisclassifiedContact }) {
    // Match the chip palette used everywhere else in the app: CLOSED is green
    // (coach), in-flight stages are yellow (warn), and unknown is muted grey.
    const stage = c.pipeline_stage;
    const chipStyle: React.CSSProperties =
        stage === 'CLOSED'
            ? { background: 'var(--coach-soft)', color: 'var(--coach)' }
            : stage
              ? { background: 'var(--warn-soft)', color: 'var(--warn)' }
              : { background: 'var(--surface-2, var(--surface))', color: 'var(--ink-muted)' };
    return (
        <tr style={{ borderBottom: '1px solid var(--hairline-soft)' }}>
            <td style={td}>
                <ContactLink contactId={c.id} stopPropagation={false} title="Open client profile">
                    <div style={{ fontWeight: 500, textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: 2 }}>{c.name || '(no name)'}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{c.email}</div>
                </ContactLink>
            </td>
            <td style={td}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, ...chipStyle }}>
                    {stage || 'NULL'}
                </span>
            </td>
            <td style={td}>{c.project_count}</td>
            <td style={tdRight}>{fmtMoney(c.total_project_value)}</td>
            <td style={td}>
                {c.earliest_project_at
                    ? new Date(c.earliest_project_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                    : '—'}
            </td>
        </tr>
    );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{sub}</div>}
        </div>
    );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' };
const thRight: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' };
const tdRight: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const btnPrimary: React.CSSProperties = {
    background: 'var(--ink)',
    color: 'var(--canvas)',
    border: 'none',
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
};
const btnSecondary: React.CSSProperties = {
    background: 'var(--surface)',
    color: 'var(--ink-muted)',
    border: '1px solid var(--hairline)',
    padding: '10px 16px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
};
const btnDanger: React.CSSProperties = {
    background: 'var(--coach)',
    color: '#fff',
    border: 'none',
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
};
