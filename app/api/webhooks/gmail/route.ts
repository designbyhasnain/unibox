import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { supabase } from '../../../../src/lib/supabase';
import { syncAccountHistory } from '../../../../src/services/gmailSyncService';

const oauthClient = new OAuth2Client();

/**
 * Webhook receiver for Google Cloud Pub/Sub Push Notifications.
 * Google will hit this URL every time there is a new email or change in the watched Gmail account.
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
            console.log('[Webhook] Stale message, ignoring');
            return NextResponse.json({ ok: true }); // Ack to prevent redelivery
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

        console.log(`[Webhook] Push received for historyId ${newHistoryId}`);

        // Find the matching account in our database (normalize email for lookup)
        const normalizedEmail = String(emailAddress).toLowerCase().trim();
        const { data: account, error } = await supabase
            .from('gmail_accounts')
            .select('id, status')
            .eq('email', normalizedEmail)
            .single();

        if (error || !account) {
            console.error('[Webhook] Account not found for incoming push');
            // Acknowledge anyway so Google stops retrying
            return NextResponse.json({ success: true });
        }

        // Trigger the specific history sync asynchronously so we can quickly ack the webhook (HTTP 200)
        syncAccountHistory(account.id, String(newHistoryId)).catch(err => {
            console.error(`[Webhook Background Sync Error]:`, err?.message);
        });

        // Acknowledge the notification successfully
        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('[PubSub Webhook Error]', error);
        // Return 200 to acknowledge receipt and prevent Google Pub/Sub from retrying
        // indefinitely on permanently malformed payloads
        return NextResponse.json({ error: 'Acknowledged with error' }, { status: 200 });
    }
}
