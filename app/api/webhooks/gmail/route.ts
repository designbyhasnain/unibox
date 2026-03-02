import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';
import { syncAccountHistory } from '../../../../src/services/gmailSyncService';

/**
 * Webhook receiver for Google Cloud Pub/Sub Push Notifications.
 * Google will hit this URL every time there is a new email or change in the watched Gmail account.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

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

        console.log(`[Webhook] Received push snippet for ${emailAddress} with historyId ${newHistoryId}`);

        // Find the matching account in our database
        const { data: account, error } = await supabase
            .from('gmail_accounts')
            .select('id, status')
            .eq('email', emailAddress)
            .single();

        if (error || !account) {
            console.error(`[Webhook] Account not found for email: ${emailAddress}`);
            // Acknowledge anyway so Google stops retrying
            return NextResponse.json({ success: true });
        }

        // Trigger the specific history sync asynchronously so we can quickly ack the webhook (HTTP 200)
        syncAccountHistory(account.id, newHistoryId).catch(err => {
            console.error(`[Webhook Background Sync Error] for ${emailAddress}:`, err);
        });

        // Acknowledge the notification successfully
        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('[PubSub Webhook Error]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
