import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { supabase } from '../../../../src/lib/supabase';
import { enqueueCampaignSends } from '../../../../src/services/campaignProcessorService';
import { processSendQueue } from '../../../../src/services/sendQueueProcessorService';
import { qstashReceiver } from '../../../../lib/qstash';

/**
 * Campaign processor — runs every 15 minutes via QStash.
 * Supports both POST (QStash) and GET (Vercel Cron / manual) auth methods.
 */

async function processCampaigns() {
    // Phase 1: Enqueue new sends
    const { enqueued } = await enqueueCampaignSends();

    // Phase 2: Process queue (send emails that are due)
    const { sent, failed } = await processSendQueue();

    // Phase 3: Check subsequence triggers
    await processSubsequenceTriggers();

    return { enqueued, sent, failed };
}

// ── POST handler (QStash) ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const signature = request.headers.get('upstash-signature') ?? '';
    const body = await request.text();

    const isValid = await qstashReceiver.verify({ signature, body }).catch(() => false);
    if (!isValid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await processCampaigns();
        return NextResponse.json({ success: true, ...result });
    } catch (error: unknown) {
        console.error('[CampaignCron] Fatal error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}

// ── GET handler (Vercel Cron / manual fallback) ──────────────────────────────

export async function GET(request: NextRequest) {
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (!authHeader || authHeader.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await processCampaigns();
        return NextResponse.json({ success: true, ...result });
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

        const campaignIds = campaigns.map(c => c.id);

        const { data: allSubSteps } = await supabase
            .from('campaign_steps')
            .select('id, step_number, delay_days, parent_step_id, subsequence_trigger, campaign_id')
            .in('campaign_id', campaignIds)
            .eq('is_subsequence', true)
            .eq('subsequence_trigger', 'OPENED_NO_REPLY');

        if (!allSubSteps || allSubSteps.length === 0) return;

        const now = new Date();

        const subStepByParent = new Map<string, (typeof allSubSteps)[0]>();
        for (const ss of allSubSteps) {
            if (ss.parent_step_id) {
                subStepByParent.set(`${ss.campaign_id}:${ss.parent_step_id}`, ss);
            }
        }

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

        const candidateEmails = allParentEmails.filter(pe => {
            const ss = subStepByParent.get(`${pe.campaign_id}:${pe.step_id}`);
            if (!ss) return false;
            const delayMs = ss.delay_days * 24 * 60 * 60 * 1000;
            return now.getTime() - new Date(pe.sent_at).getTime() >= delayMs;
        });

        if (candidateEmails.length === 0) return;

        const emailIds = candidateEmails.map(pe => pe.email_id);
        const { data: emailDataList } = await supabase
            .from('email_messages')
            .select('id, opened_at, thread_id')
            .in('id', emailIds);

        if (!emailDataList || emailDataList.length === 0) return;

        const emailDataMap = new Map(emailDataList.map(e => [e.id, e]));

        const openedCandidates = candidateEmails.filter(pe => emailDataMap.get(pe.email_id)?.opened_at);
        if (openedCandidates.length === 0) return;

        const threadIds = [...new Set(openedCandidates.map(pe => emailDataMap.get(pe.email_id)?.thread_id).filter(Boolean))] as string[];

        const { data: allReplies } = await supabase
            .from('email_messages')
            .select('thread_id, sent_at')
            .in('thread_id', threadIds)
            .eq('direction', 'RECEIVED');

        const repliesByThread = new Map<string, string[]>();
        for (const r of (allReplies || [])) {
            const list = repliesByThread.get(r.thread_id) || [];
            list.push(r.sent_at);
            repliesByThread.set(r.thread_id, list);
        }

        const subStepIds = allSubSteps.map(s => s.id);
        const { data: alreadySentList } = await supabase
            .from('campaign_emails')
            .select('campaign_id, step_id, contact_id')
            .in('campaign_id', campaignIds)
            .in('step_id', subStepIds);

        const alreadySentSet = new Set(
            (alreadySentList || []).map(as => `${as.campaign_id}:${as.step_id}:${as.contact_id}`)
        );

        const contactsToUpdate: { campaignId: string; contactId: string; stepNumber: number }[] = [];

        for (const pe of openedCandidates) {
            const ed = emailDataMap.get(pe.email_id);
            if (!ed?.thread_id) continue;

            const threadReplies = repliesByThread.get(ed.thread_id) || [];
            if (threadReplies.some(replyTime => replyTime > pe.sent_at)) continue;

            const ss = subStepByParent.get(`${pe.campaign_id}:${pe.step_id}`);
            if (!ss) continue;

            if (alreadySentSet.has(`${pe.campaign_id}:${ss.id}:${pe.contact_id}`)) continue;

            const dedupeKey = `${pe.campaign_id}:${pe.contact_id}`;
            if (contactsToUpdate.some(c => `${c.campaignId}:${c.contactId}` === dedupeKey)) continue;

            contactsToUpdate.push({ campaignId: pe.campaign_id, contactId: pe.contact_id, stepNumber: ss.step_number });
        }

        for (const upd of contactsToUpdate) {
            await supabase
                .from('campaign_contacts')
                .update({ current_step_number: upd.stepNumber, next_send_at: now.toISOString(), status: 'IN_PROGRESS' })
                .eq('campaign_id', upd.campaignId)
                .eq('contact_id', upd.contactId)
                .in('status', ['IN_PROGRESS', 'COMPLETED']);
        }
    } catch (error: unknown) {
        console.error('[CampaignCron] Subsequence processing error:', error);
    }
}
