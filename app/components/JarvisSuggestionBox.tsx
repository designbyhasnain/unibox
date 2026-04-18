'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Sparkles, RefreshCw, Copy, ThumbsUp, ThumbsDown } from 'lucide-react';
import { suggestReplyAction, logJarvisFeedbackAction } from '../../src/actions/jarvisActions';

interface JarvisSuggestionBoxProps {
    threadId: string;
    onCopy: (suggestion: string) => void;
}

let lastJarvisSuggestion: { threadId: string; suggestion: string } | null = null;

export function getLastJarvisSuggestion() {
    return lastJarvisSuggestion;
}

export function logJarvisFeedback(threadId: string, actualReply: string, wasUsed: boolean) {
    if (!lastJarvisSuggestion || lastJarvisSuggestion.threadId !== threadId) return;
    logJarvisFeedbackAction({
        threadId,
        jarvisSuggestion: lastJarvisSuggestion.suggestion,
        actualReply,
        wasUsed,
    }).catch(() => {});
}

export default function JarvisSuggestionBox({ threadId, onCopy }: JarvisSuggestionBoxProps) {
    const [suggestion, setSuggestion] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
    const activeThreadRef = useRef<string | null>(null);

    const load = useCallback(async (tid: string) => {
        activeThreadRef.current = tid;
        setIsLoading(true);
        setError(null);
        setSuggestion(null);
        setCopied(false);
        setFeedback(null);
        try {
            const res = await suggestReplyAction(tid);
            if (activeThreadRef.current !== tid) return;
            if (res.success) {
                setSuggestion(res.suggestion);
                lastJarvisSuggestion = { threadId: tid, suggestion: res.suggestion };
            } else {
                setError(res.error || 'Jarvis could not generate a draft.');
            }
        } catch (e: any) {
            if (activeThreadRef.current === tid) setError(e?.message || 'Unexpected error');
        } finally {
            if (activeThreadRef.current === tid) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!threadId) return;
        load(threadId);
    }, [threadId, load]);

    const handleCopy = () => {
        if (!suggestion) return;
        onCopy(suggestion);
        setCopied(true);
        setFeedback('up');
        logJarvisFeedbackAction({
            threadId,
            jarvisSuggestion: suggestion,
            actualReply: suggestion,
            wasUsed: true,
        }).catch(() => {});
        setTimeout(() => setCopied(false), 1600);
    };

    const handleFeedback = (type: 'up' | 'down') => {
        setFeedback(type);
        if (suggestion) {
            logJarvisFeedbackAction({
                threadId,
                jarvisSuggestion: suggestion,
                actualReply: type === 'up' ? suggestion : '',
                wasUsed: type === 'up',
            }).catch(() => {});
        }
    };

    if (!threadId) return null;

    return (
        <div
            style={{
                border: '1px solid var(--border-color, #e5e7eb)',
                borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.04), rgba(59, 130, 246, 0.04))',
                padding: '10px 14px',
                margin: '8px 16px 4px',
                fontSize: 13,
                color: 'var(--text-primary)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: suggestion || isLoading || error ? 6 : 0 }}>
                <Sparkles size={14} style={{ color: '#7c3aed' }} />
                <span style={{ fontWeight: 600, fontSize: 12, color: '#7c3aed', letterSpacing: 0.2 }}>
                    Jarvis suggests…
                </span>
                <span style={{ flex: 1 }} />

                {suggestion && !isLoading && (
                    <>
                        <button
                            onClick={() => handleFeedback('up')}
                            title="Good suggestion"
                            style={{
                                display: 'inline-flex', alignItems: 'center',
                                background: feedback === 'up' ? 'rgba(34,197,94,0.1)' : 'transparent',
                                border: `1px solid ${feedback === 'up' ? '#22c55e' : 'var(--border-color, #e5e7eb)'}`,
                                borderRadius: 6, padding: '3px 6px', cursor: 'pointer',
                                color: feedback === 'up' ? '#22c55e' : 'var(--text-secondary, #64748b)',
                            }}
                        >
                            <ThumbsUp size={11} />
                        </button>
                        <button
                            onClick={() => handleFeedback('down')}
                            title="Bad suggestion — I'll write my own"
                            style={{
                                display: 'inline-flex', alignItems: 'center',
                                background: feedback === 'down' ? 'rgba(239,68,68,0.1)' : 'transparent',
                                border: `1px solid ${feedback === 'down' ? '#ef4444' : 'var(--border-color, #e5e7eb)'}`,
                                borderRadius: 6, padding: '3px 6px', cursor: 'pointer',
                                color: feedback === 'down' ? '#ef4444' : 'var(--text-secondary, #64748b)',
                            }}
                        >
                            <ThumbsDown size={11} />
                        </button>
                    </>
                )}

                <button
                    onClick={() => load(threadId)}
                    disabled={isLoading}
                    title="Regenerate"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: 'transparent', border: '1px solid var(--border-color, #e5e7eb)',
                        borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--text-secondary, #64748b)',
                        cursor: isLoading ? 'wait' : 'pointer',
                    }}
                >
                    <RefreshCw size={11} style={{ animation: isLoading ? 'jarvis-spin 1s linear infinite' : 'none' }} />
                    {isLoading ? 'Thinking…' : 'Regenerate'}
                </button>
                <button
                    onClick={handleCopy}
                    disabled={!suggestion || isLoading}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: suggestion && !isLoading ? '#7c3aed' : '#d1d5db',
                        color: '#fff', border: 'none', borderRadius: 6,
                        padding: '3px 10px', fontSize: 11, fontWeight: 600,
                        cursor: suggestion && !isLoading ? 'pointer' : 'not-allowed',
                    }}
                >
                    <Copy size={11} />
                    {copied ? 'Copied!' : 'Copy to Reply'}
                </button>
            </div>

            {isLoading && (
                <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: 12, fontStyle: 'italic' }}>
                    Reading the thread and drafting a reply…
                </div>
            )}

            {!isLoading && error && (
                <div style={{ color: '#b45309', fontSize: 12 }}>
                    {error}
                </div>
            )}

            {!isLoading && !error && suggestion && (
                <div
                    style={{
                        whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--text-primary)',
                        fontSize: 13, marginTop: 2,
                    }}
                >
                    {suggestion}
                </div>
            )}

            {feedback === 'down' && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#ef4444', fontStyle: 'italic' }}>
                    Got it — Jarvis will learn from your reply when you send it.
                </div>
            )}

            <style jsx>{`
                @keyframes jarvis-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
