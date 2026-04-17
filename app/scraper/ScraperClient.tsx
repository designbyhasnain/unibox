'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import {
    startScrapeJobAction,
    getScrapeJobsAction,
    getScrapeResultsAction,
    bulkEnrollScrapedLeadsAction,
    listEnrollableCampaignsAction,
    type ScrapeJobSummary,
    type ScrapeResultRow,
} from '../../src/actions/scraperActions';

export default function ScraperPage() {
    const [urls, setUrls] = useState('');
    const [jobs, setJobs] = useState<ScrapeJobSummary[]>([]);
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [results, setResults] = useState<ScrapeResultRow[]>([]);
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    // Phase 5: bulk enroll
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [campaigns, setCampaigns] = useState<{ id: string; name: string; status: string }[]>([]);
    const [campaignId, setCampaignId] = useState<string>('');
    const [enrolling, setEnrolling] = useState(false);
    const [enrollMsg, setEnrollMsg] = useState<string | null>(null);

    const loadJobs = () => { getScrapeJobsAction().then(setJobs); };

    useEffect(() => {
        loadJobs();
        listEnrollableCampaignsAction().then(setCampaigns).catch(() => {});
    }, []);

    useEffect(() => {
        if (selectedJobId) {
            getScrapeResultsAction(selectedJobId).then(r => {
                setResults(r);
                setSelected(new Set()); // reset selection when switching jobs
            });
        } else {
            setResults([]);
            setSelected(new Set());
        }
    }, [selectedJobId]);

    const handleStart = () => {
        setMessage(null);
        startTransition(async () => {
            const res = await startScrapeJobAction(urls);
            if (res.success) {
                setMessage(`Job ${res.jobId?.slice(0, 8)} completed`);
                setUrls('');
                loadJobs();
                if (res.jobId) setSelectedJobId(res.jobId);
            } else {
                setMessage(`Error: ${res.error}`);
            }
        });
    };

    // Only leads that have an email are enrollable — others are skipped by the action anyway
    const enrollableResults = useMemo(() => results.filter(r => r.email && r.email.includes('@')), [results]);
    const allEnrollableSelected = enrollableResults.length > 0 && enrollableResults.every(r => selected.has(r.id));

    const toggleOne = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const toggleAll = () => {
        if (allEnrollableSelected) setSelected(new Set());
        else setSelected(new Set(enrollableResults.map(r => r.id)));
    };

    const handleEnroll = async () => {
        if (selected.size === 0 || !campaignId) return;
        setEnrolling(true);
        setEnrollMsg(null);
        try {
            const res = await bulkEnrollScrapedLeadsAction([...selected], campaignId);
            if (!res.success) {
                setEnrollMsg(`Enrollment failed: ${res.errors.join('; ')}`);
            } else {
                const parts = [];
                if (res.enrolled > 0) parts.push(`${res.enrolled} enrolled`);
                if (res.created > 0) parts.push(`${res.created} new contacts`);
                if (res.linked > 0) parts.push(`${res.linked} linked to existing contacts`);
                if (res.skipped > 0) parts.push(`${res.skipped} skipped`);
                setEnrollMsg(parts.join(' \u00b7 ') || 'Done');
                setSelected(new Set());
                // Refresh results so APPROVED status shows
                if (selectedJobId) getScrapeResultsAction(selectedJobId).then(setResults);
            }
        } catch (e: any) {
            setEnrollMsg(`Error: ${e?.message || 'Unknown error'}`);
        } finally {
            setEnrolling(false);
        }
    };

    const badgeColor = (label: string | null) => {
        switch (label) {
            case 'Hot': return '#ef4444';
            case 'Warm': return '#f97316';
            case 'Lukewarm': return '#eab308';
            default: return '#6b7280';
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px' }}>Lead Scraper</h1>
            <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '14px' }}>
                Paste up to 50 URLs (one per line). We&apos;ll fetch each page, extract contact info, and score
                the lead. Use the checkboxes to enroll selected leads directly into a campaign.
            </p>

            <textarea
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder="https://example.com/&#10;https://weddingfilms.co/"
                rows={8}
                style={{
                    width: '100%', padding: '12px',
                    border: '1px solid #e5e7eb', borderRadius: '8px',
                    fontFamily: 'monospace', fontSize: '13px', resize: 'vertical',
                }}
                disabled={isPending}
            />

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '12px' }}>
                <button
                    onClick={handleStart}
                    disabled={isPending || !urls.trim()}
                    style={{
                        padding: '10px 20px', background: isPending ? '#9ca3af' : '#111827',
                        color: 'white', border: 'none', borderRadius: '8px', fontWeight: 500,
                        cursor: isPending ? 'not-allowed' : 'pointer',
                    }}
                >
                    {isPending ? 'Scraping...' : 'Start Scrape'}
                </button>
                {message && <span style={{ fontSize: '13px', color: '#6b7280' }}>{message}</span>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px', marginTop: '32px' }}>
                <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Recent Jobs</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {jobs.length === 0 && <p style={{ fontSize: '13px', color: '#9ca3af' }}>No jobs yet</p>}
                        {jobs.map((j) => (
                            <button
                                key={j.id}
                                onClick={() => setSelectedJobId(j.id)}
                                style={{
                                    textAlign: 'left', padding: '10px',
                                    border: `1px solid ${selectedJobId === j.id ? '#111827' : '#e5e7eb'}`,
                                    borderRadius: '6px',
                                    background: selectedJobId === j.id ? '#f9fafb' : 'white',
                                    cursor: 'pointer',
                                }}
                            >
                                <div style={{ fontSize: '12px', fontWeight: 500 }}>
                                    {j.status} &middot; {j.processedUrls}/{j.totalUrls}
                                </div>
                                <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                                    {new Date(j.createdAt).toLocaleString()}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                            Results {selectedJobId ? `(${results.length})` : ''}
                            {selected.size > 0 && <span style={{ color: '#111827', fontWeight: 500, fontSize: 13 }}> &middot; {selected.size} selected</span>}
                        </h3>

                        {/* Bulk Enroll toolbar */}
                        {enrollableResults.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <select
                                    value={campaignId}
                                    onChange={e => setCampaignId(e.target.value)}
                                    disabled={enrolling}
                                    style={{
                                        padding: '7px 10px', borderRadius: 6, border: '1px solid #e5e7eb',
                                        fontSize: 12, background: 'white', minWidth: 180,
                                    }}
                                >
                                    <option value="">Select a campaign…</option>
                                    {campaigns.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} ({c.status})
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleEnroll}
                                    disabled={selected.size === 0 || !campaignId || enrolling}
                                    style={{
                                        padding: '8px 14px',
                                        background: selected.size > 0 && campaignId && !enrolling ? '#2563eb' : '#9ca3af',
                                        color: 'white', border: 'none', borderRadius: 6,
                                        fontSize: 12, fontWeight: 600,
                                        cursor: selected.size > 0 && campaignId && !enrolling ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    {enrolling ? 'Enrolling…' : `Enroll${selected.size > 0 ? ` ${selected.size}` : ''} →`}
                                </button>
                            </div>
                        )}
                    </div>
                    {enrollMsg && (
                        <div style={{
                            padding: '8px 12px', borderRadius: 6, marginBottom: 10,
                            background: enrollMsg.includes('failed') || enrollMsg.includes('Error') ? '#fef2f2' : '#f0fdf4',
                            color: enrollMsg.includes('failed') || enrollMsg.includes('Error') ? '#b91c1c' : '#15803d',
                            fontSize: 12, fontWeight: 500,
                        }}>
                            {enrollMsg}
                        </div>
                    )}

                    {!selectedJobId && <p style={{ fontSize: '13px', color: '#9ca3af' }}>Select a job</p>}
                    {selectedJobId && results.length === 0 && (
                        <p style={{ fontSize: '13px', color: '#9ca3af' }}>No results</p>
                    )}
                    {results.length > 0 && (
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead style={{ background: '#f9fafb' }}>
                                    <tr>
                                        <th style={{ padding: '10px', textAlign: 'left', width: 34 }}>
                                            <input
                                                type="checkbox"
                                                checked={allEnrollableSelected}
                                                disabled={enrollableResults.length === 0}
                                                onChange={toggleAll}
                                                title="Select all with email"
                                            />
                                        </th>
                                        <th style={{ padding: '10px', textAlign: 'left' }}>Score</th>
                                        <th style={{ padding: '10px', textAlign: 'left' }}>Domain</th>
                                        <th style={{ padding: '10px', textAlign: 'left' }}>Email</th>
                                        <th style={{ padding: '10px', textAlign: 'left' }}>Phone</th>
                                        <th style={{ padding: '10px', textAlign: 'left' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((r) => {
                                        const hasEmail = r.email && r.email.includes('@');
                                        const isSelected = selected.has(r.id);
                                        return (
                                            <tr key={r.id} style={{
                                                borderTop: '1px solid #f3f4f6',
                                                background: isSelected ? '#eff6ff' : 'transparent',
                                            }}>
                                                <td style={{ padding: '10px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        disabled={!hasEmail || r.status === 'APPROVED'}
                                                        onChange={() => toggleOne(r.id)}
                                                        title={!hasEmail ? 'No email to enroll' : r.status === 'APPROVED' ? 'Already enrolled' : ''}
                                                    />
                                                </td>
                                                <td style={{ padding: '10px' }}>
                                                    <span style={{
                                                        display: 'inline-block', padding: '2px 8px',
                                                        background: badgeColor(r.scoreLabel),
                                                        color: 'white', borderRadius: '10px',
                                                        fontSize: '11px', fontWeight: 600,
                                                    }}>
                                                        {r.score} &middot; {r.scoreLabel || '\u2014'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px' }}>
                                                    <a href={r.url} target="_blank" rel="noreferrer"
                                                        style={{ color: '#2563eb', textDecoration: 'none' }}>
                                                        {r.domain || r.url}
                                                    </a>
                                                </td>
                                                <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '12px' }}>
                                                    {r.email || '\u2014'}
                                                </td>
                                                <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '12px' }}>
                                                    {r.phone || '\u2014'}
                                                </td>
                                                <td style={{ padding: '10px' }}>
                                                    {r.status === 'APPROVED' ? (
                                                        <span style={{ fontSize: 11, fontWeight: 600, color: '#15803d', padding: '2px 8px', borderRadius: 6, background: '#f0fdf4' }}>
                                                            Enrolled
                                                        </span>
                                                    ) : r.status === 'REJECTED' ? (
                                                        <span style={{ fontSize: 11, color: '#b91c1c' }}>Error</span>
                                                    ) : (
                                                        <span style={{ fontSize: 11, color: '#6b7280' }}>Pending</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
