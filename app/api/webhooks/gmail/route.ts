import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';
import { syncAccountHistory } from '../../../../src/services/gmailSyncService';

/**
 * Webhook receiver for Google Cloud Pub/Sub Push Notifications.
 * Directly triggers syncAccountHistory for instant email sync.
 */
export async function POST(request: NextRequest) {
    try {
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
