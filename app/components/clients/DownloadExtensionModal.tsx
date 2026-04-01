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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onClose}>
            <div style={{ background: '#fff', borderRadius: 16, width: 480, maxHeight: '80vh', overflow: 'auto', padding: 32 }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Install Unibox Chrome Extension</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>&times;</button>
                </div>
                <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>Add clients from any website in one click</p>

                <div style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Step 1 - Download Extension</h3>
                    <a href="/api/extension/download" download style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#2563eb', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                        Download Extension (.zip)
                    </a>
                </div>

                <div style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Step 2 - Install in Chrome</h3>
                    <ol style={{ color: '#4b5563', fontSize: 13, lineHeight: 2, paddingLeft: 20 }}>
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
                            <button onClick={generateKey} disabled={generating} style={{ padding: '10px 20px', background: generating ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer' }}>
                                {generating ? 'Generating...' : 'Generate API Key'}
                            </button>
                            {error && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>{error}</p>}
                        </>
                    ) : (
                        <>
                            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Your API Key:</p>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <code style={{ flex: 1, padding: '10px 12px', background: '#f3f4f6', borderRadius: 8, fontSize: 11, wordBreak: 'break-all', fontFamily: 'monospace' }}>{apiKey}</code>
                                <button onClick={copyKey} style={{ padding: '10px 16px', background: copied ? '#16a34a' : '#f3f4f6', color: copied ? '#fff' : '#374151', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Paste this key in the extension popup to connect.</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
