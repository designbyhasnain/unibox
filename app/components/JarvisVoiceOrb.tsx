'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

export default function JarvisVoiceOrb() {
    const [open, setOpen] = useState(false);
    const [phase, setPhase] = useState<Phase>('idle');
    const [transcript, setTranscript] = useState('');
    const recognitionRef = useRef<any>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const messagesRef = useRef<{ role: string; content: string }[]>([]);
    const animFrameRef = useRef<number>(0);
    const [pulseScale, setPulseScale] = useState(1);

    // Animate pulse based on phase
    useEffect(() => {
        let active = true;
        const animate = () => {
            if (!active) return;
            if (phase === 'listening') {
                setPulseScale(1 + Math.sin(Date.now() / 200) * 0.15 + Math.random() * 0.1);
            } else if (phase === 'speaking') {
                setPulseScale(1 + Math.sin(Date.now() / 150) * 0.2 + Math.random() * 0.15);
            } else if (phase === 'thinking') {
                setPulseScale(1 + Math.sin(Date.now() / 400) * 0.08);
            } else {
                setPulseScale(1);
            }
            animFrameRef.current = requestAnimationFrame(animate);
        };
        if (open) animate();
        return () => { active = false; cancelAnimationFrame(animFrameRef.current); };
    }, [phase, open]);

    const startListening = useCallback(() => {
        const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        if (!SR) return;

        const recognition = new SR();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => setPhase('listening');
        recognition.onresult = (e: any) => {
            const text = Array.from(e.results).map((r: any) => r[0].transcript).join('');
            setTranscript(text);
        };
        recognition.onend = () => {
            setPhase('idle');
            const text = transcript;
            // Use setTimeout to get latest transcript from closure
            setTimeout(() => {
                const el = document.getElementById('jvo-transcript');
                const finalText = el?.textContent || text;
                if (finalText?.trim()) sendToJarvis(finalText.trim());
            }, 100);
        };
        recognition.onerror = () => setPhase('idle');

        recognitionRef.current = recognition;
        setTranscript('');
        recognition.start();
    }, [transcript]);

    const stopListening = useCallback(() => {
        recognitionRef.current?.stop();
    }, []);

    const sendToJarvis = async (text: string) => {
        setPhase('thinking');
        setTranscript('');

        messagesRef.current.push({ role: 'user', content: text });
        // Keep last 8 messages for context
        if (messagesRef.current.length > 8) messagesRef.current = messagesRef.current.slice(-8);

        try {
            const res = await fetch('/api/jarvis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: messagesRef.current }),
            });
            const data = await res.json();
            const reply = data.reply || data.error || 'No response';

            messagesRef.current.push({ role: 'assistant', content: reply });
            speakResponse(reply);
        } catch {
            setPhase('idle');
        }
    };

    const speakResponse = useCallback(async (text: string) => {
        // Clean text for speech
        const clean = text
            .replace(/\*\*/g, '').replace(/\*/g, '')
            .replace(/#{1,6}\s/g, '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[{}[\]|]/g, '')
            .replace(/\n{2,}/g, '. ').replace(/\n/g, '. ')
            .replace(/\.\s*\./g, '.').trim()
            .slice(0, 1000);

        if (!clean) { setPhase('idle'); return; }
        setPhase('speaking');

        // Try ElevenLabs first
        try {
            const res = await fetch('/api/jarvis/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: clean.slice(0, 800) }),
            });

            if (res.ok) {
                const blob = await res.blob();
                if (blob.size > 500) {
                    const url = URL.createObjectURL(blob);
                    const audio = new Audio(url);
                    audioRef.current = audio;
                    audio.onended = () => { setPhase('idle'); URL.revokeObjectURL(url); };
                    audio.onerror = () => fallbackBrowserTTS(clean);
                    await audio.play();
                    return;
                }
            }
        } catch { /* fall through */ }

        // Fallback to browser TTS
        fallbackBrowserTTS(clean);
    }, []);

    const fallbackBrowserTTS = (text: string) => {
        if (!('speechSynthesis' in window)) { setPhase('idle'); return; }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text.slice(0, 2000));
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.name.includes('Samantha'))
            || voices.find(v => v.name.includes('Google UK English Female'))
            || voices.find(v => v.lang.startsWith('en') && v.localService)
            || voices[0];
        if (voice) utterance.voice = voice;
        utterance.onend = () => setPhase('idle');
        utterance.onerror = () => setPhase('idle');
        window.speechSynthesis.speak(utterance);
    };

    const handleOrbClick = () => {
        if (phase === 'listening') {
            stopListening();
        } else if (phase === 'speaking') {
            audioRef.current?.pause();
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            setPhase('idle');
        } else if (phase === 'idle') {
            startListening();
        }
        // If thinking, do nothing — wait for response
    };

    const handleClose = () => {
        stopListening();
        audioRef.current?.pause();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        setPhase('idle');
        setOpen(false);
        setTranscript('');
    };

    // Preload voices
    useEffect(() => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.getVoices();
            window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
        }
    }, []);

    const PHASE_CONFIG = {
        idle: { color: '#0ea5e9', glow: 'rgba(14,165,233,.3)', label: 'Tap to speak', sublabel: '' },
        listening: { color: '#ef4444', glow: 'rgba(239,68,68,.4)', label: 'Listening...', sublabel: '' },
        thinking: { color: '#f59e0b', glow: 'rgba(245,158,11,.3)', label: 'Thinking...', sublabel: '' },
        speaking: { color: '#22c55e', glow: 'rgba(34,197,94,.4)', label: 'Speaking...', sublabel: 'Tap to stop' },
    };

    const cfg = PHASE_CONFIG[phase];

    return (
        <>
            <style>{`
.jvo-trigger{position:fixed;top:16px;right:16px;z-index:9999;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#7c3aed);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 20px rgba(14,165,233,.3);transition:transform .2s,box-shadow .2s}
.jvo-trigger:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(14,165,233,.5)}
.jvo-trigger-pulse{position:absolute;inset:-4px;border-radius:50%;border:2px solid rgba(14,165,233,.4);animation:jvoPulse 2s ease infinite}
@keyframes jvoPulse{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.8;transform:scale(1.15)}}

.jvo-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.jvo-close{position:absolute;top:24px;right:24px;background:none;border:1px solid rgba(255,255,255,.1);color:#71717a;width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;transition:all .15s}
.jvo-close:hover{border-color:rgba(255,255,255,.3);color:#fff}

.jvo-orb-container{position:relative;width:200px;height:200px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.jvo-orb{width:120px;height:120px;border-radius:50%;transition:background .3s}
.jvo-orb-glow{position:absolute;width:180px;height:180px;border-radius:50%;filter:blur(40px);transition:background .3s,opacity .3s}
.jvo-orb-ring{position:absolute;width:150px;height:150px;border-radius:50%;border:2px solid;opacity:.3;transition:border-color .3s}
.jvo-orb-ring2{position:absolute;width:180px;height:180px;border-radius:50%;border:1px solid;opacity:.15;transition:border-color .3s}

.jvo-label{margin-top:40px;text-align:center}
.jvo-label-main{font-size:16px;font-weight:500;color:#e4e4e7;letter-spacing:-.01em}
.jvo-label-sub{font-size:12px;color:#52525b;margin-top:4px}

.jvo-transcript{position:absolute;bottom:120px;left:50%;transform:translateX(-50%);font-size:14px;color:#a1a1aa;max-width:400px;text-align:center;line-height:1.5;opacity:.8}

.jvo-brand{position:absolute;bottom:32px;font-size:11px;color:#27272a;letter-spacing:.05em}
            `}</style>

            {/* Floating trigger button — visible on every page */}
            {!open && (
                <button className="jvo-trigger" onClick={() => setOpen(true)} title="Talk to Jarvis">
                    <div className="jvo-trigger-pulse" />
                    {'\u{1F916}'}
                </button>
            )}

            {/* Full-screen voice overlay */}
            {open && (
                <div className="jvo-overlay">
                    <button className="jvo-close" onClick={handleClose}>{'\u2715'}</button>

                    <div className="jvo-orb-container" onClick={handleOrbClick} style={{ transform: `scale(${pulseScale})` }}>
                        <div className="jvo-orb-glow" style={{ background: cfg.glow, opacity: phase === 'idle' ? 0.3 : 0.6 }} />
                        <div className="jvo-orb-ring2" style={{ borderColor: cfg.color }} />
                        <div className="jvo-orb-ring" style={{ borderColor: cfg.color }} />
                        <div className="jvo-orb" style={{ background: `radial-gradient(circle at 40% 40%, ${cfg.color}, ${cfg.color}88)` }} />
                    </div>

                    <div className="jvo-label">
                        <div className="jvo-label-main">{cfg.label}</div>
                        {cfg.sublabel && <div className="jvo-label-sub">{cfg.sublabel}</div>}
                    </div>

                    {transcript && (
                        <div className="jvo-transcript" id="jvo-transcript">{transcript}</div>
                    )}

                    <div className="jvo-brand">JARVIS AI</div>
                </div>
            )}
        </>
    );
}
