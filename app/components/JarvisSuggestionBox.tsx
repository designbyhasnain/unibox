'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, RefreshCw, Copy } from 'lucide-react';
import { suggestReplyAction } from '../../src/actions/jarvisActions';

interface JarvisSuggestionBoxProps {
    threadId: string;
    onCopy: (suggestion: string) => void;
}

/**
 * Auto-generates a Jarvis reply suggestion the moment a thread is opened.
 * Refreshes whenever threadId changes. "Copy to Reply" lifts the text to
 * the parent, which seeds it into the InlineReply composer.
 */
export default function JarvisSuggestionBox({ threadId, onCopy }: JarvisSuggestionBoxProps) {
    const [suggestion, setSuggestion] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const activeThreadRef = useRef<string | null>(null);

    const load = async (tid: string) => {
        activeThreadRef.current = tid;
        setIsLoading(true);
        setError(null);
        setSuggestion(null);
        setCopied(false);
        try {
            const res = await suggestReplyAction(tid);
            // Ignore stale responses if the user moved to another thread.
            if (activeThreadRef.current !== tid) return;
            if (res.success) {
                setSuggestion(res.suggestion);
            } else {
                setError(res.error || 'Jarvis could not generate a draft.');
            }
        } catch (e: any) {
            if (activeThreadRef.current === tid) setError(e?.message || 'Unexpected error');
        } finally {
            if (activeThreadRef.current === tid) setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!threadId) return;
        load(threadId);
        // We intentionally depend only on threadId — load() is stable for a given thread.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId]);

    const handleCopy = () => {
        if (!suggestion) return;
        onCopy(suggestion);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
    };

    // Keep the component invisible until we have anything worth showing.
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

            <style jsx>{`
                @keyframes jarvis-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
