'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

const ORB_SIZE = 32;
const ORB_PADDING = 12; // viewport edge gutter
const POS_KEY = 'unibox_jvo_position';

function clampToViewport(x: number, y: number) {
    if (typeof window === 'undefined') return { x, y };
    const maxX = window.innerWidth - ORB_SIZE - ORB_PADDING;
    const maxY = window.innerHeight - ORB_SIZE - ORB_PADDING;
    return {
        x: Math.max(ORB_PADDING, Math.min(maxX, x)),
        y: Math.max(ORB_PADDING, Math.min(maxY, y)),
    };
}

export default function JarvisVoiceOrb() {
    const [open, setOpen] = useState(false);
    const [phase, setPhase] = useState<Phase>('idle');
    const [transcript, setTranscript] = useState('');
    // Surface failures (no SR API, denied mic, no-speech, etc.) so a tap that
    // does nothing doesn't *look* like nothing. Cleared on the next attempt.
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const messagesRef = useRef<{ role: string; content: string }[]>([]);
    const animFrameRef = useRef<number>(0);
    const [pulseScale, setPulseScale] = useState(1);

    // Drag state. Position is loaded from localStorage in a post-mount effect
    // so server-rendered HTML doesn't disagree with the client. Until mount we
    // hide the trigger entirely (see render below) — same shape both sides.
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const draggingRef = useRef(false);
    const dragStartRef = useRef({ pointerX: 0, pointerY: 0, originX: 0, originY: 0, moved: false });
    const positionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // Hydrate position once we know the viewport size.
    useEffect(() => {
        let initial: { x: number; y: number } | null = null;
        try {
            const saved = localStorage.getItem(POS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') initial = parsed;
            }
        } catch {}
        if (!initial) {
            // Default: top-right, where the old hardcoded `top:16px; right:16px` placed it.
            initial = { x: window.innerWidth - ORB_SIZE - 16, y: 16 };
        }
        const clamped = clampToViewport(initial.x, initial.y);
        positionRef.current = clamped;
        setPosition(clamped);

        // Re-clamp if the viewport shrinks (rotation, browser resize) so the
        // orb never strands itself off-screen.
        const onResize = () => {
            const next = clampToViewport(positionRef.current.x, positionRef.current.y);
            if (next.x !== positionRef.current.x || next.y !== positionRef.current.y) {
                positionRef.current = next;
                setPosition(next);
            }
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const onTriggerPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!position) return;
        draggingRef.current = true;
        dragStartRef.current = {
            pointerX: e.clientX,
            pointerY: e.clientY,
            originX: position.x,
            originY: position.y,
            moved: false,
        };
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    };

    const onTriggerPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!draggingRef.current) return;
        const dx = e.clientX - dragStartRef.current.pointerX;
        const dy = e.clientY - dragStartRef.current.pointerY;
        // 4 px deadzone — under this we still treat a pointerup as a click.
        if (!dragStartRef.current.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            dragStartRef.current.moved = true;
        }
        if (!dragStartRef.current.moved) return;
        const next = clampToViewport(
            dragStartRef.current.originX + dx,
            dragStartRef.current.originY + dy,
        );
        positionRef.current = next;
        setPosition(next);
    };

    const onTriggerPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
        if (dragStartRef.current.moved) {
            // Persist the new resting spot.
            try { localStorage.setItem(POS_KEY, JSON.stringify(positionRef.current)); } catch {}
        } else {
            // No real drag — treat as a click and open the voice overlay.
            setOpen(true);
        }
    };

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

    const startListening = useCallback(async () => {
        setVoiceError(null);
        const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        if (!SR) {
            setVoiceError('Voice input needs Chrome, Edge, or Safari — this browser does not support the SpeechRecognition API.');
            return;
        }
        if (typeof window !== 'undefined' && !window.isSecureContext) {
            setVoiceError('Voice input needs HTTPS. Open this page over https:// or localhost.');
            return;
        }

        // Explicitly request mic access BEFORE starting SpeechRecognition.
        // SR.start() doesn't reliably trigger the macOS / browser permission
        // prompt — getUserMedia does. Once permission is granted (or already
        // remembered from a previous grant), we drop the stream immediately
        // since SR opens its own internal mic handle.
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
            try {
                setPhase('thinking'); // visual feedback while the OS prompt is up
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
                setPhase('idle');
            } catch (err: any) {
                setPhase('idle');
                const name = err?.name || '';
                const message =
                    name === 'NotAllowedError' || name === 'SecurityError'
                        ? 'Microphone permission denied. On macOS, also check System Settings → Privacy & Security → Microphone and allow your browser.'
                    : name === 'NotFoundError' || name === 'OverconstrainedError'
                        ? 'No microphone found. Plug one in or check System Settings → Sound → Input.'
                    : name === 'NotReadableError'
                        ? 'Microphone is in use by another app. Close other apps that might have the mic open.'
                    : `Could not access microphone: ${err?.message || name || err}`;
                setVoiceError(message);
                return;
            }
        }

        let recognition: any;
        try {
            recognition = new SR();
        } catch (err: any) {
            setVoiceError(`Could not start voice input: ${err?.message || err}`);
            return;
        }
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
            setTimeout(() => {
                const el = document.getElementById('jvo-transcript');
                const finalText = el?.textContent || text;
                if (finalText?.trim()) sendToJarvis(finalText.trim());
            }, 100);
        };
        recognition.onerror = (e: any) => {
            setPhase('idle');
            const code = (e?.error || '').toString();
            const message =
                code === 'not-allowed' ? 'Microphone access blocked. Allow mic permission in your browser settings and try again.' :
                code === 'service-not-allowed' ? 'Voice input is disabled for this site. Check browser site settings.' :
                code === 'audio-capture' ? 'No microphone found. Plug one in or check OS audio settings.' :
                code === 'no-speech' ? 'No speech detected — try again and speak after the orb glows red.' :
                code === 'network' ? 'Network error reaching the voice service. Check your connection.' :
                code === 'aborted' ? null :
                `Voice input failed (${code || 'unknown error'}).`;
            if (message) setVoiceError(message);
        };

        recognitionRef.current = recognition;
        setTranscript('');
        try {
            recognition.start();
        } catch (err: any) {
            setPhase('idle');
            setVoiceError(`Could not start microphone: ${err?.message || err}`);
        }
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
        setVoiceError(null);
    };

    // Preload voices
    useEffect(() => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.getVoices();
            window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
        }
    }, []);

    const PHASE_CONFIG = {
        // Idle = brand identity (matches the trigger orb). Other phases keep
        // functional state colours so the rep can see at a glance what the
        // orb is doing without reading the label.
        idle: { color: '#8b5cf6', glow: 'rgba(124,58,237,.35)', label: 'Tap to speak', sublabel: '' },
        listening: { color: '#ef4444', glow: 'rgba(239,68,68,.4)', label: 'Listening...', sublabel: '' },
        thinking: { color: '#f59e0b', glow: 'rgba(245,158,11,.3)', label: 'Thinking...', sublabel: '' },
        speaking: { color: '#22c55e', glow: 'rgba(34,197,94,.4)', label: 'Speaking...', sublabel: 'Tap to stop' },
    };

    const cfg = PHASE_CONFIG[phase];

    return (
        <>
            <style>{`
.jvo-trigger{position:fixed;z-index:9999;width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#a78bfa 0%,#8b5cf6 45%,#6d28d9 100%);border:none;cursor:grab;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 14px rgba(124,58,237,.32);transition:transform .2s,box-shadow .2s;touch-action:none;user-select:none}
.jvo-trigger:active{cursor:grabbing}
.jvo-trigger:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(124,58,237,.55)}
/* Invisible expanded hit area — 32 px is small for touch, so we stretch
   the clickable surface to ~48 px without enlarging the visible orb.
   Child of the button so events bubble up; pointer-events:auto so the
   pseudo-element captures taps on the surrounding margin. */
.jvo-trigger::before{content:"";position:absolute;inset:-8px;border-radius:50%;pointer-events:auto}
/* Subtle heartbeat — two-phase lub-dub with a long rest, ~1.6s cycle.
   Tiny scale delta (max 1.04) so it feels alive without drawing the eye. */
.jvo-trigger-pulse{position:absolute;inset:-2px;border-radius:50%;border:1px solid rgba(167,139,250,.45);animation:jvoHeartbeat 1.6s ease-in-out infinite;will-change:transform,opacity;pointer-events:none}
@keyframes jvoHeartbeat{
    0%   {opacity:.30;transform:scale(1)}
    14%  {opacity:.65;transform:scale(1.04)}
    28%  {opacity:.35;transform:scale(1)}
    42%  {opacity:.55;transform:scale(1.025)}
    56%  {opacity:.30;transform:scale(1)}
    100% {opacity:.30;transform:scale(1)}
}

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
.jvo-error{margin-top:18px;max-width:420px;padding:10px 14px;border-radius:10px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.35);color:#fca5a5;font-size:12.5px;line-height:1.5;text-align:center}

.jvo-brand{position:absolute;bottom:32px;font-size:11px;color:#27272a;letter-spacing:.05em}
            `}</style>

            {/* Floating trigger — draggable, position-persisted. Renders only
                after we've hydrated `position` from localStorage so SSR HTML
                and the first client render agree (no hydration warning).
                Pointer events handle both mouse + touch; a 4 px deadzone
                distinguishes a tap (open overlay) from a drag (move + save). */}
            {!open && position && (
                <button
                    className="jvo-trigger"
                    style={{ left: position.x, top: position.y }}
                    onPointerDown={onTriggerPointerDown}
                    onPointerMove={onTriggerPointerMove}
                    onPointerUp={onTriggerPointerUp}
                    onPointerCancel={onTriggerPointerUp}
                    title="Talk to Jarvis (drag to move)"
                    aria-label="Open Jarvis voice assistant"
                >
                    <div className="jvo-trigger-pulse" />
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

                    {voiceError && (
                        <div className="jvo-error" role="alert">
                            {voiceError}
                        </div>
                    )}

                    {transcript && (
                        <div className="jvo-transcript" id="jvo-transcript">{transcript}</div>
                    )}

                    <div className="jvo-brand">JARVIS AI</div>
                </div>
            )}
        </>
    );
}
