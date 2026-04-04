'use client';

import React, { useState, useEffect } from 'react';

type Props = {
    userName: string;
    onComplete: () => void;
};

const STEPS = [
    { id: 'welcome', title: 'Welcome to Unibox', icon: '\uD83D\uDE80' },
    { id: 'gmail', title: 'Connect Gmail', icon: '\uD83D\uDCE7' },
    { id: 'extension', title: 'Install Extension', icon: '\uD83E\uDDE9' },
    { id: 'apikey', title: 'Set API Key', icon: '\uD83D\uDD11' },
    { id: 'done', title: 'Ready to Sell', icon: '\uD83C\uDF89' },
];

export default function OnboardingWizard({ userName, onComplete }: Props) {
    const [step, setStep] = useState(0);
    const [apiKey, setApiKey] = useState('');
    const [generating, setGenerating] = useState(false);
    const [copied, setCopied] = useState(false);

    const current = STEPS[step];
    const progress = ((step) / (STEPS.length - 1)) * 100;

    const generateKey = async () => {
        setGenerating(true);
        try {
            const res = await fetch('/api/extension/generate-key', { method: 'POST' });
            const data = await res.json();
            if (data.apiKey) setApiKey(data.apiKey);
        } catch (e) {
            console.error('Failed to generate key:', e);
        }
        setGenerating(false);
    };

    const copyKey = () => {
        navigator.clipboard.writeText(apiKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleComplete = () => {
        try { localStorage.setItem('unibox_onboarding_done', 'true'); } catch {}
        onComplete();
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'DM Sans', system-ui, sans-serif",
            backdropFilter: 'blur(4px)',
        }}>
            <div style={{
                background: '#fff', borderRadius: 16, width: 540, maxHeight: '85vh',
                boxShadow: '0 24px 80px rgba(0,0,0,.2)', overflow: 'hidden',
            }}>
                {/* Progress Bar */}
                <div style={{ height: 4, background: '#f1f5f9' }}>
                    <div style={{
                        height: '100%', background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
                        width: `${progress}%`, transition: 'width .4s ease',
                        borderRadius: 2,
                    }} />
                </div>

                {/* Step Indicators */}
                <div style={{
                    display: 'flex', justifyContent: 'center', gap: 8, padding: '20px 24px 0',
                }}>
                    {STEPS.map((s, i) => (
                        <div key={s.id} style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: i <= step ? '#2563eb' : '#f1f5f9',
                            color: i <= step ? '#fff' : '#94a3b8',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, fontWeight: 700, transition: 'all .3s',
                        }}>
                            {i < step ? '\u2713' : i + 1}
                        </div>
                    ))}
                </div>

                {/* Content */}
                <div style={{ padding: '24px 40px 32px', textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>{current.icon}</div>
                    <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 8px', letterSpacing: '-.02em' }}>
                        {current.title}
                    </h2>

                    {/* Step: Welcome */}
                    {step === 0 && (
                        <div>
                            <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.6, margin: '0 0 20px' }}>
                                Hey {userName}! Let&apos;s get you set up in under 2 minutes.
                                We&apos;ll connect your email, install the prospector extension,
                                and you&apos;ll be selling in no time.
                            </p>
                            <div style={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, textAlign: 'left',
                                background: '#f8fafc', borderRadius: 12, padding: 16, margin: '0 0 20px',
                            }}>
                                {[
                                    { icon: '\uD83D\uDCE7', label: 'Multi-account email sync' },
                                    { icon: '\uD83C\uDFAF', label: 'Smart action queue' },
                                    { icon: '\uD83E\uDDE9', label: 'Auto lead scraping' },
                                    { icon: '\uD83D\uDCC8', label: 'Pipeline & analytics' },
                                ].map(f => (
                                    <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
                                        <span style={{ fontSize: 18 }}>{f.icon}</span>
                                        {f.label}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step: Connect Gmail */}
                    {step === 1 && (
                        <div>
                            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 20px' }}>
                                Connect your Gmail account to start syncing emails.
                                This lets you send, receive, and track emails directly from Unibox.
                            </p>
                            <div style={{
                                background: '#f8fafc', borderRadius: 12, padding: 20, margin: '0 0 16px',
                                border: '1px solid #e2e8f0',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Google Gmail</span>
                                </div>
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: '8px 0 16px' }}>
                                    Your admin will need to connect Gmail accounts from the Accounts page.
                                </p>
                                <a href="/accounts" style={{
                                    display: 'inline-block', background: '#2563eb', color: '#fff',
                                    padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                    textDecoration: 'none', transition: 'background .15s',
                                }}>
                                    Go to Accounts
                                </a>
                            </div>
                            <p style={{ fontSize: 11, color: '#94a3b8' }}>
                                Already connected? Click Next to continue.
                            </p>
                        </div>
                    )}

                    {/* Step: Install Extension */}
                    {step === 2 && (
                        <div>
                            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 20px' }}>
                                The Unibox Prospector extension scrapes filmmaker websites,
                                scores leads, and auto-fills your CRM with contact data.
                            </p>
                            <div style={{
                                background: '#0a0a0a', borderRadius: 12, padding: 20, margin: '0 0 16px',
                                border: '1px solid rgba(255,255,255,0.1)',
                            }}>
                                <div style={{ fontSize: 13, color: '#00ff41', fontFamily: "'SF Mono', monospace", fontWeight: 600, marginBottom: 4 }}>
                                    Unibox Prospector v2
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
                                    Antigravity Edition
                                </div>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                    <a href="/api/extension/download" style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        background: '#16a34a', color: '#fff',
                                        padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                        textDecoration: 'none',
                                    }}>
                                        {'\u2B07'} Download Extension
                                    </a>
                                </div>
                            </div>
                            <div style={{
                                background: '#eff6ff', borderRadius: 8, padding: 12,
                                fontSize: 12, color: '#1e40af', textAlign: 'left', lineHeight: 1.6,
                            }}>
                                <strong>How to install:</strong><br />
                                1. Download and unzip the file<br />
                                2. Go to <code style={{ background: '#dbeafe', padding: '1px 4px', borderRadius: 3 }}>chrome://extensions</code><br />
                                3. Enable &quot;Developer mode&quot; (top right)<br />
                                4. Click &quot;Load unpacked&quot; and select the folder
                            </div>
                        </div>
                    )}

                    {/* Step: API Key */}
                    {step === 3 && (
                        <div>
                            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 20px' }}>
                                Generate an API key and paste it into the extension popup
                                to connect it to your Unibox account.
                            </p>
                            {!apiKey ? (
                                <button onClick={generateKey} disabled={generating} style={{
                                    background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8,
                                    padding: '12px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    opacity: generating ? 0.6 : 1,
                                }}>
                                    {generating ? 'Generating...' : '\uD83D\uDD11 Generate API Key'}
                                </button>
                            ) : (
                                <div>
                                    <div style={{
                                        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
                                        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8,
                                        margin: '0 0 12px',
                                    }}>
                                        <code style={{
                                            flex: 1, fontSize: 12, color: '#0f172a', fontFamily: "'SF Mono', monospace",
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {apiKey}
                                        </code>
                                        <button onClick={copyKey} style={{
                                            background: copied ? '#16a34a' : '#2563eb', color: '#fff', border: 'none',
                                            borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600,
                                            cursor: 'pointer', flexShrink: 0, transition: 'background .2s',
                                        }}>
                                            {copied ? '\u2713 Copied' : 'Copy'}
                                        </button>
                                    </div>
                                    <div style={{
                                        background: '#fffbeb', borderRadius: 8, padding: 10,
                                        fontSize: 12, color: '#92400e', textAlign: 'left',
                                    }}>
                                        Open the extension popup {'\u2192'} Config tab {'\u2192'} paste this key
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step: Done */}
                    {step === 4 && (
                        <div>
                            <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.6, margin: '0 0 20px' }}>
                                You&apos;re all set, {userName}! Start by checking your
                                Action Queue to see who needs your attention today.
                            </p>
                            <div style={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '0 0 8px',
                            }}>
                                <a href="/actions" onClick={handleComplete} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
                                    background: 'linear-gradient(135deg, #1e3a8a, #2563eb)', color: '#fff',
                                    padding: '14px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                                    textDecoration: 'none', transition: 'transform .15s',
                                }}>
                                    {'\uD83C\uDFAF'} Start Selling
                                </a>
                                <a href="/clients" onClick={handleComplete} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
                                    background: '#f1f5f9', color: '#0f172a',
                                    padding: '14px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                    textDecoration: 'none', border: '1px solid #e2e8f0',
                                }}>
                                    {'\uD83D\uDC65'} View Clients
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Navigation */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginTop: 24, paddingTop: 16, borderTop: '1px solid #f1f5f9',
                    }}>
                        {step > 0 && step < 4 ? (
                            <button onClick={() => setStep(s => s - 1)} style={{
                                background: 'none', border: 'none', color: '#94a3b8',
                                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                            }}>
                                {'\u2190'} Back
                            </button>
                        ) : <div />}

                        <div style={{ display: 'flex', gap: 8 }}>
                            {step < 4 && step > 0 && (
                                <button onClick={() => setStep(s => s + 1)} style={{
                                    background: 'none', border: 'none', color: '#94a3b8',
                                    fontSize: 13, fontWeight: 500, cursor: 'pointer',
                                }}>
                                    Skip
                                </button>
                            )}
                            {step < 4 && (
                                <button onClick={() => setStep(s => s + 1)} style={{
                                    background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8,
                                    padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                    transition: 'background .15s',
                                }}>
                                    {step === 0 ? 'Get Started' : 'Next'} {'\u2192'}
                                </button>
                            )}
                            {step === 4 && (
                                <button onClick={handleComplete} style={{
                                    background: 'none', border: 'none', color: '#94a3b8',
                                    fontSize: 12, cursor: 'pointer',
                                }}>
                                    Skip to Dashboard
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
