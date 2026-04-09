import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { supabase } from '../../../../src/lib/supabase';
import { syncManualEmails } from '../../../../src/services/manualEmailService';
import { qstashReceiver } from '../../../../lib/qstash';

/**
 * IMAP account polling — runs every 30 minutes via QStash.
 * Changed from 15min to 30min to reduce CPU usage.
 * Syncs manual/IMAP accounts that haven't been synced recently.
 * Processes max 5 accounts per run to stay within Vercel timeout.
 *
 * Supports both POST (QStash) and GET (manual fallback) auth methods.
 */

const MAX_ACCOUNTS_PER_RUN = 5;

async function syncImapAccounts(): Promise<{
    synced: number;
    failed: number;
    skipped: number;
    errors: string[];
}> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    // Find IMAP accounts that need syncing:
    // - status = ACTIVE
    // - connection_method = MANUAL
    // - last_synced_at is null (never synced) OR older than 30 minutes
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: accounts, error } = await supabase
        .from('gmail_accounts')
        .select('id, email, last_synced_at')
        .eq('connection_method', 'MANUAL')
        .eq('status', 'ACTIVE')
        .or(`last_synced_at.is.null,last_synced_at.lte.${cutoff}`)
        .order('last_synced_at', { ascending: true, nullsFirst: true })
        .limit(MAX_ACCOUNTS_PER_RUN);

    if (error || !accounts || accounts.length === 0) {
        return { synced: 0, failed: 0, skipped: 0, errors: [] };
    }

    const totalManual = accounts.length;
    console.log(`[IMAP Cron] Found ${totalManual} accounts to sync`);

    for (const account of accounts) {
        try {
            console.log(`[IMAP Cron] Syncing ${account.email}...`);
            await syncManualEmails(account.id);
            synced++;
            console.log(`[IMAP Cron] ${account.email}: synced`);
        } catch (err: unknown) {
            failed++;
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`${account.email}: ${msg.slice(0, 100)}`);
            console.error(`[IMAP Cron] ${account.email}: failed — ${msg}`);

            // Mark account with error but don't change status (already reverted to ACTIVE by syncManualEmails)
            await supabase
                .from('gmail_accounts')
                .update({ last_error_message: msg.slice(0, 200) })
                .eq('id', account.id);
        }
    }

    console.log(`[IMAP Cron] Done: synced=${synced}, failed=${failed}`);
    return { synced, failed, skipped: totalManual - synced - failed, errors };
}

// ── POST handler (QStash) ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const signature = request.headers.get('upstash-signature');
    const rawBody = await request.text();

    const isDebug = process.env.NODE_ENV === 'development' ||
        request.headers.get('x-debug-key') === process.env.CRON_SECRET;

    if (!isDebug) {
        const isValid = await qstashReceiver.verify({
            signature: signature ?? '',
            body: rawBody,
        }).catch(() => false);

        if (!isValid) {
            console.error('[IMAP Cron] QStash signature verification FAILED');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        const result = await syncImapAccounts();
        return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
    } catch (error: unknown) {
        console.error('[IMAP Cron] Fatal error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}

// ── GET handler (manual fallback) ────────────────────────────────────────────

export async function GET(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');
    const expected = `Bearer ${cronSecret}`;
    if (!authHeader || authHeader.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await syncImapAccounts();
        return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
    } catch (error: unknown) {
        console.error('[IMAP Cron] Fatal error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}

export const maxDuration = 60;
