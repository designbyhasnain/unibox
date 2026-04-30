'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useHydrated } from '../utils/useHydration';
import { useUndoToast } from '../context/UndoToastContext';

type Message = {
    role: 'user' | 'assistant';
    content: string;
    toolsUsed?: string[];
    timestamp: Date;
};

const CHAT_SUGGESTIONS = [
    'Good morning, brief me',
    'Show me pipeline breakdown',
    'Who are our top 10 clients?',
    'Revenue last 6 months?',
    'Who owes us money?',
    'How is our financial health?',
    'Should we take a $600 LA project?',
    'AM performance report',
];

const AGENT_SUGGESTIONS = [
    'Book 50 meetings with Australian filmmakers',
    'Collect all unpaid invoices from clients',
    'Find and outreach 200 filmmakers in California',
    'Re-engage all clients who went silent in 30+ days',
    'Build a cold outreach campaign for UK market',
];

export default function JarvisPage() {
    const isHydrated = useHydrated();
    const { showError } = useUndoToast();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<'chat' | 'agent'>('chat');
    const [agentRunning, setAgentRunning] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [ttsMode, setTtsMode] = useState<'browser' | 'elevenlabs'>('browser');
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<any>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Pre-load browser voices
    useEffect(() => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.getVoices();
            window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
        }
    }, []);

    // ── Web Speech API (STT) ──────────────────────────────────────────────
    const startListening = useCallback(() => {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            showError('Voice input requires Chrome — your browser doesn\'t support speech recognition.');
            return;
        }

        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => setIsListening(true);

        recognition.onresult = (event: any) => {
            const transcript = Array.from(event.results)
                .map((result: any) => result[0].transcript)
                .join('');
            setInput(transcript);
        };

        recognition.onend = () => {
            setIsListening(false);
            // Auto-send after speech ends if there's text
            setTimeout(() => {
                const textarea = inputRef.current;
                if (textarea && textarea.value.trim()) {
                    handleSubmitFromVoice(textarea.value.trim());
                }
            }, 300);
        };

        recognition.onerror = () => setIsListening(false);

        recognitionRef.current = recognition;
        recognition.start();
    }, [showError]);

    const stopListening = useCallback(() => {
        recognitionRef.current?.stop();
        setIsListening(false);
    }, []);

    // ── Text-to-Speech (Browser native or ElevenLabs) ────────────────────
    const cleanForSpeech = (text: string) => text
        .replace(/\*\*/g, '').replace(/\*/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[{}[\]|]/g, '')
        .replace(/\n{2,}/g, '. ').replace(/\n/g, '. ')
        .replace(/\.\s*\./g, '.').trim();

    const speakingRef = useRef(false);

    const speakBrowser = useCallback((text: string) => {
        if (!('speechSynthesis' in window)) {
            console.error('[TTS] speechSynthesis not available');
            return;
        }
        window.speechSynthesis.cancel();
        const clean = cleanForSpeech(text).slice(0, 2000);
        if (!clean) { console.error('[TTS] No clean text'); return; }

        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Pick a good voice
        const voices = window.speechSynthesis.getVoices();
        console.log('[TTS] Available voices:', voices.length);
        const preferred = voices.find(v => v.name.includes('Samantha'))
            || voices.find(v => v.name.includes('Google UK English Female'))
            || voices.find(v => v.name.includes('Google US English'))
            || voices.find(v => v.lang.startsWith('en') && v.localService)
            || voices[0];
        if (preferred) {
            utterance.voice = preferred;
            console.log('[TTS] Using voice:', preferred.name);
        }

        speakingRef.current = true;
        setIsSpeaking(true);

        // Animate waveform using ref
        const animateWaveform = () => {
            if (!speakingRef.current) { setAudioLevel(0); return; }
            setAudioLevel(0.3 + Math.random() * 0.7);
            requestAnimationFrame(animateWaveform);
        };

        utterance.onstart = () => {
            console.log('[TTS] Started speaking');
            animateWaveform();
        };
        utterance.onend = () => {
            console.log('[TTS] Finished speaking');
            speakingRef.current = false;
            setIsSpeaking(false);
            setAudioLevel(0);
        };
        utterance.onerror = (e) => {
            console.error('[TTS] Error:', e);
            speakingRef.current = false;
            setIsSpeaking(false);
            setAudioLevel(0);
        };

        window.speechSynthesis.speak(utterance);
        console.log('[TTS] Queued utterance, length:', clean.length);
    }, []);

    const speakElevenLabs = useCallback(async (text: string) => {
        const clean = cleanForSpeech(text).slice(0, 800);
        if (!clean) return;
        setIsSpeaking(true);

        try {
            const res = await fetch('/api/jarvis/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: clean }),
            });
            if (!res.ok) { setIsSpeaking(false); return; }

            const audioBlob = await res.blob();
            if (audioBlob.size < 500) { setIsSpeaking(false); return; }

            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audioRef.current = audio;

            audio.onended = () => { setIsSpeaking(false); setAudioLevel(0); URL.revokeObjectURL(audioUrl); };
            audio.onerror = () => { setIsSpeaking(false); setAudioLevel(0); };

            const animate = () => {
                if (!audioRef.current || audio.paused || audio.ended) { setAudioLevel(0); return; }
                setAudioLevel(0.3 + Math.random() * 0.7);
                requestAnimationFrame(animate);
            };
            audio.onplay = animate;
            await audio.play();
        } catch { setIsSpeaking(false); }
    }, []);

    const speakText = useCallback((text: string) => {
        if (!voiceEnabled) return;
        if (ttsMode === 'elevenlabs') speakElevenLabs(text);
        else speakBrowser(text);
    }, [voiceEnabled, ttsMode, speakBrowser, speakElevenLabs]);

    const stopSpeaking = useCallback(() => {
        speakingRef.current = false;
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
        setAudioLevel(0);
    }, []);

    // ── Send Message ──────────────────────────────────────────────────────
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
            const reply = data.error ? `Error: ${data.error}` : (data.reply || 'No response');

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: reply,
                toolsUsed: data.toolsUsed,
                timestamp: new Date(),
            }]);

            // Speak the response if voice is enabled
            if (voiceEnabled && !data.error) {
                speakText(reply);
            }
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to connect to Jarvis.', timestamp: new Date() }]);
        }
        setLoading(false);
        inputRef.current?.focus();
    };

    const handleSubmitFromVoice = (text: string) => {
        if (mode === 'agent') runAgent(text);
        else sendMessage(text);
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
                const planText = (data.plan || []).map((s: any) =>
                    `${s.status === 'DONE' ? '\u2705' : s.status === 'FAILED' ? '\u274C' : '\u23F3'} Step ${s.id}: ${s.action} \u2014 ${s.description}${s.result ? '\n   \u2192 ' + s.result.slice(0, 200) : ''}`
                ).join('\n\n');

                const reply = `\u{1F4CB} EXECUTION PLAN:\n\n${planText}\n\n---\n\n\u{1F4CA} SUMMARY:\n${data.summary}`;

                setMessages(prev => {
                    const filtered = prev.filter(m => m.content !== '\u{1F9E0} Planning strategy...');
                    return [...filtered, {
                        role: 'assistant', content: reply,
                        toolsUsed: ['agent_mode'], timestamp: new Date(),
                    }];
                });

                if (voiceEnabled && data.summary) speakText(data.summary);
            }
        } catch {
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
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
    };

    if (!isHydrated) return null;

    return (
        <>
            <style>{`
.jv{height:100%;display:flex;flex-direction:column;background:var(--canvas);font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.jv-hd{padding:16px 24px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:12px;flex-shrink:0}
.jv-logo{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent));display:flex;align-items:center;justify-content:center;font-size:20px;position:relative}
.jv-pulse{position:absolute;inset:-3px;border-radius:14px;border:2px solid transparent;animation:jvPulse 2s ease infinite}
.jv-pulse.active{border-color:rgba(14,165,233,.4)}
@keyframes jvPulse{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
.jv-title{font-size:18px;font-weight:800;color:var(--shell);letter-spacing:-.02em}
.jv-sub{font-size:11px;color:var(--ink-2);font-weight:500}
.jv-status{display:flex;align-items:center;gap:6px;margin-left:auto}
.jv-status-dot{width:8px;height:8px;border-radius:50%}
.jv-status-text{font-size:11px;font-weight:600}

/* Voice Controls */
.jv-voice{display:flex;align-items:center;gap:8px;margin-left:12px}
.jv-voice-btn{width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:var(--ink-faint);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;font-size:16px}
.jv-voice-btn:hover{border-color:var(--accent);color:var(--accent);background:rgba(14,165,233,.08)}
.jv-voice-btn.active{border-color:var(--accent);color:var(--accent);background:rgba(14,165,233,.15)}
.jv-voice-btn.listening{border-color:var(--danger);color:var(--danger);background:rgba(239,68,68,.15);animation:jvPulse 1s ease infinite}
.jv-voice-btn.speaking{border-color:var(--coach);color:var(--coach);background:rgba(34,197,94,.15)}

/* Waveform */
.jv-waveform{display:flex;align-items:center;gap:2px;height:24px;padding:0 8px}
.jv-wave-bar{width:3px;border-radius:2px;background:var(--accent);transition:height .1s ease}

/* Messages */
.jv-msgs{flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:16px}
.jv-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px}
.jv-empty-title{font-size:28px;font-weight:800;color:var(--shell);letter-spacing:-.03em}
.jv-empty-sub{font-size:13px;color:var(--ink-2);max-width:420px;text-align:center;line-height:1.6}
.jv-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:640px}
.jv-chip{padding:7px 14px;border-radius:20px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:var(--ink-faint);font-size:12px;cursor:pointer;transition:all .15s;white-space:nowrap}
.jv-chip:hover{border-color:var(--accent);color:var(--accent);background:rgba(14,165,233,.08)}
.msg{max-width:85%;padding:14px 18px;border-radius:14px;font-size:13px;line-height:1.7;white-space:pre-wrap;word-break:break-word}
.msg-user{align-self:flex-end;background:var(--accent);color:#fff;border-bottom-right-radius:4px}
.msg-assistant{align-self:flex-start;background:var(--surface);color:var(--ink);border:1px solid var(--hairline-soft);border-bottom-left-radius:4px}
.msg-tools{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px}
.msg-tool{font-size:9px;padding:2px 8px;border-radius:4px;background:color-mix(in oklab, var(--info), transparent 80%);color:var(--info);font-weight:600;letter-spacing:.03em}
.msg-time{font-size:9px;color:var(--surface-2);margin-top:4px}
.msg-speak{margin-top:6px;background:none;border:1px solid rgba(255,255,255,.1);color:var(--ink-muted);padding:3px 10px;border-radius:6px;font-size:10px;cursor:pointer;transition:all .15s}
.msg-speak:hover{border-color:var(--accent);color:var(--accent)}

/* Input */
.jv-input-wrap{padding:12px 24px 16px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0}
.jv-input-box{display:flex;align-items:flex-end;gap:8px;background:var(--surface);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:8px 12px;transition:border-color .15s}
.jv-input-box:focus-within{border-color:var(--accent)}
.jv-textarea{flex:1;background:none;border:none;color:var(--shell);font-size:14px;font-family:inherit;resize:none;outline:none;max-height:120px;line-height:1.5}
.jv-textarea::placeholder{color:var(--surface-2)}
.jv-mode-btn{background:var(--surface);border:none;border-radius:6px;padding:6px 10px;font-size:10px;font-weight:700;cursor:pointer;flex-shrink:0;letter-spacing:.04em;transition:all .15s}
.jv-send{width:36px;height:36px;border-radius:8px;border:none;background:var(--accent);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s}
.jv-send:hover{background:var(--accent-ink)}
.jv-send:disabled{background:var(--surface);color:var(--ink-2);cursor:not-allowed}
.jv-mic{width:36px;height:36px;border-radius:8px;border:none;background:var(--surface);color:var(--ink-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;font-size:16px}
.jv-mic:hover{background:var(--info);color:#fff}
.jv-mic.listening{background:var(--danger);color:#fff;animation:jvPulse 1s ease infinite}

/* Loading */
.jv-loading{display:flex;gap:4px;padding:14px 18px}
.jv-ldot{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:jvBounce 1.2s infinite}
.jv-ldot:nth-child(2){animation-delay:.15s}
.jv-ldot:nth-child(3){animation-delay:.3s}
@keyframes jvBounce{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1.2)}}

.jv-footer{padding:0 24px 8px;text-align:center}
.jv-footer-text{font-size:10px;color:var(--surface)}
            `}</style>

            <div className="jv">
                {/* Header */}
                <div className="jv-hd">
                    <div className="jv-logo">
                        <div className={`jv-pulse ${isSpeaking || isListening ? 'active' : ''}`} />
                        {'\u{1F916}'}
                    </div>
                    <div>
                        <div className="jv-title">JARVIS</div>
                        <div className="jv-sub">AI Executive Assistant &mdash; Voice + Text</div>
                    </div>

                    {/* Voice Controls */}
                    <div className="jv-voice">
                        <button
                            className={`jv-voice-btn ${voiceEnabled ? 'active' : ''}`}
                            onClick={() => { setVoiceEnabled(!voiceEnabled); if (isSpeaking) stopSpeaking(); }}
                            title={voiceEnabled ? 'Disable voice output' : 'Enable voice output'}
                        >
                            {voiceEnabled ? '\u{1F50A}' : '\u{1F507}'}
                        </button>
                        {voiceEnabled && (
                            <button
                                className="jv-voice-btn"
                                onClick={() => setTtsMode(m => m === 'browser' ? 'elevenlabs' : 'browser')}
                                title={ttsMode === 'browser' ? 'Using: Browser voice (free). Click for ElevenLabs.' : 'Using: ElevenLabs (premium). Click for browser voice.'}
                                style={{ fontSize: 10, fontWeight: 700, width: 'auto', padding: '0 10px' }}
                            >
                                {ttsMode === 'browser' ? 'LOCAL' : 'AI'}
                            </button>
                        )}
                        {isSpeaking && (
                            <>
                                <div className="jv-waveform">
                                    {[...Array(8)].map((_, i) => (
                                        <div key={i} className="jv-wave-bar" style={{
                                            height: `${4 + audioLevel * 20 * (0.5 + Math.random() * 0.5)}px`,
                                        }} />
                                    ))}
                                </div>
                                <button className="jv-voice-btn speaking" onClick={stopSpeaking} title="Stop speaking">
                                    {'\u23F9'}
                                </button>
                            </>
                        )}
                    </div>

                    <div className="jv-status">
                        {agentRunning && (
                            <span style={{ fontSize: 10, color: 'var(--warn)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)', animation: 'jvBounce 1s infinite' }} />
                                EXECUTING
                            </span>
                        )}
                        <div className="jv-status-dot" style={{ background: isListening ? 'var(--danger)' : isSpeaking ? 'var(--accent)' : agentRunning ? 'var(--warn)' : 'var(--coach)' }} />
                        <span className="jv-status-text" style={{ color: isListening ? 'var(--danger)' : isSpeaking ? 'var(--accent)' : agentRunning ? 'var(--warn)' : 'var(--coach)' }}>
                            {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : agentRunning ? 'Working...' : 'Online'}
                        </span>
                    </div>
                </div>

                {/* Messages */}
                <div className="jv-msgs">
                    {messages.length === 0 ? (
                        <div className="jv-empty">
                            <div style={{ fontSize: 56 }}>{'\u{1F916}'}</div>
                            <div className="jv-empty-title">How can I help?</div>
                            <div className="jv-empty-sub">
                                I&apos;m your AI executive assistant with full CRM access &mdash; 12,695 contacts, revenue data, pipeline stats. Ask me anything, or tap the mic to talk.
                            </div>
                            <div className="jv-chips">
                                {(mode === 'agent' ? AGENT_SUGGESTIONS : CHAT_SUGGESTIONS).map((s: string) => (
                                    <button key={s} className="jv-chip" onClick={() => mode === 'agent' ? runAgent(s) : sendMessage(s)}>
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
                                    {msg.role === 'assistant' && voiceEnabled && !loading && (
                                        <button className="msg-speak" onClick={() => speakText(msg.content)}>
                                            {'\u{1F50A}'} Play
                                        </button>
                                    )}
                                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                                        <div className="msg-tools">
                                            {msg.toolsUsed.map((t, j) => (
                                                <span key={j} className="msg-tool">{t.replace(/_/g, ' ')}</span>
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
                                    <div className="jv-loading">
                                        <div className="jv-ldot" /><div className="jv-ldot" /><div className="jv-ldot" />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* Input */}
                <div className="jv-input-wrap">
                    <div className="jv-input-box">
                        <button
                            className="jv-mode-btn"
                            onClick={() => setMode(m => m === 'chat' ? 'agent' : 'chat')}
                            style={{ background: mode === 'agent' ? 'var(--accent)' : 'var(--surface)', color: mode === 'agent' ? '#fff' : 'var(--ink-muted)' }}
                            title={mode === 'agent' ? 'Agent Mode' : 'Chat Mode'}
                        >
                            {mode === 'agent' ? '\u{1F916} AGENT' : '\u{1F4AC} CHAT'}
                        </button>
                        <textarea
                            ref={inputRef}
                            className="jv-textarea"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={isListening ? 'Listening...' : mode === 'agent' ? 'Set a goal for Jarvis...' : 'Ask Jarvis anything...'}
                            rows={1}
                            disabled={loading}
                        />
                        <button
                            className={`jv-mic ${isListening ? 'listening' : ''}`}
                            onClick={isListening ? stopListening : startListening}
                            title={isListening ? 'Stop listening' : 'Start voice input'}
                        >
                            {isListening ? '\u23F9' : '\u{1F3A4}'}
                        </button>
                        <button className="jv-send" onClick={handleSubmit} disabled={loading || !input.trim()}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="jv-footer">
                    <span className="jv-footer-text">Powered by Groq (Llama 3.3 70B) + ElevenLabs &mdash; 18 CRM tools &bull; Voice + Text</span>
                </div>
            </div>
        </>
    );
}
