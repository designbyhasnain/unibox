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
            // Almost-imperceptible breathing — feels alive without dancing.
            // Rule of thumb: amplitudes ≤ 0.025, periods ≥ 1 s, no random
            // jitter (jitter reads as anxious, not refined). Apple-grade
            // motion is restraint, not energy.
            const t = Date.now();
            if (phase === 'listening') {
                // Subtle inhale ~1.4 s cycle, ±2.0%
                setPulseScale(1 + Math.sin(t / 700) * 0.02);
            } else if (phase === 'speaking') {
                // Slightly more (it IS doing something), ~1.1 s cycle, ±2.5%
                setPulseScale(1 + Math.sin(t / 550) * 0.025);
            } else if (phase === 'thinking') {
                // Slowest of all, ~1.8 s cycle, ±1.2%
                setPulseScale(1 + Math.sin(t / 900) * 0.012);
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
        // continuous=true so the recognizer doesn't end on the first natural
        // pause. We do our own end-of-utterance detection: track time since
        // the last incoming result and call .stop() after a sustained quiet
        // window. Brief mid-sentence pauses ("uh, the email from… *breath*…
        // Josh") no longer trigger a premature send.
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        const SILENCE_MS = 2500;          // hold time after the last result event
        let silenceTimer: any = null;
        const restartSilenceTimer = () => {
            if (silenceTimer) clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
                try { recognition.stop(); } catch {}
            }, SILENCE_MS);
        };

        recognition.onstart = () => {
            setPhase('listening');
            restartSilenceTimer();
        };
        recognition.onresult = (e: any) => {
            const text = Array.from(e.results).map((r: any) => r[0].transcript).join('');
            setTranscript(text);
            restartSilenceTimer();
        };
        recognition.onend = () => {
            if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
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
        // Idle = brand identity (matches the trigger orb). Listening shares
        // the same violet — the user wants the orb to stay visually still
        // while it works. The functional cue is the label + transcript,
        // not a colour jump.
        // "Thinking" is intentionally indistinguishable from listening
        // (same colour + glow). The user wanted the post-stop wait to feel
        // continuous with listening, not a separate amber stage. Only
        // "speaking" picks up the green to mark the orb is now talking back.
        idle: { color: '#8b5cf6', glow: 'rgba(124,58,237,.35)', label: 'Tap to speak', sublabel: '' },
        listening: { color: '#a78bfa', glow: 'rgba(167,139,250,.42)', label: 'Listening', sublabel: '' },
        thinking: { color: '#a78bfa', glow: 'rgba(167,139,250,.42)', label: 'Working…', sublabel: '' },
        speaking: { color: '#22c55e', glow: 'rgba(34,197,94,.38)', label: 'Speaking', sublabel: 'Tap to stop' },
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

.jvo-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.42);backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased;animation:jvoOverlayFade .18s ease forwards}
@keyframes jvoOverlayFade{from{background:transparent;backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px)}to{background:rgba(0,0,0,.42);backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%)}}
.jvo-close{position:absolute;top:24px;right:24px;background:none;border:1px solid rgba(255,255,255,.1);color:#71717a;width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;transition:all .15s}
.jvo-close:hover{border-color:rgba(255,255,255,.3);color:#fff}

.jvo-orb-container{position:relative;width:220px;height:220px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .6s cubic-bezier(.16,1,.3,1)}
/* Layered orb: base sphere + specular highlight + inner depth shadow.
   Apple's voice-orb language reads as a polished pearl, not a flat
   disk. --orb-color is set inline from the phase config so colour
   transitions are smooth across phases. */
.jvo-orb{
    width:104px;height:104px;border-radius:50%;
    background:
        radial-gradient(circle at 32% 26%, rgba(255,255,255,.42) 0%, rgba(255,255,255,0) 38%),
        radial-gradient(circle at 50% 55%, var(--orb-color, #8b5cf6) 0%, color-mix(in oklab, var(--orb-color, #8b5cf6), black 35%) 100%);
    box-shadow:
        inset 0 1px 1px rgba(255,255,255,.28),
        inset 0 -14px 22px color-mix(in oklab, var(--orb-color, #8b5cf6), black 55%),
        0 0 0 1px rgba(255,255,255,.06);
    transition:background .5s cubic-bezier(.16,1,.3,1), box-shadow .5s ease;
}
/* Diffuse halo — softer + less opaque than before. The orb itself is
   the visual; the halo is just ambient. */
.jvo-orb-glow{position:absolute;width:200px;height:200px;border-radius:50%;filter:blur(48px);opacity:.45;transition:background .5s ease,opacity .5s ease;pointer-events:none}
/* One hairline ring (was two — second one read as clutter). */
.jvo-orb-ring{position:absolute;width:152px;height:152px;border-radius:50%;border:1px solid;opacity:.14;transition:border-color .5s ease,opacity .5s ease;pointer-events:none}

.jvo-label{margin-top:48px;text-align:center;animation:jvoLabelFade .45s cubic-bezier(.16,1,.3,1) both}
.jvo-label-main{font-size:17px;font-weight:500;color:#f4f4f5;letter-spacing:-.015em}
.jvo-label-sub{font-size:12.5px;color:#71717a;margin-top:5px;letter-spacing:-.005em}
@keyframes jvoLabelFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}

.jvo-transcript{position:absolute;bottom:140px;left:50%;transform:translateX(-50%);font-size:14.5px;color:#d4d4d8;max-width:520px;text-align:center;line-height:1.55;opacity:.92;letter-spacing:-.005em;padding:0 24px}
.jvo-error{margin-top:18px;max-width:420px;padding:10px 14px;border-radius:10px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.32);color:#fca5a5;font-size:12.5px;line-height:1.5;text-align:center;letter-spacing:-.005em}

.jvo-brand{position:absolute;bottom:36px;font-size:10px;color:rgba(255,255,255,.18);letter-spacing:.18em;text-transform:uppercase;font-weight:500}
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
                        <div className="jvo-orb-glow" style={{ background: cfg.glow, opacity: phase === 'idle' ? 0.32 : 0.55 }} />
                        <div className="jvo-orb-ring" style={{ borderColor: cfg.color }} />
                        {/* Phase colour drives the orb gradient via a CSS
                            custom property — keeps the layered styling in
                            CSS and lets the colour transition smoothly. */}
                        <div className="jvo-orb" style={{ ['--orb-color' as any]: cfg.color }} />
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
