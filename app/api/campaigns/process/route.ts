import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { supabase } from '../../../../src/lib/supabase';
import { enqueueCampaignSends } from '../../../../src/services/campaignProcessorService';
import { processSendQueue } from '../../../../src/services/sendQueueProcessorService';

/**
 * GET /api/campaigns/process
 * Vercel Cron — runs every 15 minutes.
 *
 * Two-phase campaign processing:
 * Phase 1 (Planner): Find contacts due → enqueue into campaign_send_queue with staggered times
 * Phase 2 (Sender): Process queued items whose scheduledFor <= now
 * Also: Check subsequence triggers + auto-complete campaigns
 */
export async function GET(request: NextRequest) {
    // Verify CRON_SECRET
    if (!process.env.CRON_SECRET) {
        console.error('[CampaignCron] CRON_SECRET not configured');
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (!authHeader || authHeader.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Phase 1: Enqueue new sends
        const { enqueued } = await enqueueCampaignSends();

        // Phase 2: Process queue (send emails that are due)
        const { sent, failed } = await processSendQueue();

        // Phase 3: Check subsequence triggers
        await processSubsequenceTriggers();

        return NextResponse.json({
            success: true,
            enqueued,
            sent,
            failed,
        });
    } catch (error: unknown) {
        console.error('[CampaignCron] Fatal error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}

/**
 * Check for subsequence triggers: contacts who opened an email but didn't reply
 * after the delayDays threshold.
 */
async function processSubsequenceTriggers() {
    try {
        const { data: campaigns } = await supabase
            .from('campaigns')
            .select('id')
            .eq('status', 'RUNNING');

        if (!campaigns || campaigns.length === 0) return;

        for (const campaign of campaigns) {
            const { data: subSteps } = await supabase
                .from('campaign_steps')
                .select('id, step_number, delay_days, parent_step_id, subsequence_trigger')
                .eq('campaign_id', campaign.id)
                .eq('is_subsequence', true)
                .eq('subsequence_trigger', 'OPENED_NO_REPLY');

            if (!subSteps || subSteps.length === 0) continue;

            const now = new Date();

            for (const subStep of subSteps) {
                if (!subStep.parent_step_id) continue;

                const { data: parentEmails } = await supabase
                    .from('campaign_emails')
                    .select('contact_id, email_id, sent_at')
                    .eq('campaign_id', campaign.id)
                    .eq('step_id', subStep.parent_step_id);

                if (!parentEmails || parentEmails.length === 0) continue;

                const delayMs = subStep.delay_days * 24 * 60 * 60 * 1000;

                for (const pe of parentEmails) {
                    const sentTime = new Date(pe.sent_at).getTime();
                    if (now.getTime() - sentTime < delayMs) continue;

                    const { data: emailData } = await supabase
                        .from('email_messages')
                        .select('opened_at, thread_id')
                        .eq('id', pe.email_id)
                        .single();

                    if (!emailData?.opened_at) continue;

                    const { count: replyCount } = await supabase
                        .from('email_messages')
                        .select('id', { count: 'exact', head: true })
                        .eq('thread_id', emailData.thread_id)
                        .eq('direction', 'RECEIVED')
                        .gt('sent_at', pe.sent_at);

                    if (replyCount && replyCount > 0) continue;

                    const { count: alreadySent } = await supabase
                        .from('campaign_emails')
                        .select('id', { count: 'exact', head: true })
                        .eq('campaign_id', campaign.id)
                        .eq('step_id', subStep.id)
                        .eq('contact_id', pe.contact_id);

                    if (alreadySent && alreadySent > 0) continue;

                    await supabase
                        .from('campaign_contacts')
                        .update({
                            current_step_number: subStep.step_number,
                            next_send_at: now.toISOString(),
                            status: 'IN_PROGRESS',
                        })
                        .eq('campaign_id', campaign.id)
                        .eq('contact_id', pe.contact_id)
                        .in('status', ['IN_PROGRESS', 'COMPLETED']);
                }
            }
        }
    } catch (error: unknown) {
        console.error('[CampaignCron] Subsequence processing error:', error);
    }
}
