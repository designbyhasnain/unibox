'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
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

const ICON = {
    spark: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L9 12l-7 0 5.5 5L5 22l7-4.5L19 22l-2.5-5L22 12h-7L12 2z"/></svg>,
    copy: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
    refresh: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
    thumbUp: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>,
    thumbDown: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>,
};

export default function JarvisSuggestionBox({ threadId, onCopy }: JarvisSuggestionBoxProps) {
    const [suggestion, setSuggestion] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
    const [mode, setMode] = useState<'reply' | 'coaching'>('reply');
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
                setMode((res as { mode?: string }).mode === 'coaching' ? 'coaching' : 'reply');
                if ((res as { mode?: string }).mode !== 'coaching') {
                    lastJarvisSuggestion = { threadId: tid, suggestion: res.suggestion };
                }
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

    const isCoach = mode === 'coaching';

    return (
        <div className={`jarvis-card ${isCoach ? 'coach' : 'reply'}`}>
            <div className="jarvis-head">
                <span className="jarvis-spark">{ICON.spark}</span>
                <span className="label">{isCoach ? 'Coaching feedback' : 'Suggested reply'}</span>
                <span className="conf">
                    {isLoading ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span className="inbox-sync-spin" style={{ display: 'inline-flex' }}>{ICON.refresh}</span>
                            Thinking…
                        </span>
                    ) : suggestion ? (
                        <>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--coach)' }} />
                            {isCoach ? 'High conf.' : '92% match'}
                        </>
                    ) : null}
                </span>
            </div>

            {error && (
                <div style={{ fontSize: 12, color: 'var(--warn)', padding: '4px 0' }}>
                    {error}
                </div>
            )}

            {!isLoading && !error && suggestion && (
                <div className="jarvis-body">
                    {suggestion.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
                </div>
            )}

            {isLoading && (
                <div className="jarvis-body" style={{ color: 'var(--ink-muted)', fontStyle: 'italic' }}>
                    <p>Reading the thread and drafting a reply…</p>
                </div>
            )}

            {(suggestion || error) && !isLoading && (
                <div className="jarvis-actions">
                    {!isCoach && suggestion && (
                        <button className="jarvis-btn primary" onClick={handleCopy}>
                            {ICON.copy} {copied ? 'Copied!' : 'Copy to reply'}
                        </button>
                    )}
                    <button className="jarvis-btn" onClick={() => load(threadId)}>
                        {ICON.refresh} Regenerate
                    </button>
                    <div style={{ flex: 1 }} />
                    <button
                        className={`jarvis-btn icon`}
                        title="Good"
                        onClick={() => handleFeedback('up')}
                        style={feedback === 'up' ? { background: 'color-mix(in oklab, var(--coach), transparent 85%)', borderColor: 'var(--coach)' } : undefined}
                    >
                        {ICON.thumbUp}
                    </button>
                    <button
                        className={`jarvis-btn icon`}
                        title="Not helpful"
                        onClick={() => handleFeedback('down')}
                        style={feedback === 'down' ? { background: 'color-mix(in oklab, var(--danger), transparent 85%)', borderColor: 'var(--danger)' } : undefined}
                    >
                        {ICON.thumbDown}
                    </button>
                </div>
            )}
        </div>
    );
}
