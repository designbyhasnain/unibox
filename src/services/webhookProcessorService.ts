import 'server-only';
import { supabase } from '../lib/supabase';
import { syncAccountHistory } from './gmailSyncService';

/**
 * Exponential backoff delays: 30s, 2min, 10min, 30min, 2hr
 */
function exponentialBackoff(attempt: number): number {
    const delays = [30, 120, 600, 1800, 7200];
    return (delays[attempt - 1] ?? 7200) * 1000;
}

/**
 * Process pending webhook events with retry and dead-letter support.
 * Called by /api/cron/process-webhooks every 2 minutes.
 */
export async function processWebhookEvents(): Promise<{
    processed: number;
    failed: number;
    deadLettered: number;
}> {
    let processed = 0;
    let failed = 0;
    let deadLettered = 0;

    const now = new Date();

    // Fetch up to 20 PENDING events where nextRetryAt <= now (or null)
    const { data: events, error } = await supabase
        .from('webhook_events')
        .select('*')
        .eq('status', 'PENDING')
        .or(`next_retry_at.is.null,next_retry_at.lte.${now.toISOString()}`)
        .order('created_at', { ascending: true })
        .limit(20);

    if (error || !events || events.length === 0) {
        return { processed, failed, deadLettered };
    }

    for (const event of events) {
        const newAttempts = event.attempts + 1;

        // Mark as PROCESSING
        await supabase
            .from('webhook_events')
            .update({
                status: 'PROCESSING',
                attempts: newAttempts,
                updated_at: now.toISOString(),
            })
            .eq('id', event.id);

        try {
            // Find the Gmail account
            const normalizedEmail = String(event.email_address).toLowerCase().trim();
            const { data: account } = await supabase
                .from('gmail_accounts')
                .select('id, status')
                .eq('email', normalizedEmail)
                .single();

            if (!account) {
                throw new Error(`Account not found for ${normalizedEmail}`);
            }

            // Process the sync
            await syncAccountHistory(account.id, String(event.history_id));

            // Mark as COMPLETED
            await supabase
                .from('webhook_events')
                .update({
                    status: 'COMPLETED',
                    processed_at: now.toISOString(),
                    updated_at: now.toISOString(),
                })
                .eq('id', event.id);

            processed++;
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);

            if (newAttempts >= event.max_attempts) {
                // Dead letter — exceeded max attempts
                await supabase
                    .from('webhook_events')
                    .update({
                        status: 'DEAD_LETTER',
                        last_error: errorMessage,
                        updated_at: now.toISOString(),
                    })
                    .eq('id', event.id);

                console.error(`[WebhookProcessor] Dead-lettered event ${event.id}: ${errorMessage}`);
                deadLettered++;
            } else {
                // Schedule retry with exponential backoff
                const retryDelay = exponentialBackoff(newAttempts);
                const nextRetryAt = new Date(now.getTime() + retryDelay);

                await supabase
                    .from('webhook_events')
                    .update({
                        status: 'PENDING',
                        last_error: errorMessage,
                        next_retry_at: nextRetryAt.toISOString(),
                        updated_at: now.toISOString(),
                    })
                    .eq('id', event.id);

                failed++;
            }
        }
    }

    return { processed, failed, deadLettered };
}
