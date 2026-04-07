'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useHydrated } from '../utils/useHydration';

type Message = {
    role: 'user' | 'assistant';
    content: string;
    toolsUsed?: string[];
    timestamp: Date;
};

const CHAT_SUGGESTIONS = [
    'Show me pipeline breakdown',
    'Who are our top 10 clients?',
    'Revenue last 6 months?',
    'Who owes us money?',
    'Clients in Australia',
    'AM performance',
];

const AGENT_SUGGESTIONS = [
    'Book 50 meetings with Australian filmmakers',
    'Collect all unpaid invoices from clients',
    'Find and outreach 200 filmmakers in California',
    'Re-engage all clients who went silent in 30+ days',
    'Build a cold outreach campaign for UK market',
    'Find filmmakers in Europe and draft multilingual emails',
];

export default function JarvisPage() {
    const isHydrated = useHydrated();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<'chat' | 'agent'>('chat');
    const [agentRunning, setAgentRunning] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async (text?: string) => {
        const msg = text || input.trim();
        if (!msg || loading) return;

        const userMsg: Message = { role: 'user', content: msg, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const apiMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
            const res = await fetch('/api/jarvis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: apiMessages }),
            });

            const data = await res.json();
            if (data.error) {
                setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}`, timestamp: new Date() }]);
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.reply || 'No response',
                    toolsUsed: data.toolsUsed,
                    timestamp: new Date(),
                }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to connect to Jarvis.', timestamp: new Date() }]);
        }
        setLoading(false);
        inputRef.current?.focus();
    };

    const runAgent = async (text?: string) => {
        const goal = text || input.trim();
        if (!goal || loading) return;

        setMessages(prev => [...prev, { role: 'user', content: `\u{1F3AF} AGENT GOAL: ${goal}`, timestamp: new Date() }]);
        setInput('');
        setLoading(true);
        setAgentRunning(true);

        setMessages(prev => [...prev, { role: 'assistant', content: '\u{1F9E0} Planning strategy...', timestamp: new Date() }]);

        try {
            const res = await fetch('/api/jarvis/agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal }),
            });

            const data = await res.json();
            if (data.error) {
                setMessages(prev => [...prev, { role: 'assistant', content: `Agent error: ${data.error}`, timestamp: new Date() }]);
            } else {
                // Show plan
                const planText = (data.plan || []).map((s: any) =>
                    `${s.status === 'DONE' ? '\u2705' : s.status === 'FAILED' ? '\u274C' : '\u23F3'} Step ${s.id}: ${s.action} — ${s.description}${s.result ? '\n   \u2192 ' + s.result.slice(0, 200) : ''}`
                ).join('\n\n');

                setMessages(prev => {
                    const filtered = prev.filter(m => m.content !== '\u{1F9E0} Planning strategy...');
                    return [...filtered, {
                        role: 'assistant',
                        content: `\u{1F4CB} EXECUTION PLAN:\n\n${planText}\n\n---\n\n\u{1F4CA} SUMMARY:\n${data.summary}`,
                        toolsUsed: ['agent_mode'],
                        timestamp: new Date(),
                    }];
                });
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Agent execution failed.', timestamp: new Date() }]);
        }
        setLoading(false);
        setAgentRunning(false);
    };

    const handleSubmit = () => {
        if (mode === 'agent') runAgent();
        else sendMessage();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    if (!isHydrated) return null;

    return (
        <>
            <style>{`
                .jarvis-page { height: 100%; display: flex; flex-direction: column; background: #09090b; font-family: 'DM Sans', system-ui, sans-serif; }
                .jarvis-header { padding: 16px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
                .jarvis-logo { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #2563eb, #7c3aed); display: flex; align-items: center; justify-content: center; font-size: 18px; }
                .jarvis-title { font-size: 18px; font-weight: 800; color: #fafafa; letter-spacing: -0.02em; }
                .jarvis-subtitle { font-size: 11px; color: #52525b; font-weight: 500; }
                .jarvis-messages { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
                .jarvis-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; }
                .jarvis-empty-title { font-size: 28px; font-weight: 800; color: #fafafa; letter-spacing: -0.03em; }
                .jarvis-empty-sub { font-size: 13px; color: #52525b; max-width: 400px; text-align: center; line-height: 1.6; }
                .jarvis-suggestions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; max-width: 600px; }
                .jarvis-suggestion { padding: 6px 14px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: #a1a1aa; font-size: 12px; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
                .jarvis-suggestion:hover { border-color: #2563eb; color: #2563eb; background: rgba(37,99,235,0.08); }
                .msg { max-width: 85%; padding: 12px 16px; border-radius: 12px; font-size: 13px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
                .msg-user { align-self: flex-end; background: #2563eb; color: #fff; border-bottom-right-radius: 4px; }
                .msg-assistant { align-self: flex-start; background: #18181b; color: #e4e4e7; border: 1px solid rgba(255,255,255,0.06); border-bottom-left-radius: 4px; }
                .msg-tools { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
                .msg-tool-badge { font-size: 9px; padding: 2px 8px; border-radius: 4px; background: rgba(37,99,235,0.15); color: #60a5fa; font-weight: 600; letter-spacing: 0.03em; }
                .msg-time { font-size: 9px; color: #3f3f46; margin-top: 4px; }
                .jarvis-input-wrap { padding: 12px 24px 16px; border-top: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
                .jarvis-input-box { display: flex; align-items: flex-end; gap: 8px; background: #18181b; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 8px 12px; transition: border-color 0.15s; }
                .jarvis-input-box:focus-within { border-color: #2563eb; }
                .jarvis-textarea { flex: 1; background: none; border: none; color: #fafafa; font-size: 14px; font-family: inherit; resize: none; outline: none; max-height: 120px; line-height: 1.5; }
                .jarvis-textarea::placeholder { color: #3f3f46; }
                .jarvis-send { width: 36px; height: 36px; border-radius: 8px; border: none; background: #2563eb; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s; }
                .jarvis-send:hover { background: #1d4ed8; }
                .jarvis-send:disabled { background: #27272a; color: #52525b; cursor: not-allowed; }
                .jarvis-loading { display: flex; gap: 4px; padding: 12px 16px; }
                .jarvis-dot { width: 6px; height: 6px; border-radius: 50%; background: #2563eb; animation: jarvisBounce 1.2s infinite; }
                .jarvis-dot:nth-child(2) { animation-delay: 0.15s; }
                .jarvis-dot:nth-child(3) { animation-delay: 0.3s; }
                @keyframes jarvisBounce { 0%,80%,100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }
                .jarvis-footer { padding: 0 24px 8px; text-align: center; }
                .jarvis-footer-text { font-size: 10px; color: #27272a; }
            `}</style>

            <div className="jarvis-page">
                {/* Header */}
                <div className="jarvis-header">
                    <div className="jarvis-logo">{'\u{1F916}'}</div>
                    <div>
                        <div className="jarvis-title">JARVIS</div>
                        <div className="jarvis-subtitle">AI Sales Director — Wedits CRM</div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {agentRunning && (
                            <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', animation: 'jarvisBounce 1s infinite' }} />
                                EXECUTING
                            </span>
                        )}
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: agentRunning ? '#f59e0b' : '#22c55e' }} />
                        <span style={{ fontSize: 11, color: agentRunning ? '#f59e0b' : '#22c55e', fontWeight: 600 }}>
                            {agentRunning ? 'Working...' : 'Online'}
                        </span>
                    </div>
                </div>

                {/* Messages */}
                <div className="jarvis-messages">
                    {messages.length === 0 ? (
                        <div className="jarvis-empty">
                            <div style={{ fontSize: 56 }}>{'\u{1F916}'}</div>
                            <div className="jarvis-empty-title">What can I do for you?</div>
                            <div className="jarvis-empty-sub">
                                I have full access to your CRM — 12,695 contacts, revenue data, pipeline stats, email history. Ask me anything or tell me to take action.
                            </div>
                            <div className="jarvis-suggestions">
                                {(mode === 'agent' ? AGENT_SUGGESTIONS : CHAT_SUGGESTIONS).map((s: string) => (
                                    <button key={s} className="jarvis-suggestion" onClick={() => mode === 'agent' ? runAgent(s) : sendMessage(s)}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            {messages.map((msg, i) => (
                                <div key={i} className={`msg msg-${msg.role}`}>
                                    {msg.content}
                                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                                        <div className="msg-tools">
                                            {msg.toolsUsed.map((t, j) => (
                                                <span key={j} className="msg-tool-badge">{t.replace(/_/g, ' ')}</span>
                                            ))}
                                        </div>
                                    )}
                                    <div className="msg-time">
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="msg msg-assistant">
                                    <div className="jarvis-loading">
                                        <div className="jarvis-dot" /><div className="jarvis-dot" /><div className="jarvis-dot" />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* Input */}
                <div className="jarvis-input-wrap">
                    <div className="jarvis-input-box">
                        {/* Mode Toggle */}
                        <button onClick={() => setMode(m => m === 'chat' ? 'agent' : 'chat')} style={{
                            background: mode === 'agent' ? '#7c3aed' : '#27272a', border: 'none', borderRadius: 6,
                            padding: '6px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                            color: mode === 'agent' ? '#fff' : '#71717a', letterSpacing: '.04em', transition: 'all .15s',
                        }} title={mode === 'agent' ? 'Agent Mode — autonomous execution' : 'Chat Mode — Q&A'}>
                            {mode === 'agent' ? '\u{1F916} AGENT' : '\u{1F4AC} CHAT'}
                        </button>
                        <textarea
                            ref={inputRef}
                            className="jarvis-textarea"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={mode === 'agent' ? 'Set a goal for Jarvis to execute autonomously...' : 'Ask Jarvis anything about your CRM...'}
                            rows={1}
                            disabled={loading}
                        />
                        <button className="jarvis-send" onClick={handleSubmit} disabled={loading || !input.trim()}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="jarvis-footer">
                    <span className="jarvis-footer-text">Powered by Llama 3.3 70B via Groq — Full CRM access with 12 tools</span>
                </div>
            </div>
        </>
    );
}
