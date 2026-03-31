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
 *
 * Optimized: batch-fetches substeps, parent emails, email data, and already-sent
 * records to avoid N+1 queries per contact.
 */
async function processSubsequenceTriggers() {
    try {
        // 1. Fetch all RUNNING campaigns + their OPENED_NO_REPLY substeps in one query
        const { data: campaigns } = await supabase
            .from('campaigns')
            .select('id')
            .eq('status', 'RUNNING');

        if (!campaigns || campaigns.length === 0) return;

        const campaignIds = campaigns.map(c => c.id);

        // 2. Batch-fetch ALL substeps for all running campaigns at once
        const { data: allSubSteps } = await supabase
            .from('campaign_steps')
            .select('id, step_number, delay_days, parent_step_id, subsequence_trigger, campaign_id')
            .in('campaign_id', campaignIds)
            .eq('is_subsequence', true)
            .eq('subsequence_trigger', 'OPENED_NO_REPLY');

        if (!allSubSteps || allSubSteps.length === 0) return;

        const now = new Date();

        // Group substeps by campaign
        const subStepsByCampaign = new Map<string, typeof allSubSteps>();
        for (const ss of allSubSteps) {
            const list = subStepsByCampaign.get(ss.campaign_id) || [];
            list.push(ss);
            subStepsByCampaign.set(ss.campaign_id, list);
        }

        // 3. Batch-fetch ALL parent emails for all relevant parent_step_ids
        const parentStepIds = allSubSteps
            .map(s => s.parent_step_id)
            .filter((id): id is string => !!id);

        if (parentStepIds.length === 0) return;

        const { data: allParentEmails } = await supabase
            .from('campaign_emails')
            .select('contact_id, email_id, sent_at, campaign_id, step_id')
            .in('campaign_id', campaignIds)
            .in('step_id', parentStepIds);

        if (!allParentEmails || allParentEmails.length === 0) return;

        // Filter to only emails past their delay threshold
        const candidateEmails: typeof allParentEmails = [];
        const subStepByParent = new Map<string, (typeof allSubSteps)[0]>();
        for (const ss of allSubSteps) {
            if (ss.parent_step_id) {
                subStepByParent.set(`${ss.campaign_id}:${ss.parent_step_id}`, ss);
            }
        }

        for (const pe of allParentEmails) {
            const ss = subStepByParent.get(`${pe.campaign_id}:${pe.step_id}`);
            if (!ss) continue;
            const delayMs = ss.delay_days * 24 * 60 * 60 * 1000;
            if (now.getTime() - new Date(pe.sent_at).getTime() >= delayMs) {
                candidateEmails.push(pe);
            }
        }

        if (candidateEmails.length === 0) return;

        // 4. Batch-fetch email open/thread data for all candidate emails
        const emailIds = candidateEmails.map(pe => pe.email_id);
        const { data: emailDataList } = await supabase
            .from('email_messages')
            .select('id, opened_at, thread_id')
            .in('id', emailIds);

        if (!emailDataList || emailDataList.length === 0) return;

        const emailDataMap = new Map(emailDataList.map(e => [e.id, e]));

        // Filter to only opened emails
        const openedCandidates = candidateEmails.filter(pe => {
            const ed = emailDataMap.get(pe.email_id);
            return ed?.opened_at;
        });

        if (openedCandidates.length === 0) return;

        // 5. Batch-check for replies: fetch all RECEIVED messages in relevant threads
        const threadIds = [...new Set(openedCandidates.map(pe => emailDataMap.get(pe.email_id)?.thread_id).filter(Boolean))] as string[];

        const { data: allReplies } = await supabase
            .from('email_messages')
            .select('thread_id, sent_at')
            .in('thread_id', threadIds)
            .eq('direction', 'RECEIVED');

        // Build a map: thread_id → list of reply sent_at times
        const repliesByThread = new Map<string, string[]>();
        for (const r of (allReplies || [])) {
            const list = repliesByThread.get(r.thread_id) || [];
            list.push(r.sent_at);
            repliesByThread.set(r.thread_id, list);
        }

        // 6. Batch-check which substep emails were already sent
        const subStepIds = allSubSteps.map(s => s.id);
        const { data: alreadySentList } = await supabase
            .from('campaign_emails')
            .select('campaign_id, step_id, contact_id')
            .in('campaign_id', campaignIds)
            .in('step_id', subStepIds);

        const alreadySentSet = new Set(
            (alreadySentList || []).map(as => `${as.campaign_id}:${as.step_id}:${as.contact_id}`)
        );

        // 7. Now iterate candidates with all data in memory — zero queries in loop
        const contactsToUpdate: { campaignId: string; contactId: string; stepNumber: number }[] = [];

        for (const pe of openedCandidates) {
            const ed = emailDataMap.get(pe.email_id);
            if (!ed?.thread_id) continue;

            // Check if there's a reply after this email was sent
            const threadReplies = repliesByThread.get(ed.thread_id) || [];
            const hasReply = threadReplies.some(replyTime => replyTime > pe.sent_at);
            if (hasReply) continue;

            const ss = subStepByParent.get(`${pe.campaign_id}:${pe.step_id}`);
            if (!ss) continue;

            // Check if already sent for this substep + contact
            if (alreadySentSet.has(`${pe.campaign_id}:${ss.id}:${pe.contact_id}`)) continue;

            // Deduplicate: only advance once per campaign+contact
            const dedupeKey = `${pe.campaign_id}:${pe.contact_id}`;
            if (contactsToUpdate.some(c => `${c.campaignId}:${c.contactId}` === dedupeKey)) continue;

            contactsToUpdate.push({
                campaignId: pe.campaign_id,
                contactId: pe.contact_id,
                stepNumber: ss.step_number,
            });
        }

        // 8. Batch-update contacts (one query per contact is unavoidable due to per-row values)
        for (const upd of contactsToUpdate) {
            await supabase
                .from('campaign_contacts')
                .update({
                    current_step_number: upd.stepNumber,
                    next_send_at: now.toISOString(),
                    status: 'IN_PROGRESS',
                })
                .eq('campaign_id', upd.campaignId)
                .eq('contact_id', upd.contactId)
                .in('status', ['IN_PROGRESS', 'COMPLETED']);
        }
    } catch (error: unknown) {
        console.error('[CampaignCron] Subsequence processing error:', error);
    }
}
