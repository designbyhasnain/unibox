import 'server-only';
import { supabase } from '../lib/supabase';
import { sendGmailEmail } from './gmailSenderService';
import { sendManualEmail } from './manualEmailService';
import { prepareTrackedEmail } from './trackingService';

/**
 * Phase 2: Send from queue — processes QUEUED items whose scheduledFor <= now.
 * Per Gmail account: process up to 30 items per cycle to avoid rate limits.
 */
export async function processSendQueue(): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    const now = new Date();

    // Fetch QUEUED items where scheduledFor <= now, grouped by account
    const { data: queueItems } = await supabase
        .from('campaign_send_queue')
        .select('*')
        .eq('status', 'QUEUED')
        .lte('scheduled_for', now.toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(60); // Process max 60 per cycle

    if (!queueItems || queueItems.length === 0) return { sent, failed };

    // Group by account and limit per account
    const byAccount = new Map<string, typeof queueItems>();
    for (const item of queueItems) {
        const accountItems = byAccount.get(item.gmail_account_id) || [];
        if (accountItems.length < 30) {
            accountItems.push(item);
            byAccount.set(item.gmail_account_id, accountItems);
        }
    }

    // Pre-fetch all accounts needed for this batch (1 query instead of per-account)
    const allAccountIds = [...byAccount.keys()];
    const { data: accountsList } = await supabase
        .from('gmail_accounts')
        .select('id, email, connection_method, status')
        .in('id', allAccountIds);

    const accountMap = new Map((accountsList || []).map(a => [a.id, a]));

    // Pre-fetch all campaign_contact → contact_id mappings for this batch
    const allCcIds = queueItems.map(i => i.campaign_contact_id);
    const { data: ccList } = await supabase
        .from('campaign_contacts')
        .select('id, contact_id')
        .in('id', allCcIds);

    const ccContactMap = new Map((ccList || []).map(cc => [cc.id, cc.contact_id]));

    // Pre-fetch all variant labels for this batch
    const allVariantIds = queueItems.map(i => i.variant_id).filter(Boolean) as string[];
    const variantMap = new Map<string, string>();
    if (allVariantIds.length > 0) {
        const { data: variants } = await supabase
            .from('campaign_variants')
            .select('id, variant_label')
            .in('id', allVariantIds);

        for (const v of (variants || [])) {
            variantMap.set(v.id, v.variant_label);
        }
    }

    for (const [accountId, items] of byAccount) {
        const account = accountMap.get(accountId);

        if (!account || account.status !== 'ACTIVE') {
            // Batch-mark all items as failed
            const failIds = items.map(i => i.id);
            await supabase
                .from('campaign_send_queue')
                .update({ status: 'FAILED', last_error: 'Account inactive' })
                .in('id', failIds);
            failed += items.length;
            continue;
        }

        for (const item of items) {
            // Mark as SENDING
            await supabase
                .from('campaign_send_queue')
                .update({ status: 'SENDING', attempts: item.attempts + 1 })
                .eq('id', item.id);

            try {
                // Inject tracking pixel
                const { body: trackedBody, trackingId } = prepareTrackedEmail(item.body, true);

                // Send email
                let result: { success: boolean; messageId?: string | null; threadId?: string | null };
                if (account.connection_method === 'MANUAL') {
                    result = await sendManualEmail({
                        accountId: account.id,
                        to: item.to_email,
                        subject: item.subject,
                        body: trackedBody,
                    });
                } else {
                    result = await sendGmailEmail({
                        accountId: account.id,
                        to: item.to_email,
                        subject: item.subject,
                        body: trackedBody,
                    });
                }

                if (!result.success) {
                    throw new Error('Send returned unsuccessful');
                }

                // Update tracking on email
                if (result.messageId) {
                    const cleanMsgId = result.messageId.replace(/[<>]/g, '');
                    await supabase
                        .from('email_messages')
                        .update({
                            is_tracked: true,
                            tracking_id: trackingId,
                            delivered_at: now.toISOString(),
                            body: trackedBody,
                        })
                        .eq('id', cleanMsgId);

                    // Use pre-fetched contact_id and variant_label (zero queries)
                    const contactId = ccContactMap.get(item.campaign_contact_id) ?? item.campaign_contact_id;
                    const variantLabel = item.variant_id ? (variantMap.get(item.variant_id) ?? null) : null;

                    // Create CampaignEmail record
                    await supabase
                        .from('campaign_emails')
                        .insert({
                            campaign_id: item.campaign_id,
                            step_id: item.campaign_step_id,
                            contact_id: contactId,
                            email_id: cleanMsgId,
                            variant_label: variantLabel,
                            sent_at: now.toISOString(),
                        });
                }

                // Mark as SENT
                await supabase
                    .from('campaign_send_queue')
                    .update({ status: 'SENT', sent_at: now.toISOString() })
                    .eq('id', item.id);

                // Update campaign_contact to next step
                await advanceCampaignContact(item.campaign_id, item.campaign_contact_id, item.campaign_step_id);

                // Increment account sent count
                try {
                    await supabase.rpc('increment_sent_count', { p_account_id: accountId });
                } catch {
                    // Fallback — non-critical
                }

                sent++;
            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                const newAttempts = item.attempts + 1;

                if (newAttempts >= item.max_attempts) {
                    // Mark as FAILED permanently
                    await supabase
                        .from('campaign_send_queue')
                        .update({ status: 'FAILED', last_error: errorMessage })
                        .eq('id', item.id);

                    // Mark campaign contact as BOUNCED
                    await supabase
                        .from('campaign_contacts')
                        .update({ status: 'BOUNCED' })
                        .eq('id', item.campaign_contact_id);

                    console.error(`[SendQueue] Failed permanently for ${item.to_email}: ${errorMessage}`);
                } else {
                    // Retry in 5 minutes
                    const retryAt = new Date(now.getTime() + 5 * 60 * 1000);
                    await supabase
                        .from('campaign_send_queue')
                        .update({
                            status: 'QUEUED',
                            last_error: errorMessage,
                            scheduled_for: retryAt.toISOString(),
                        })
                        .eq('id', item.id);
                }

                failed++;
            }
        }
    }

    // Check campaign completion ONCE per campaign (not per email)
    const campaignIds = [...new Set(queueItems.map(i => i.campaign_id))];
    for (const campId of campaignIds) {
        const { count: activeCount } = await supabase
            .from('campaign_contacts')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', campId)
            .in('status', ['PENDING', 'IN_PROGRESS']);

        if (activeCount === 0) {
            await supabase
                .from('campaigns')
                .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
                .eq('id', campId);
        }
    }

    // Clear per-cycle cache
    stepsCache.clear();

    return { sent, failed };
}

// ─── Steps Cache (per processing cycle) ─────────────────────────────────────
// Avoids re-fetching identical campaign steps for every email in the same batch.
const stepsCache = new Map<string, { step_number: number; delay_days: number; is_subsequence: boolean }[]>();

async function getCachedSteps(campaignId: string) {
    if (stepsCache.has(campaignId)) return stepsCache.get(campaignId)!;

    const { data } = await supabase
        .from('campaign_steps')
        .select('id, step_number, delay_days, is_subsequence')
        .eq('campaign_id', campaignId)
        .order('step_number', { ascending: true });

    const steps = data || [];
    stepsCache.set(campaignId, steps);
    return steps;
}

/**
 * Advance a campaign contact to the next step after successful send.
 * Uses cached steps to avoid repeated queries for the same campaign.
 */
async function advanceCampaignContact(
    campaignId: string,
    campaignContactId: string,
    currentStepId: string
) {
    const now = new Date();

    // Get current contact state
    const { data: cc } = await supabase
        .from('campaign_contacts')
        .select('current_step_number')
        .eq('id', campaignContactId)
        .single();

    if (!cc) return;

    // Get steps from cache (1 query per campaign, not per email)
    const steps = await getCachedSteps(campaignId);
    if (steps.length === 0) return;

    const mainSteps = steps.filter(s => !s.is_subsequence);
    const maxStepNumber = Math.max(...mainSteps.map(s => s.step_number));
    const isLastStep = cc.current_step_number >= maxStepNumber;

    if (isLastStep) {
        await supabase
            .from('campaign_contacts')
            .update({
                status: 'COMPLETED',
                last_step_sent_at: now.toISOString(),
                next_send_at: null,
            })
            .eq('id', campaignContactId);
    } else {
        const nextStep = mainSteps.find(s => s.step_number === cc.current_step_number + 1);
        const delayDays = nextStep?.delay_days || 1;
        const nextSendAt = new Date(now);
        nextSendAt.setDate(nextSendAt.getDate() + delayDays);

        await supabase
            .from('campaign_contacts')
            .update({
                current_step_number: cc.current_step_number + 1,
                last_step_sent_at: now.toISOString(),
                next_send_at: nextSendAt.toISOString(),
            })
            .eq('id', campaignContactId);
    }

    // Campaign completion check moved to end of processSendQueue() — done once per
    // campaign instead of after every single email send.
}
