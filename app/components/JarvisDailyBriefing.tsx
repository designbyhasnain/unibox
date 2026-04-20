'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { getDailyBriefingAction } from '../../src/actions/jarvisActions';
import type { DailyBriefing } from '../../src/services/dailyBriefingService';

/**
 * Role-aware daily briefing card for the top of the Dashboard.
 *
 * Identical layout for ADMIN / SALES / VIDEO_EDITOR — the service decides
 * what data to feed Groq. Purple-blue gradient border, white card inside
 * (Notion-ish). 3-4 short bullets, regenerate button, 5 snapshot stats.
 */
export default function JarvisDailyBriefing() {
    const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getDailyBriefingAction();
            if (res.success && res.briefing) setBriefing(res.briefing);
            else setError(res.error || 'Briefing unavailable');
        } catch (e: any) {
            setError(e?.message || 'Briefing failed');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    // Role-appropriate stat tiles. Keeps layout identical across roles.
    const statPairs = briefing ? computeStatPairs(briefing) : [];
    const bullets = briefing?.summary
        ? briefing.summary
            .split(/\n+/)
            .map(l => l.replace(/^\s*[•\-*]\s*/, '').trim())
            .filter(Boolean)
        : [];

    return (
        <div style={{
            padding: 2,
            borderRadius: 14,
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--info) 50%, var(--info) 100%)',
            marginBottom: 20,
        }}>
            <div style={{
                background: 'var(--bg-surface, #fff)',
                borderRadius: 12,
                padding: '18px 22px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, letterSpacing: 0.6, color: 'var(--accent)' }}>
                            JARVIS DAILY BRIEFING
                            {briefing?.role && (
                                <span style={{
                                    fontSize: 10, fontWeight: 700, marginLeft: 8, padding: '2px 8px',
                                    borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent)',
                                    letterSpacing: 0.3,
                                }}>{briefing.role.replace('_', ' ')}</span>
                            )}
                        </h3>
                    </div>
                    <button
                        onClick={load}
                        disabled={loading}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: 'transparent', border: '1px solid rgba(124, 58, 237, 0.25)',
                            borderRadius: 6, padding: '3px 10px', fontSize: 11,
                            color: 'var(--accent)', fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                        }}
                    >
                        <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        {loading ? 'Thinking…' : 'Regenerate'}
                    </button>
                </div>

                {/* Bullet summary */}
                {loading && !briefing ? (
                    <p style={{ fontSize: 13, color: 'var(--ink-muted)', fontStyle: 'italic', margin: '0 0 12px' }}>
                        Reading your last 24 hours and drafting a briefing…
                    </p>
                ) : bullets.length > 0 ? (
                    <ul style={{ margin: '0 0 14px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {bullets.slice(0, 5).map((b, i) => (
                            <li key={i} style={{
                                display: 'flex', gap: 8, fontSize: 14, lineHeight: 1.5,
                                color: 'var(--ink)',
                            }}>
                                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>•</span>
                                <span>{b}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '0 0 12px' }}>
                        {error || 'No briefing available.'}
                    </p>
                )}

                {/* Snapshot stats — same tile layout across roles */}
                {statPairs.length > 0 && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                        gap: 8,
                    }}>
                        {statPairs.map(([label, value]) => (
                            <Stat key={label} label={label} value={value} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div style={{
            background: 'var(--bg-surface, #fff)',
            border: '1px solid var(--hairline-soft)',
            borderRadius: 8,
            padding: '6px 10px',
        }}>
            <div style={{
                fontSize: 10, fontWeight: 600, color: 'var(--ink-muted)',
                textTransform: 'uppercase', letterSpacing: 0.4,
            }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, color: 'var(--ink)' }}>
                {value}
            </div>
        </div>
    );
}

function computeStatPairs(b: DailyBriefing): [string, string | number][] {
    const s = b.stats;
    const n = (k: string) => (typeof s[k] === 'number' ? (s[k] as number).toLocaleString() : (s[k] as any) ?? '—');
    if (b.role === 'ADMIN') {
        return [
            ['Sent', n('emailsSent')],
            ['Replies', n('repliesReceived')],
            ['Reply rate', `${s.replyRatePct ?? 0}%`],
            ['New leads', n('newLeads')],
            ['Revenue', `$${n('revenueClosed')}`],
        ];
    }
    if (b.role === 'SALES') {
        return [
            ['Sent', n('emailsSent')],
            ['Replies', n('repliesReceived')],
            ['Reply rate', `${s.replyRatePct ?? 0}%`],
            ['Waiting', n('waitingForReply')],
            ['Follow-ups', n('dueFollowups')],
        ];
    }
    // VIDEO_EDITOR
    return [
        ['Projects', n('totalProjects')],
        ['In progress', n('inProgress')],
        ['Due ≤ 3d', n('dueSoon')],
        ['Overdue', n('overdue')],
        ['New comments', n('newComments')],
    ];
}
