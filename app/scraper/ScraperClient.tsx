'use client';

import { useState, useEffect, useTransition } from 'react';
import {
    startScrapeJobAction,
    getScrapeJobsAction,
    getScrapeResultsAction,
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

    const loadJobs = () => {
        getScrapeJobsAction().then(setJobs);
    };

    useEffect(() => {
        loadJobs();
    }, []);

    useEffect(() => {
        if (selectedJobId) {
            getScrapeResultsAction(selectedJobId).then(setResults);
        } else {
            setResults([]);
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

    const badgeColor = (label: string | null) => {
        switch (label) {
            case 'Hot':
                return '#ef4444';
            case 'Warm':
                return '#f97316';
            case 'Lukewarm':
                return '#eab308';
            default:
                return '#6b7280';
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px' }}>Lead Scraper</h1>
            <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '14px' }}>
                Paste up to 50 URLs (one per line). We&apos;ll fetch each page, extract contact info, and score
                the lead based on videography/wedding keywords.
            </p>

            <textarea
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder="https://example.com/&#10;https://weddingfilms.co/"
                rows={8}
                style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    resize: 'vertical',
                }}
                disabled={isPending}
            />

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '12px' }}>
                <button
                    onClick={handleStart}
                    disabled={isPending || !urls.trim()}
                    style={{
                        padding: '10px 20px',
                        background: isPending ? '#9ca3af' : '#111827',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 500,
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
                                    textAlign: 'left',
                                    padding: '10px',
                                    border: `1px solid ${selectedJobId === j.id ? '#111827' : '#e5e7eb'}`,
                                    borderRadius: '6px',
                                    background: selectedJobId === j.id ? '#f9fafb' : 'white',
                                    cursor: 'pointer',
                                }}
                            >
                                <div style={{ fontSize: '12px', fontWeight: 500 }}>
                                    {j.status} · {j.processedUrls}/{j.totalUrls}
                                </div>
                                <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                                    {new Date(j.createdAt).toLocaleString()}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                        Results {selectedJobId ? `(${results.length})` : ''}
                    </h3>
                    {!selectedJobId && <p style={{ fontSize: '13px', color: '#9ca3af' }}>Select a job</p>}
                    {selectedJobId && results.length === 0 && (
                        <p style={{ fontSize: '13px', color: '#9ca3af' }}>No results</p>
                    )}
                    {results.length > 0 && (
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead style={{ background: '#f9fafb' }}>
                                    <tr>
                                        <th style={{ padding: '10px', textAlign: 'left' }}>Score</th>
                                        <th style={{ padding: '10px', textAlign: 'left' }}>Domain</th>
                                        <th style={{ padding: '10px', textAlign: 'left' }}>Email</th>
                                        <th style={{ padding: '10px', textAlign: 'left' }}>Phone</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((r) => (
                                        <tr key={r.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '10px' }}>
                                                <span
                                                    style={{
                                                        display: 'inline-block',
                                                        padding: '2px 8px',
                                                        background: badgeColor(r.scoreLabel),
                                                        color: 'white',
                                                        borderRadius: '10px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {r.score} · {r.scoreLabel || '—'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px' }}>
                                                <a
                                                    href={r.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{ color: '#2563eb', textDecoration: 'none' }}
                                                >
                                                    {r.domain || r.url}
                                                </a>
                                            </td>
                                            <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '12px' }}>
                                                {r.email || '—'}
                                            </td>
                                            <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '12px' }}>
                                                {r.phone || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
