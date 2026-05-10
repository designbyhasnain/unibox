'use client';

import React, { useState, useEffect } from 'react';
import {
    coachClientAction,
    applyCoachStageAction,
} from '../../../src/actions/clientCoachActions';
import type { ClientCoachOutput } from '../../../src/services/clientCoachService';
import { useUndoToast } from '../../context/UndoToastContext';

type Coach = ClientCoachOutput;

const stageLabels: Record<string, string> = {
    COLD_LEAD: 'Cold',
    CONTACTED: 'Contacted',
    WARM_LEAD: 'Warm',
    LEAD: 'Lead',
    OFFER_ACCEPTED: 'Offer accepted',
    CLOSED: 'Closed',
    NOT_INTERESTED: 'Not interested',
};

const stageColors: Record<string, { bg: string; fg: string }> = {
    CLOSED: { bg: 'var(--coach-soft)', fg: 'var(--coach)' },
    OFFER_ACCEPTED: { bg: 'var(--coach-soft)', fg: 'var(--coach)' },
    LEAD: { bg: 'var(--accent-soft, var(--surface-2))', fg: 'var(--accent)' },
    WARM_LEAD: { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
    CONTACTED: { bg: 'var(--surface-2, var(--surface))', fg: 'var(--ink-muted)' },
    COLD_LEAD: { bg: 'var(--info-soft, var(--surface-2))', fg: 'var(--info, var(--ink-muted))' },
    NOT_INTERESTED: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
};

const intentLabel: Record<string, string> = {
    WEDDING_PROSPECT: 'Wedding prospect',
    PAID_CLIENT_ACTIVE: 'Paid client',
    EDITOR_RECRUITER_INBOUND: 'Editor recruiting (we approached them)',
    PEER_NETWORKING: 'Peer / fellow filmmaker',
    VENDOR_OR_TOOL_PITCH: 'Vendor pitching us',
    AUTOMATED_NOTIFICATION: 'Automated notification',
    SPAM_OR_NOT_INTERESTED: 'Spam / not interested',
    UNCLEAR: 'Intent unclear',
};

const actionLabel: Record<string, string> = {
    SEND_REPLY: 'Reply now',
    SEND_FOLLOWUP: 'Send follow-up',
    SCHEDULE_CALL: 'Schedule a call',
    SEND_QUOTE: 'Send a quote',
    SEND_DELIVERABLE: 'Ship the deliverable',
    WAIT_AND_REMIND_LATER: 'Wait, remind later',
    STOP_OUTREACH: 'Stop outreach',
    NO_ACTION_NEEDED: 'No action needed',
};

type Props = {
    contactId: string;
    currentStage: string | null;
    onStageApplied: () => void;
};

export default function CoachPanel({ contactId, currentStage, onStageApplied }: Props) {
    const { showError, showSuccess } = useUndoToast();
    // Auto-load on mount. The action reads cached coach_next_action +
    // inferred_stage rows from contact_insights when both are <24h old —
    // ~10ms DB read for the 99% case, only falls back to a Groq call on
    // miss. No reason to gate behind a click anymore.
    const [loading, setLoading] = useState(true);
    const [coach, setCoach] = useState<Coach | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [applying, setApplying] = useState(false);
    const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        coachClientAction(contactId).then(res => {
            if (cancelled) return;
            setLoading(false);
            if (!res.success) {
                setLoadError(res.error || 'Coach unavailable');
                return;
            }
            setCoach(res.coach);
        });
        return () => { cancelled = true; };
    }, [contactId]);

    async function refresh() {
        setLoading(true);
        setCoach(null);
        setLoadError(null);
        const res = await coachClientAction(contactId);
        setLoading(false);
        if (!res.success) {
            setLoadError(res.error || 'Coach unavailable');
            showError(res.error);
            return;
        }
        setCoach(res.coach);
    }

    async function applyStage() {
        if (!coach) return;
        setApplying(true);
        const res = await applyCoachStageAction({
            contactId,
            stage: coach.inferred_stage,
            reason: coach.inferred_stage_reason,
        });
        setApplying(false);
        if (!res.success) {
            showError(res.error);
            return;
        }
        showSuccess(`Stage updated → ${stageLabels[coach.inferred_stage] || coach.inferred_stage}`);
        onStageApplied();
    }

    function copyMessage() {
        if (!coach?.next_action.message_to_send) return;
        navigator.clipboard.writeText(coach.next_action.message_to_send).then(() => {
            setCopyState('copied');
            setTimeout(() => setCopyState('idle'), 1800);
        });
    }

    return (
        <div style={panel}>
            <div style={panelHeader}>
                <span style={{ fontWeight: 600, fontSize: 12 }}>✨ AI sales coach</span>
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink-muted)' }}>
                    Reads the thread, contacts table, projects, insights — tells you what to do.
                </span>
                <div style={{ flex: 1 }} />
                <button onClick={refresh} style={ghostBtn} disabled={loading} title="Re-run with the latest thread">↻ Re-run</button>
            </div>
            {loading && <div style={muted}>Reading the thread…</div>}
            {!loading && loadError && !coach && (
                <div style={{ ...muted, color: 'var(--danger)' }}>
                    {loadError} · <button onClick={refresh} style={{ ...ghostBtn, color: 'var(--accent)' }}>Retry</button>
                </div>
            )}
            {!loading && coach && (
                <div style={{ padding: 14, display: 'grid', gap: 14 }}>
                    {/* SITUATION */}
                    <div>
                        <div style={sectionTitle}>Situation</div>
                        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{coach.situation}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                            <span style={pill}>{intentLabel[coach.intent] || coach.intent}</span>
                            {coach.blockers.map((b, i) => (
                                <span key={i} style={{ ...pill, background: 'var(--warn-soft)', color: 'var(--warn)' }}>blocker: {b}</span>
                            ))}
                        </div>
                    </div>

                    {/* STAGE INFERENCE */}
                    <div>
                        <div style={sectionTitle}>Pipeline stage</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Currently:</span>
                            <Chip label={stageLabels[currentStage || ''] || currentStage || 'Unknown'} colors={stageColors[currentStage || ''] || stageColors.CONTACTED} />
                            <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>→ Coach says:</span>
                            <Chip label={stageLabels[coach.inferred_stage] || coach.inferred_stage} colors={stageColors[coach.inferred_stage] || stageColors.CONTACTED} />
                            <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                                ({Math.round(coach.inferred_stage_confidence * 100)}% confidence)
                            </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{coach.inferred_stage_reason}</div>
                        {coach.inferred_stage !== currentStage && (
                            <button
                                onClick={applyStage}
                                disabled={applying}
                                style={{ ...btnPrimary, marginTop: 10 }}
                            >
                                {applying
                                    ? 'Applying…'
                                    : `Apply stage → ${stageLabels[coach.inferred_stage] || coach.inferred_stage}`}
                            </button>
                        )}
                    </div>

                    {/* NEXT ACTION */}
                    <div>
                        <div style={sectionTitle}>Next action</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ ...pill, background: 'var(--accent-soft, var(--surface-2))', color: 'var(--accent)' }}>
                                {actionLabel[coach.next_action.type] || coach.next_action.type}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>· {coach.next_action.timing}</span>
                            {coach.next_action.anchor_price_usd != null && (
                                <span style={{ ...pill, background: 'var(--coach-soft)', color: 'var(--coach)' }}>
                                    anchor ${coach.next_action.anchor_price_usd.toLocaleString()}
                                </span>
                            )}
                        </div>
                        {coach.next_action.message_to_send && (
                            <div style={{ marginTop: 10 }}>
                                <div
                                    style={{
                                        background: 'var(--surface-2, var(--surface))',
                                        border: '1px solid var(--hairline-soft)',
                                        borderRadius: 8,
                                        padding: '12px 14px',
                                        fontSize: 13,
                                        whiteSpace: 'pre-wrap',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {coach.next_action.message_to_send}
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                    <button onClick={copyMessage} style={btnSecondary}>
                                        {copyState === 'copied' ? '✓ Copied' : 'Copy draft'}
                                    </button>
                                </div>
                            </div>
                        )}
                        {coach.next_action.notes && (
                            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 8, fontStyle: 'italic' }}>
                                {coach.next_action.notes}
                            </div>
                        )}
                    </div>

                    {/* RED FLAGS */}
                    {coach.red_flags.length > 0 && (
                        <div>
                            <div style={sectionTitle}>Data red flags</div>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--ink-muted)' }}>
                                {coach.red_flags.map((r, i) => <li key={i} style={{ marginBottom: 2 }}>{r}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function Chip({ label, colors }: { label: string; colors: { bg: string; fg: string } }) {
    return (
        <span style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 999,
            background: colors.bg,
            color: colors.fg,
        }}>
            {label}
        </span>
    );
}

const panel: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--hairline-soft)',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
};
const panelHeader: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderBottom: '1px solid var(--hairline-soft)',
    background: 'var(--surface-2, var(--surface))',
    fontFamily: 'inherit',
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
const muted: React.CSSProperties = { fontSize: 13, color: 'var(--ink-muted)', padding: 18, textAlign: 'center' };
const sectionTitle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--ink-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 6,
};
const pill: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--surface-2, var(--surface))',
    color: 'var(--ink-muted)',
};
const btnPrimary: React.CSSProperties = {
    background: 'var(--ink)',
    color: 'var(--canvas)',
    border: 'none',
    padding: '7px 14px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
};
const btnSecondary: React.CSSProperties = {
    background: 'var(--surface)',
    color: 'var(--ink-muted)',
    border: '1px solid var(--hairline)',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
};
