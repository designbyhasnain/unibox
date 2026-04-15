'use client';

import { useState, useEffect, useCallback } from 'react';
import { getDataHealthAction } from '../../../src/actions/dataHealthActions';
import type { DataHealthSnapshot } from '../../../src/actions/dataHealthActions';
import { PageLoader } from '../../components/LoadingStates';

type Card = {
    label: string;
    value: number;
    hint: string;
    target: 'zero' | 'low' | 'monitor';
    color: string;
    bg: string;
};

function buildCards(data: DataHealthSnapshot): Card[] {
    return [
        {
            label: 'Total Contacts',
            value: data.totalContacts,
            hint: 'All contacts in the database',
            target: 'monitor',
            color: '#0f172a',
            bg: '#f8fafc',
        },
        {
            label: 'Total Emails',
            value: data.totalEmails,
            hint: 'All email_messages rows',
            target: 'monitor',
            color: '#0f172a',
            bg: '#f8fafc',
        },
        {
            label: 'Total Projects',
            value: data.totalProjects,
            hint: 'All projects (linked + unlinked)',
            target: 'monitor',
            color: '#0f172a',
            bg: '#f8fafc',
        },
        {
            label: 'Orphan Emails',
            value: data.orphanEmails,
            hint: 'email_messages with contact_id = NULL. Self-heals as agents click around.',
            target: 'zero',
            color: '#dc2626',
            bg: '#fef2f2',
        },
        {
            label: 'Orphan Projects',
            value: data.orphanProjects,
            hint: 'projects with client_id = NULL. Agents link 5/day at /link-projects.',
            target: 'zero',
            color: '#dc2626',
            bg: '#fef2f2',
        },
        {
            label: 'Unassigned Contacts',
            value: data.unassignedContacts,
            hint: 'No account_manager_id — invisible to all sales agents.',
            target: 'zero',
            color: '#d97706',
            bg: '#fffbeb',
        },
        {
            label: 'Stale Contacts (60d)',
            value: data.contactsNotTouched60d,
            hint: 'No human edit in 60+ days. Archive or re-engage.',
            target: 'low',
            color: '#d97706',
            bg: '#fffbeb',
        },
        {
            label: 'Overdue Unpaid Projects',
            value: data.overdueUnpaid,
            hint: 'Delivered 30+ days ago, still UNPAID. Escalate to finance.',
            target: 'zero',
            color: '#dc2626',
            bg: '#fef2f2',
        },
    ];
}

export default function DataHealthPage() {
    const [data, setData] = useState<DataHealthSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        const result = await getDataHealthAction();
        if (result.success && result.data) {
            setData(result.data);
        } else {
            setError(result.error || 'Failed to load');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const result = await getDataHealthAction();
            if (cancelled) return;
            if (result.success && result.data) {
                setData(result.data);
            } else {
                setError(result.error || 'Failed to load');
            }
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    if (loading) return <PageLoader isLoading={true} type="list" count={6}><div /></PageLoader>;

    if (error) {
        return (
            <div style={{ padding: 40, textAlign: 'center', color: '#dc2626', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
                {error}
            </div>
        );
    }

    if (!data) return null;

    const cards = buildCards(data);

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
                .dh-page { font-family: 'DM Sans', system-ui, sans-serif; flex: 1; min-height: 0; overflow-y: auto; background: #f8fafc; }
                .dh-mono { font-family: 'DM Mono', monospace; }
            `}</style>
            <div className="dh-page">
                {/* Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 40%, #fef3c7 100%)',
                    borderBottom: '1px solid #e2e8f0', padding: '24px 32px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div>
                        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.02em' }}>
                            {'\uD83D\uDCCA'} Data Health
                        </h1>
                        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', fontWeight: 500 }}>
                            Snapshot of data quality across the database. All self-heal loops shown in the Sales Agent Playbook converge these numbers toward zero.
                        </p>
                    </div>
                    <button onClick={load} style={{
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
                        padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#64748b',
                    }}>
                        {'\uD83D\uDD04'} Refresh
                    </button>
                </div>

                {/* Cards */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: 16, padding: 32,
                }}>
                    {cards.map(card => (
                        <div key={card.label} style={{
                            background: card.bg, borderRadius: 12, padding: 20,
                            border: '1px solid #e2e8f0',
                        }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                                {card.label}
                            </div>
                            <div className="dh-mono" style={{ fontSize: 36, fontWeight: 700, color: card.color, lineHeight: 1 }}>
                                {card.value.toLocaleString()}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                                {card.hint}
                            </div>
                            {card.target === 'zero' && card.value > 0 && (
                                <div style={{
                                    marginTop: 10, fontSize: 10, fontWeight: 700, color: card.color,
                                    background: '#fff', padding: '4px 8px', borderRadius: 4,
                                    display: 'inline-block', letterSpacing: '.04em',
                                }}>
                                    TARGET: 0
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Guidance */}
                <div style={{ padding: '0 32px 32px' }}>
                    <div style={{
                        background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0',
                    }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
                            How these numbers go down
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#475569', lineHeight: 1.8 }}>
                            <li><strong>Orphan emails:</strong> Drops when agents click Reply on action cards — the 3-tier lookup backfills contact_id automatically.</li>
                            <li><strong>Orphan projects:</strong> Drops at 5/day per agent on <code>/link-projects</code>. Target: zero in ~2 weeks.</li>
                            <li><strong>Unassigned contacts:</strong> Admin runs reassignment script or manually assigns via team page.</li>
                            <li><strong>Stale contacts (60d):</strong> Archive or run a win-back campaign.</li>
                            <li><strong>Overdue unpaid:</strong> Escalate to finance team; flip to Paid when collected.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </>
    );
}
