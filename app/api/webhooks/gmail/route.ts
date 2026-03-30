import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { supabase } from '../../../../src/lib/supabase';

const oauthClient = new OAuth2Client();

/**
 * Webhook receiver for Google Cloud Pub/Sub Push Notifications.
 * Writes to webhook_events table for reliable deferred processing.
 * Returns 200 immediately — never calls syncAccountHistory directly.
 */
export async function POST(request: NextRequest) {
    try {
        // ── Verify Google Pub/Sub OIDC token ──────────────────────────────────
        const authHeader = request.headers.get('authorization');
        if (!authHeader) {
            console.error('[Webhook] Missing Authorization header');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        {
            const token = authHeader.replace('Bearer ', '');
            try {
                const ticket = await oauthClient.verifyIdToken({
                    idToken: token,
                    audience: process.env.GOOGLE_PUBSUB_AUDIENCE || process.env.NEXT_PUBLIC_APP_URL,
                });
                const payload = ticket.getPayload();
                if (!payload?.email_verified || !payload.email?.endsWith('gserviceaccount.com')) {
                    console.error('[Webhook] Invalid token issuer');
                    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
                }
            } catch (err) {
                console.error('[Webhook] Token verification failed:', err);
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }
        }

        const body = await request.json();

        // ── Reject stale messages ─────────────────────────────────────────────
        const messageAge = Date.now() - new Date(body.message?.publishTime || body.message?.publish_time).getTime();
        if (messageAge > 5 * 60 * 1000) {
            return NextResponse.json({ ok: true }); // Ack stale
        }

        // Google Pub/Sub sends data in the message.data field as a base64url encoded JSON string
        const base64Data = body.message?.data;
        if (!base64Data) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
        const payload = JSON.parse(decodedData);

        const emailAddress = payload.emailAddress;
        const newHistoryId = payload.historyId;

        if (!emailAddress || !newHistoryId) {
            return NextResponse.json({ error: 'Missing email or historyId' }, { status: 400 });
        }

        // Validate historyId is a numeric string
        if (typeof newHistoryId !== 'string' && typeof newHistoryId !== 'number') {
            return NextResponse.json({ error: 'Invalid historyId' }, { status: 400 });
        }

        // ── Write to webhook_events for deferred processing ──────────────────
        const normalizedEmail = String(emailAddress).toLowerCase().trim();

        await supabase
            .from('webhook_events')
            .insert({
                source: 'GMAIL_PUBSUB',
                payload: payload,
                email_address: normalizedEmail,
                history_id: String(newHistoryId),
                status: 'PENDING',
                attempts: 0,
                max_attempts: 5,
                updated_at: new Date().toISOString(),
            });

        // Acknowledge immediately — sync is deferred to cron processor
        return NextResponse.json({ success: true });

    } catch (error: unknown) {
        console.error('[PubSub Webhook Error]', error);
        // Return 200 to acknowledge receipt and prevent Google Pub/Sub from retrying
        return NextResponse.json({ error: 'Acknowledged with error' }, { status: 200 });
    }
}
