'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getActiveGoalProgressAction } from '../../src/actions/goalTrackingActions';
import type { GoalProgress } from '../../src/services/goalTrackingService';

/**
 * Goal progress headline for the dashboard. Reads the calling user's single
 * active goal (per-user scope) and renders a Hormozi-style one-line headline
 * plus a thin progress bar:
 *
 *     ⊕  GOAL  $10,000 by Jun 11
 *     $2,340 booked · 23% · 18 days left · trending $11.4K  ✅ on track
 *     [▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░]
 *     2 campaigns · 184 contacts · 11 replies · 73 sends
 *
 * Hides silently when there's no active goal — no empty-state UI, no nag.
 * The Goal Planner is the entry point for creating one.
 *
 * Failure modes (all graceful):
 *  • Migration not run → action returns progress: null → card hides.
 *  • Server action error → card hides and logs to console.
 *  • Goal exists but 0 campaigns → renders with zeros (rep should re-fire).
 */
export default function GoalProgressCard() {
    const [progress, setProgress] = useState<GoalProgress | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        getActiveGoalProgressAction()
            .then(res => {
                if (!alive) return;
                if (res.success) setProgress(res.progress);
                else console.warn('[GoalProgressCard]', res.error);
            })
            .catch(err => console.warn('[GoalProgressCard]', err))
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, []);

    if (loading || !progress) return null;

    const pct = Math.min(100, Math.round(progress.pctOfTarget * 100));
    const onTrack = progress.onTrack;
    const headlineColor = onTrack ? 'var(--coach)' : 'var(--warn)';
    const headlineBg = onTrack ? 'var(--coach-soft)' : 'var(--warn-soft)';
    const trackBarFill = onTrack ? 'var(--coach)' : 'var(--warn)';

    return (
        <div
            style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline-soft)',
                borderRadius: 14,
                padding: '16px 18px',
                marginBottom: 14,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                <span
                    style={{
                        background: headlineBg,
                        color: headlineColor,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        padding: '2px 8px',
                        borderRadius: 999,
                        textTransform: 'uppercase',
                    }}
                >
                    Goal
                </span>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                    {fmtMoney(progress.targetAmount)} by {fmtDate(progress.deadline)}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: headlineColor, fontWeight: 600 }}>
                    {onTrack ? '✓ on track' : '⚠ behind'}
                </span>
            </div>

            <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.45, marginBottom: 10 }}>
                <strong style={{ color: 'var(--ink)' }}>{fmtMoney(progress.booked)}</strong> booked
                {' · '}
                {pct}%
                {' · '}
                <strong style={{ color: 'var(--ink)' }}>{progress.daysRemaining}</strong> day{progress.daysRemaining === 1 ? '' : 's'} left
                {' · '}
                trending <strong style={{ color: 'var(--ink)' }}>{fmtMoney(progress.projected)}</strong>
            </div>

            {/* Progress bar */}
            <div
                style={{
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--surface-2)',
                    overflow: 'hidden',
                    marginBottom: 10,
                }}
            >
                <div
                    style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: trackBarFill,
                        transition: 'width .35s cubic-bezier(.16,1,.3,1)',
                    }}
                />
            </div>

            {/* Counters strip */}
            <div style={{ display: 'flex', gap: 18, fontSize: 11.5, color: 'var(--ink-muted)', flexWrap: 'wrap' }}>
                <Counter label="campaigns" value={progress.campaignsFired} />
                <Counter label="contacts" value={progress.contactsReached} />
                <Counter label="replies" value={progress.repliesIn} />
                <Counter label="sends" value={progress.sendsOut} />
                <Link
                    href="/campaigns/goal-planner"
                    style={{
                        marginLeft: 'auto',
                        fontSize: 12,
                        color: 'var(--accent)',
                        textDecoration: 'none',
                        fontWeight: 500,
                    }}
                >
                    Update goal →
                </Link>
            </div>
        </div>
    );
}

function Counter({ label, value }: { label: string; value: number }) {
    return (
        <span>
            <strong style={{ color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                {value.toLocaleString()}
            </strong>{' '}
            {label}
        </span>
    );
}

function fmtMoney(n: number): string {
    if (n >= 100_000) return '$' + (n / 1000).toFixed(0) + 'k';
    if (n >= 10_000) return '$' + (n / 1000).toFixed(1) + 'k';
    if (n >= 1_000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return '$' + n.toFixed(0);
}

function fmtDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
