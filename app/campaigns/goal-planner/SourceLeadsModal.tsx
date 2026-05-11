'use client';

import { useEffect, useState } from 'react';
import { previewQueriesAction, sourceLeadsAction } from '../../../src/actions/leadSupplyActions';
import type { LookalikeQuery, SourceLeadsResult } from '../../../src/services/leadSupplyService';

type Props = {
    /** Optional region prefill — when launched from a SCRAPE_NEEDED scenario,
     *  we auto-focus queries on that region (others can still be added). */
    prefillRegion?: string;
    onClose: () => void;
    /** Called after a successful sourcing run so the parent (Goal Planner)
     *  can refetch its scenarios + pool counts. */
    onCompleted: (result: SourceLeadsResult) => void;
};

export default function SourceLeadsModal({ prefillRegion, onClose, onCompleted }: Props) {
    const [loading, setLoading] = useState(true);
    const [queries, setQueries] = useState<LookalikeQuery[]>([]);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<SourceLeadsResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Auto-suggest on open. If prefillRegion is set, we move any matching
    // query to the top and drop irrelevant regions — keeps the suggestion
    // focused on what the rep clicked.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await previewQueriesAction(prefillRegion ? 12 : 8);
                if (cancelled) return;
                if (!res.success) {
                    setError(res.error || 'Could not load suggestions');
                    setQueries([]);
                } else {
                    let next = res.queries;
                    if (prefillRegion) {
                        const inRegion = next.filter(q =>
                            q.region.toLowerCase().includes(prefillRegion.toLowerCase()) ||
                            q.text.toLowerCase().includes(prefillRegion.toLowerCase())
                        );
                        const others = next.filter(q => !inRegion.includes(q));
                        // Always seed with at least one region-targeted query
                        // even if the lookalike scan didn't surface it organically.
                        if (inRegion.length === 0) {
                            inRegion.push({
                                text: `wedding videographer ${prefillRegion}`,
                                region: prefillRegion,
                                derivedFrom: 'manual-region-target',
                            });
                        }
                        next = [...inRegion, ...others].slice(0, 8);
                    }
                    setQueries(next);
                }
            } catch (err: any) {
                if (!cancelled) setError(err?.message || 'Suggestion fetch failed');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [prefillRegion]);

    const updateQuery = (i: number, text: string) => {
        setQueries(qs => qs.map((q, idx) => idx === i ? { ...q, text } : q));
    };
    const removeQuery = (i: number) => {
        setQueries(qs => qs.filter((_, idx) => idx !== i));
    };
    const addQuery = () => {
        setQueries(qs => [...qs, { text: '', region: '', derivedFrom: 'manual' }]);
    };

    const fireSource = async () => {
        const cleaned = queries
            .map(q => ({ ...q, text: q.text.trim() }))
            .filter(q => q.text.length > 3);
        if (cleaned.length === 0) {
            setError('Add at least one query first.');
            return;
        }
        setError(null);
        setRunning(true);
        try {
            const res = await sourceLeadsAction(cleaned);
            if (res.result) {
                setResult(res.result);
                onCompleted(res.result);
            } else {
                setError(res.error || 'Sourcing failed');
            }
        } catch (err: any) {
            setError(err?.message || 'Sourcing failed');
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={overlayStyle}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={modalStyle}>
                <div style={headerStyle}>
                    <div>
                        <div style={titleStyle}>Top up the pool from the internet</div>
                        <div style={subStyle}>
                            {prefillRegion
                                ? `Sourcing lookalike leads in ${prefillRegion}`
                                : 'Lookalike queries based on your top-paid clients'}
                        </div>
                    </div>
                    <button onClick={onClose} style={closeStyle} aria-label="Close">×</button>
                </div>

                {/* Body */}
                {loading ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                        Reading your top-paid clients to suggest queries…
                    </div>
                ) : result ? (
                    <ResultSummary result={result} onClose={onClose} />
                ) : (
                    <>
                        <div style={{ padding: '16px 20px 8px', maxHeight: 360, overflowY: 'auto' }}>
                            {queries.map((q, i) => (
                                <div key={i} style={queryRow}>
                                    <input
                                        type="text"
                                        value={q.text}
                                        onChange={e => updateQuery(i, e.target.value)}
                                        placeholder="e.g. wedding videographer Austin"
                                        style={queryInput}
                                    />
                                    <button onClick={() => removeQuery(i)} style={removeBtn} aria-label="Remove">×</button>
                                </div>
                            ))}
                            <button onClick={addQuery} style={addBtn}>+ Add query</button>
                        </div>

                        {error && (
                            <div style={errorPill}>{error}</div>
                        )}

                        <div style={footerStyle}>
                            <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                                Each query ≈ 10–20 leads · auto-deduped against existing contacts
                            </div>
                            <button
                                onClick={fireSource}
                                disabled={running || queries.length === 0}
                                style={fireBtn(running || queries.length === 0)}
                            >
                                {running ? 'Sourcing…' : `Source ${queries.length} ${queries.length === 1 ? 'query' : 'queries'}`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function ResultSummary({ result, onClose }: { result: SourceLeadsResult; onClose: () => void }) {
    const ok = result.status === 'ok';
    const cap = result.status === 'cap_reached';
    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{
                fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 8,
            }}>
                {ok ? 'Done' : cap ? 'Daily cap reached — saved what we found' : 'Run finished with issues'}
            </div>
            <div style={summaryGrid}>
                <Cell label="Queries run" value={result.queriesRun.toString()} />
                <Cell label="Listings found" value={result.placesFound.toString()} />
                <Cell label="Added to pool" value={result.contactsAdded.toString()} primary />
                <Cell label="Already known" value={result.contactsSkipped.toString()} />
                <Cell label="Ghost rejected" value={result.instagramRejected.toString()} />
                <Cell label="API calls" value={`${result.placesCallsUsed} Places · ${result.instagramCallsUsed} IG`} />
            </div>
            {cap && result.resumesAt && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-muted)' }}>
                    Caps reset at {new Date(result.resumesAt).toLocaleString()}.
                </div>
            )}
            {result.errors.length > 0 && (
                <details style={{ marginTop: 12 }}>
                    <summary style={{ fontSize: 12, color: 'var(--ink-muted)', cursor: 'pointer' }}>
                        {result.errors.length} non-fatal {result.errors.length === 1 ? 'error' : 'errors'}
                    </summary>
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-muted)', maxHeight: 100, overflowY: 'auto' }}>
                        {result.errors.slice(0, 8).map((e, i) => <div key={i}>· {e}</div>)}
                    </div>
                </details>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={onClose} style={primaryBtn}>Done</button>
            </div>
        </div>
    );
}

function Cell({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
    return (
        <div style={{
            padding: '10px 12px',
            background: primary ? 'var(--coach-soft)' : 'var(--surface-2)',
            borderRadius: 8,
            border: primary ? '1px solid var(--coach)' : '1px solid var(--hairline-soft)',
        }}>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {label}
            </div>
            <div style={{
                fontSize: 18, fontWeight: 600, marginTop: 2,
                color: primary ? 'var(--coach)' : 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
            }}>
                {value}
            </div>
        </div>
    );
}

// ── styles (kept inline to avoid touching globals.css for a single modal) ──

const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
};
const modalStyle: React.CSSProperties = {
    background: 'var(--shell)', borderRadius: 14, width: 'min(560px, 92vw)',
    boxShadow: '0 24px 60px rgba(0,0,0,.25)', overflow: 'hidden',
    border: '1px solid var(--hairline)',
};
const headerStyle: React.CSSProperties = {
    padding: '18px 22px', borderBottom: '1px solid var(--hairline-soft)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
};
const titleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' };
const subStyle: React.CSSProperties = { fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 3 };
const closeStyle: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8, border: '1px solid var(--hairline)',
    background: 'var(--surface-2)', color: 'var(--ink)', cursor: 'pointer', fontSize: 18, lineHeight: 1,
};
const queryRow: React.CSSProperties = { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' };
const queryInput: React.CSSProperties = {
    flex: 1, padding: '8px 12px', fontSize: 13, color: 'var(--ink)',
    background: 'var(--surface-2)', border: '1px solid var(--hairline-soft)', borderRadius: 8, outline: 'none',
    fontFamily: 'inherit',
};
const removeBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 6, border: '1px solid var(--hairline)',
    background: 'var(--surface-2)', color: 'var(--ink-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0,
};
const addBtn: React.CSSProperties = {
    fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer',
    padding: '6px 0', marginTop: 4,
};
const footerStyle: React.CSSProperties = {
    padding: '14px 20px', borderTop: '1px solid var(--hairline-soft)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14,
};
const errorPill: React.CSSProperties = {
    margin: '0 20px 8px', padding: '8px 12px',
    fontSize: 12, color: 'var(--danger)', background: 'var(--danger-soft)',
    border: '1px solid var(--danger)', borderRadius: 8,
};
function fireBtn(disabled: boolean): React.CSSProperties {
    return {
        padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        background: disabled ? 'var(--surface-2)' : 'var(--ink)',
        color: disabled ? 'var(--ink-muted)' : 'var(--canvas)',
        border: disabled ? '1px solid var(--hairline)' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
    };
}
const primaryBtn: React.CSSProperties = {
    padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
    background: 'var(--ink)', color: 'var(--canvas)', border: 'none', cursor: 'pointer',
};
const summaryGrid: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8,
};
