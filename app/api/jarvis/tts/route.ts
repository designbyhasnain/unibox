import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../src/lib/auth';

// Sarah — mature, reassuring, confident voice
const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // VIDEO_EDITOR doesn't use Jarvis TTS — gate to avoid burning ElevenLabs
    // credits on accidental calls from a misrouted page.
    if (session.role === 'VIDEO_EDITOR') {
        return NextResponse.json({ error: 'TTS not available for this role' }, { status: 403 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        // ElevenLabs not configured — client should fall back to browser TTS
        return NextResponse.json(
            { error: 'TTS not configured. Use browser voice instead.' },
            { status: 501 }
        );
    }

    const { text, voiceId } = await req.json();
    if (!text || text.trim().length === 0) {
        return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // Limit text length to avoid excessive API usage
    const truncated = text.slice(0, 2000);

    const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || DEFAULT_VOICE_ID}`,
        {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': apiKey,
            },
            body: JSON.stringify({
                text: truncated,
                // Turbo v2.5 — ~2× faster TTFB than multilingual_v2, same
                // English quality. Voice mode latency was the #1 complaint.
                // optimize_streaming_latency cranks the engine to its
                // lowest-latency setting (some quality cost, but for short
                // 1-2 sentence replies — what we now ask for in the system
                // prompt — it's imperceptible).
                model_id: 'eleven_turbo_v2_5',
                optimize_streaming_latency: 3,
                voice_settings: {
                    stability: 0.45,
                    similarity_boost: 0.75,
                    style: 0.25,
                    use_speaker_boost: true,
                },
            }),
        }
    );

    if (!response.ok) {
        const errText = await response.text();
        console.error('[TTS] ElevenLabs error:', response.status, errText.slice(0, 300));
        return NextResponse.json({ error: 'TTS generation failed' }, { status: 502 });
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
        status: 200,
        headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': String(audioBuffer.byteLength),
            'Cache-Control': 'no-store',
        },
    });
}
