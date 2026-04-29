'use client';

import React, { useState } from 'react';

interface Props {
    onClose: () => void;
}

export default function DownloadExtensionModal({ onClose }: Props) {
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    const generateKey = async () => {
        setGenerating(true);
        setError('');
        try {
            const res = await fetch('/api/extension/generate-key', { method: 'POST' });
            const data = await res.json();
            if (data.apiKey) {
                setApiKey(data.apiKey);
            } else {
                setError(data.error || 'Failed to generate key');
            }
        } catch {
            setError('Network error');
        }
        setGenerating(false);
    };

    const copyKey = () => {
        if (apiKey) {
            navigator.clipboard.writeText(apiKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onClose}>
            <div style={{ background: 'var(--shell)', color: 'var(--ink)', borderRadius: 16, width: 480, maxHeight: '80vh', overflow: 'auto', padding: 32, border: '1px solid var(--hairline)' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Install Unibox Prospector v2 — Antigravity</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--ink-muted)' }}>&times;</button>
                </div>
                <p style={{ color: 'var(--ink-muted)', fontSize: 14, marginBottom: 24 }}>Dynamic Island lead capture with auto-scraping, scoring & FB fallback</p>

                <div style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Step 1 - Download Extension</h3>
                    <a href="/api/extension/download" download style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--accent)', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                        Download Extension (.zip)
                    </a>
                </div>

                <div style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Step 2 - Install in Chrome</h3>
                    <ol style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 2, paddingLeft: 20 }}>
                        <li>Open Chrome and go to <code>chrome://extensions</code></li>
                        <li>Enable <strong>Developer mode</strong> (top right toggle)</li>
                        <li>Click <strong>Load unpacked</strong></li>
                        <li>Select the extracted extension folder</li>
                    </ol>
                </div>

                <div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Step 3 - Connect to Unibox</h3>
                    {!apiKey ? (
                        <>
                            <button onClick={generateKey} disabled={generating} style={{ padding: '10px 20px', background: generating ? 'color-mix(in oklab, var(--accent), transparent 50%)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer' }}>
                                {generating ? 'Generating...' : 'Generate API Key'}
                            </button>
                            {error && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{error}</p>}
                        </>
                    ) : (
                        <>
                            <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 6 }}>Your API Key:</p>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <code style={{ flex: 1, padding: '10px 12px', background: 'var(--surface-2)', color: 'var(--ink)', borderRadius: 8, fontSize: 11, wordBreak: 'break-all', fontFamily: 'monospace' }}>{apiKey}</code>
                                <button onClick={copyKey} style={{ padding: '10px 16px', background: copied ? 'var(--coach)' : 'var(--surface-2)', color: copied ? '#fff' : 'var(--ink-2)', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 8 }}>Paste this key in the extension popup to connect.</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
