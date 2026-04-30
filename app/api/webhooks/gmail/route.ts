import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { supabase } from '../../../../src/lib/supabase';
import { syncAccountHistory } from '../../../../src/services/gmailSyncService';

// Google Pub/Sub push subscriptions sign each delivery with a service-account
// OIDC JWT in the Authorization: Bearer header. Verifying it lets us reject
// callers that aren't Google. The audience is configured on the Pub/Sub
// subscription (gcloud pubsub subscriptions update ... --push-auth-token-audience).
//
// Set GMAIL_WEBHOOK_AUDIENCE in env to the value you configured there
// (typically https://<your-domain>/api/webhooks/gmail). Set
// GMAIL_WEBHOOK_SERVICE_ACCOUNT_EMAIL to the service account that the Pub/Sub
// subscription is configured to sign as — verification will reject any other
// caller's JWT.
//
// Fail-open is supported via GMAIL_WEBHOOK_VERIFY=false (e.g. for local dev
// where there is no signed delivery). Anything other than the literal string
// 'false' enables verification.

const oauthClient = new OAuth2Client();

async function verifyPubSubJwt(authHeader: string | null): Promise<{ ok: boolean; reason?: string }> {
    if (process.env.GMAIL_WEBHOOK_VERIFY === 'false') {
        return { ok: true };
    }
    const audience = process.env.GMAIL_WEBHOOK_AUDIENCE;
    if (!audience) {
        return { ok: false, reason: 'GMAIL_WEBHOOK_AUDIENCE not set' };
    }
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { ok: false, reason: 'missing Authorization header' };
    }
    const idToken = authHeader.slice('Bearer '.length).trim();
    try {
        const ticket = await oauthClient.verifyIdToken({ idToken, audience });
        const payload = ticket.getPayload();
        if (!payload) return { ok: false, reason: 'empty JWT payload' };
        // Issuer must be Google.
        if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
            return { ok: false, reason: `bad issuer ${payload.iss}` };
        }
        // Optional: pin to a specific service account email (recommended).
        const expectedSa = process.env.GMAIL_WEBHOOK_SERVICE_ACCOUNT_EMAIL;
        if (expectedSa && payload.email !== expectedSa) {
            return { ok: false, reason: `unexpected sa email` };
        }
        return { ok: true };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'verify failed';
        return { ok: false, reason: msg };
    }
}

/**
 * Webhook receiver for Google Cloud Pub/Sub Push Notifications.
 * Directly triggers syncAccountHistory for instant email sync.
 */
export async function POST(request: NextRequest) {
    try {
        // Verify OIDC JWT before doing anything with the body — otherwise an
        // unauthenticated caller could trigger syncAccountHistory by sending
        // a crafted payload addressed to any tracked account.
        const verification = await verifyPubSubJwt(request.headers.get('authorization'));
        if (!verification.ok) {
            console.warn('[Webhook] rejected unauthenticated push:', verification.reason);
            return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        // Google Pub/Sub sends data base64-encoded
        const base64Data = body.message?.data;
        if (!base64Data) {
            return NextResponse.json({ ok: true });
        }

        const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
        let payload: any;
        try { payload = JSON.parse(decodedData); } catch { return NextResponse.json({ ok: true }); }

        const emailAddress = payload.emailAddress;
        const newHistoryId = payload.historyId;

        if (!emailAddress || !newHistoryId) {
            return NextResponse.json({ ok: true });
        }

        const normalizedEmail = String(emailAddress).toLowerCase().trim();

        // Find the account
        const { data: account } = await supabase
            .from('gmail_accounts')
            .select('id, status')
            .eq('email', normalizedEmail)
            .single();

        if (!account) {
            return NextResponse.json({ ok: true });
        }

        // Sync immediately — don't defer to cron
        if (account.status === 'ACTIVE') {
            await syncAccountHistory(account.id, String(newHistoryId));
        }

        return NextResponse.json({ success: true });

    } catch (error: unknown) {
        console.error('[Webhook]', error);
        return NextResponse.json({ ok: true }, { status: 200 });
    }
}
