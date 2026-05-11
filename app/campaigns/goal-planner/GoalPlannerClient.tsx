'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    generateGoalPlanAction,
    fireGoalPlanAction,
    type FireResult,
    type FireSummary,
} from '../../../src/actions/goalPlannerActions';
import type { GoalPlan, Scenario } from '../../../src/services/goalPlannerService';
import SourceLeadsModal from './SourceLeadsModal';

// Default deadline: 30 days from today, ISO yyyy-mm-dd for <input type="date">.
function defaultDeadline(): string {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
}

const fmtMoney = (n: number) =>
    `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const confidenceColor: Record<Scenario['confidence'], string> = {
    HIGH: 'var(--coach)',
    MEDIUM: 'var(--warn)',
    LOW: 'var(--ink-muted)',
};

const confidenceBg: Record<Scenario['confidence'], string> = {
    HIGH: 'var(--coach-soft)',
    MEDIUM: 'var(--warn-soft)',
    LOW: 'var(--surface-2)',
};

const kindLabel: Record<Scenario['kind'], string> = {
    REGION_TOP: 'Region',
    DORMANT_REENGAGEMENT: 'Re-engagement',
    FOLLOWUP_DEPTH: 'Follow-up depth',
    SCRAPE_NEEDED: 'Scrape needed',
};

export default function GoalPlannerClient() {
    const router = useRouter();
    const [goalAmount, setGoalAmount] = useState<number>(8000);
    const [deadline, setDeadline] = useState<string>(defaultDeadline());
    const [plan, setPlan] = useState<GoalPlan | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [includeLowConfidence, setIncludeLowConfidence] = useState(false);
    const [firing, setFiring] = useState(false);
    const [fireResults, setFireResults] = useState<FireResult[] | null>(null);
    const [fireSummary, setFireSummary] = useState<FireSummary | null>(null);
    // SourceLeadsModal control — null = closed; otherwise the region to
    // prefill (empty string = open with all lookalike suggestions).
    const [sourceModalRegion, setSourceModalRegion] = useState<string | null>(null);

    const calculate = async () => {
        setError(null);
        setLoading(true);
        const res = await generateGoalPlanAction({
            goalAmount,
            deadlineISO: new Date(deadline).toISOString(),
        });
        setLoading(false);
        if (!res.success) {
            setError(res.error);
            setPlan(null);
            return;
        }
        setPlan(res.plan);
        // Pre-select non-blocker, non-low-confidence scenarios.
        const initial = new Set<string>();
        for (const s of res.plan.scenarios) {
            if (s.blocker) continue;
            if (s.confidence === 'LOW') continue;
            if (s.sendsAllocated <= 0) continue;
            initial.add(s.id);
        }
        setSelected(initial);
    };

    const toggle = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
    };

    const selectedTotal = plan
        ? plan.scenarios
              .filter(s => selected.has(s.id))
              .reduce((sum, s) => sum + s.projectedRevenue, 0)
        : 0;

    const fireCampaigns = async () => {
        if (!plan) return;
        const picked = plan.scenarios.filter(s => selected.has(s.id) && !s.blocker);
        if (picked.length === 0) return;

        // Hormozi reality check — one confirmation before live sends fire.
        // Shows: campaign count, daily send rate, ETA. Cancel-able.
        const dailyEstimate = picked.reduce(
            (sum, s) => sum + Math.min(100, Math.max(10, Math.ceil(s.sendsAllocated / Math.max(1, plan.daysUntilDeadline)))),
            0,
        );
        const ok = window.confirm(
            `Fire ${picked.length} campaign${picked.length === 1 ? '' : 's'}?\n\n` +
            `~${dailyEstimate} emails/day Mon–Fri 9–5 UTC\n` +
            `First send: within ~10 min once the cron picks it up\n\n` +
            `This will rotate across your active Gmail accounts and launch immediately.`,
        );
        if (!ok) return;

        setFiring(true);
        setFireResults(null);
        setFireSummary(null);
        const res = await fireGoalPlanAction({
            scenarios: picked,
            deadlineISO: plan.deadline,
            daysUntilDeadline: plan.daysUntilDeadline,
            goalAmount: plan.goalAmount,
        });
        setFiring(false);
        if (!res.success) {
            setError(res.error);
            return;
        }
        setFireResults(res.results);
        setFireSummary(res.summary);
    };

    return (
        <div style={{ height: '100%', overflow: 'auto', background: 'var(--shell)', color: 'var(--ink)', fontFamily: 'var(--font-ui)' }}>
            <div style={{ padding: '22px 26px', maxWidth: 960, margin: '0 auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 24 }}>
                    <Link href="/campaigns" style={{ color: 'var(--ink-muted)', fontSize: 13, textDecoration: 'none' }}>
                        ← Back to Campaigns
                    </Link>
                </div>
                <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
                    Goal Planner
                </h1>
                <div style={{ color: 'var(--ink-muted)', fontSize: 14, marginBottom: 24 }}>
                    Tell the system your revenue goal. It analyses your contacts, historical conversion, and Gmail capacity, then proposes a data-grounded plan.
                </div>

                {/* Goal input */}
                <div
                    style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--hairline-soft)',
                        borderRadius: 14,
                        padding: '20px 22px',
                        marginBottom: 24,
                        display: 'flex',
                        gap: 16,
                        alignItems: 'flex-end',
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ flex: '1 1 200px' }}>
                        <label style={labelStyle}>Goal amount (USD)</label>
                        <input
                            type="number"
                            min={1}
                            step={100}
                            value={goalAmount}
                            onChange={e => setGoalAmount(parseFloat(e.target.value) || 0)}
                            style={inputStyle}
                        />
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                        <label style={labelStyle}>Deadline</label>
                        <input
                            type="date"
                            value={deadline}
                            onChange={e => setDeadline(e.target.value)}
                            style={inputStyle}
                        />
                    </div>
                    <button onClick={calculate} disabled={loading} style={btnPrimary}>
                        {loading ? 'Calculating…' : 'Calculate plan →'}
                    </button>
                </div>

                {error && (
                    <div
                        style={{
                            background: 'var(--danger-soft)',
                            color: 'var(--danger)',
                            border: '1px solid var(--danger)',
                            borderRadius: 12,
                            padding: '12px 16px',
                            marginBottom: 24,
                            fontSize: 13,
                        }}
                    >
                        {error}
                    </div>
                )}

                {fireResults && (
                    <div
                        style={{
                            background: 'var(--coach-soft)',
                            border: '1px solid var(--coach)',
                            borderRadius: 12,
                            padding: '14px 16px',
                            marginBottom: 18,
                        }}
                    >
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>
                            {fireSummary && fireSummary.fired > 0
                                ? `🚀 ${fireSummary.fired} of ${fireResults.length} campaign${fireResults.length === 1 ? '' : 's'} launched — first sends within ~10 min`
                                : `${fireResults.filter(r => r.success).length} of ${fireResults.length} campaigns created (none launched)`}
                        </div>
                        {fireSummary && (
                            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 8 }}>
                                {fireSummary.totalDailySends.toLocaleString()} emails/day across {fireSummary.accountsUsed.length} Gmail account{fireSummary.accountsUsed.length === 1 ? '' : 's'} ·
                                {' '}skipped {fireSummary.blockedCount.toLocaleString()} contacts on the global do-not-contact list
                                (unsubscribed, bounced, or auto-replied on any prior campaign).
                            </div>
                        )}
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                            {fireResults.map(r => (
                                <li key={r.scenarioId} style={{ marginBottom: 4 }}>
                                    <strong>{r.scenarioLabel}</strong>:{' '}
                                    {r.launched
                                        ? `launched · ${r.enrolled} contacts · ${r.dailySendLimit}/day`
                                        : r.success
                                            ? `enrolled ${r.enrolled} (DRAFT — ${r.error || 'not launched'})`
                                            : `failed — ${r.error}`}
                                </li>
                            ))}
                        </ul>
                        <button
                            onClick={() => router.push('/campaigns')}
                            style={{ ...btnPrimary, marginTop: 10 }}
                        >
                            Go to Campaigns →
                        </button>
                    </div>
                )}

                {plan && (
                    <>
                        {/* Feasibility banner */}
                        <FeasibilityBanner plan={plan} />

                        {/* Capacity / context strip */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: 12,
                                marginBottom: 18,
                            }}
                        >
                            <Stat label="Days until deadline" value={`${plan.daysUntilDeadline}`} />
                            <Stat
                                label="Daily send capacity"
                                value={`${plan.dailySendCapacity.toLocaleString()}`}
                                sub="cold sends/day (30 per warmed mailbox · less during warmup)"
                            />
                            <Stat label="Scenarios found" value={`${plan.scenarios.length}`} />
                        </div>

                        {/* Scenarios */}
                        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '24px 0 12px' }}>
                            Scenarios — check the ones to include
                        </h2>
                        {plan.scenarios.length === 0 && (
                            <div style={{ color: 'var(--ink-muted)', fontSize: 13, padding: '20px 0' }}>
                                No scenarios produced — the contact pool may be too small. Ask Admin to import or scrape leads.
                            </div>
                        )}
                        <div style={{ display: 'grid', gap: 10 }}>
                            {plan.scenarios.map(s => (
                                <ScenarioCard
                                    key={s.id}
                                    scenario={s}
                                    checked={selected.has(s.id)}
                                    disabled={
                                        !!s.blocker ||
                                        s.sendsAllocated <= 0 ||
                                        (s.confidence === 'LOW' && !includeLowConfidence)
                                    }
                                    onToggle={() => toggle(s.id)}
                                    onTopUp={
                                        s.kind === 'SCRAPE_NEEDED'
                                            ? () => setSourceModalRegion(s.region ?? '')
                                            : undefined
                                    }
                                />
                            ))}
                        </div>

                        {/* Low-confidence opt-in */}
                        {plan.scenarios.some(s => s.confidence === 'LOW' && !s.blocker) && (
                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    margin: '14px 0',
                                    fontSize: 12,
                                    color: 'var(--ink-muted)',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={includeLowConfidence}
                                    onChange={e => setIncludeLowConfidence(e.target.checked)}
                                />
                                Include low-confidence scenarios (less than 30 historical sends — may over- or under-estimate)
                            </label>
                        )}

                        {/* Footer */}
                        <div
                            style={{
                                position: 'sticky',
                                bottom: 0,
                                background: 'var(--shell)',
                                borderTop: '1px solid var(--hairline-soft)',
                                padding: '16px 0',
                                marginTop: 24,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                flexWrap: 'wrap',
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Selected projection
                                </div>
                                <div style={{ fontSize: 24, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    {fmtMoney(selectedTotal)}{' '}
                                    <span style={{ fontSize: 14, color: 'var(--ink-muted)', fontWeight: 400 }}>
                                        / {fmtMoney(plan.goalAmount)} goal
                                    </span>
                                </div>
                            </div>
                            <button
                                disabled={selected.size === 0 || firing}
                                onClick={fireCampaigns}
                                style={{
                                    ...btnPrimary,
                                    opacity: selected.size === 0 || firing ? 0.5 : 1,
                                }}
                            >
                                {firing ? 'Firing…' : `🚀 Fire ${selected.size} campaign${selected.size === 1 ? '' : 's'} now`}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Source-leads modal — opens when the rep clicks the
                "Top up from internet" button on a SCRAPE_NEEDED scenario.
                After a successful run we re-fetch the plan so pool counts
                refresh and the blocker can disappear. */}
            {sourceModalRegion !== null && (
                <SourceLeadsModal
                    prefillRegion={sourceModalRegion || undefined}
                    onClose={() => setSourceModalRegion(null)}
                    onCompleted={() => {
                        // Don't auto-close — let the rep see the summary;
                        // refresh the plan in the background.
                        void calculate();
                    }}
                />
            )}
        </div>
    );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function FeasibilityBanner({ plan }: { plan: GoalPlan }) {
    if (plan.feasibility === 'OK') {
        return (
            <Banner color="var(--coach)" bg="var(--coach-soft)">
                ✓ Goal is within reach. {plan.feasibilityReason}
            </Banner>
        );
    }
    if (plan.feasibility === 'GAP') {
        return (
            <Banner color="var(--warn)" bg="var(--warn-soft)">
                ⚠ Gap detected. {plan.feasibilityReason} Consider extending the deadline or asking Admin to scrape more leads.
            </Banner>
        );
    }
    return (
        <Banner color="var(--danger)" bg="var(--danger-soft)">
            ✗ Blocked. {plan.feasibilityReason}
        </Banner>
    );
}

function Banner({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
    return (
        <div
            style={{
                background: bg,
                color,
                border: `1px solid ${color}`,
                borderRadius: 12,
                padding: '12px 16px',
                marginBottom: 18,
                fontSize: 13,
                fontWeight: 500,
            }}
        >
            {children}
        </div>
    );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div
            style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline-soft)',
                borderRadius: 12,
                padding: '14px 16px',
            }}
        >
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
                {label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{sub}</div>}
        </div>
    );
}

function ScenarioCard({
    scenario,
    checked,
    disabled,
    onToggle,
    onTopUp,
}: {
    scenario: Scenario;
    checked: boolean;
    disabled: boolean;
    onToggle: () => void;
    /** Optional callback — when present, renders a "Top up from internet"
     *  button alongside the blocker pill. Only passed for SCRAPE_NEEDED
     *  scenarios; resolves the blocker by sourcing more leads. */
    onTopUp?: () => void;
}) {
    const f = scenario.funnel;
    return (
        <label
            style={{
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
                background: 'var(--surface)',
                border: '1px solid var(--hairline-soft)',
                borderRadius: 12,
                padding: '14px 16px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.55 : 1,
            }}
        >
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={onToggle}
                style={{ marginTop: 4 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={tagStyle}>{kindLabel[scenario.kind]}</span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{scenario.label}</span>
                    <span
                        style={{
                            ...tagStyle,
                            background: confidenceBg[scenario.confidence],
                            color: confidenceColor[scenario.confidence],
                            marginLeft: 'auto',
                        }}
                    >
                        {scenario.confidence} ({f.sampleSize} sends)
                    </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 6 }}>
                    {scenario.detail}
                </div>
                {scenario.blocker && (
                    <div
                        style={{
                            fontSize: 12,
                            color: 'var(--warn)',
                            background: 'var(--warn-soft)',
                            border: '1px solid var(--warn)',
                            borderRadius: 8,
                            padding: '6px 10px',
                            marginBottom: 6,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                        }}
                    >
                        <span>Blocker: {scenario.blocker}</span>
                        {onTopUp && (
                            <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTopUp(); }}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: 6,
                                    border: '1px solid var(--warn)',
                                    background: 'var(--warn)',
                                    color: 'var(--canvas)',
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                ✨ Top up from internet
                            </button>
                        )}
                    </div>
                )}
                <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-muted)', flexWrap: 'wrap' }}>
                    <Funnel label="Deliver" value={f.deliver} />
                    <Funnel label="Open" value={f.open} />
                    <Funnel label="Reply" value={f.reply} />
                    <Funnel label="Meeting" value={f.meeting} />
                    <Funnel label="Close" value={f.close} />
                    <span style={{ color: 'var(--ink)' }}>· avg deal {fmtMoney(f.avgDealSize)}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                    <span>
                        <strong>{scenario.sendsAllocated.toLocaleString()}</strong> sends allocated
                        {scenario.poolMax > scenario.sendsAllocated && (
                            <span style={{ color: 'var(--ink-muted)' }}> (of {scenario.poolMax} pool)</span>
                        )}
                    </span>
                    <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
                        {fmtMoney(scenario.projectedRevenue)} projected
                    </span>
                </div>
            </div>
        </label>
    );
}

function Funnel({ label, value }: { label: string; value: number }) {
    return (
        <span>
            {label} {(value * 100).toFixed(0)}%
        </span>
    );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--ink-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--hairline)',
    fontSize: 14,
    background: 'var(--bg-surface, var(--shell))',
    color: 'var(--ink)',
    outline: 'none',
    fontFamily: 'inherit',
};

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

const tagStyle: React.CSSProperties = {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--surface-2, var(--surface))',
    color: 'var(--ink-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
};
