import 'server-only';
import { supabase } from '../lib/supabase';
import { replacePlaceholders } from '../utils/placeholders';
import { resolveSpintax } from '../utils/spintax';
import { injectUnsubscribeLink } from '../utils/unsubscribe';

// ─── Schedule Check ──────────────────────────────────────────────────────────

function isWithinSchedule(campaign: any): boolean {
    if (!campaign.schedule_enabled) return true;

    const tz = campaign.schedule_timezone || 'UTC';
    // Use Intl to get current time in the campaign's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric', minute: 'numeric', hour12: false,
        weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric',
    });
    const parts = formatter.formatToParts(new Date());
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';

    const hour = parseInt(get('hour'));
    const minute = parseInt(get('minute'));
    const currentTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    // Day check (JS: 0=Sun)
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[get('weekday')] ?? new Date().getDay();
    const allowedDays: number[] = campaign.schedule_days ?? [1, 2, 3, 4, 5];
    if (!allowedDays.includes(dayOfWeek)) return false;

    // Time window check
    const startTime = campaign.schedule_start_time || '09:00';
    const endTime = campaign.schedule_end_time || '17:00';
    if (currentTime < startTime || currentTime > endTime) return false;

    // Date range check
    const now = new Date();
    if (campaign.schedule_start_date && now < new Date(campaign.schedule_start_date)) return false;
    if (campaign.schedule_end_date && now > new Date(campaign.schedule_end_date)) return false;

    return true;
}

// ─── Auto-Reply Detection ────────────────────────────────────────────────────

export function isAutoReply(subject: string, body: string): boolean {
    const patterns = [
        /out of office/i, /on vacation/i, /auto.?reply/i,
        /automatic reply/i, /away from/i, /will be back/i,
        /currently unavailable/i, /on leave/i, /autoresponder/i,
    ];
    const text = subject + ' ' + body.slice(0, 300);
    return patterns.some(p => p.test(text));
}

// ─── Stop for Company ────────────────────────────────────────────────────────

/**
 * Pre-fetch all stopped company domains for a campaign (one query per campaign).
 * Returns a Set of domains that have already been stopped.
 */
async function getStoppedCompanyDomains(campaignId: string): Promise<Set<string>> {
    const { data } = await supabase
        .from('campaign_contacts')
        .select('id, contact:contacts ( email )')
        .eq('campaign_id', campaignId)
        .eq('status', 'COMPLETED')
        .not('stopped_reason', 'is', null);

    const domains = new Set<string>();
    if (!data) return domains;
    for (const cc of data) {
        const email = (cc.contact as any)?.email;
        const domain = email?.split('@')[1];
        if (domain) domains.add(domain);
    }
    return domains;
}

// ─── Stagger Delay ───────────────────────────────────────────────────────────

function getStaggerDelay(campaign: any, position: number, totalInBatch: number): number {
    const baseGapMs = (campaign.email_gap_minutes || 10) * 60 * 1000;
    const randomMaxMs = (campaign.random_wait_max || 5) * 60 * 1000;
    const randomMs = Math.random() * randomMaxMs;
    return (baseGapMs * position) + randomMs;
}

// ─── Main Enqueue Function ───────────────────────────────────────────────────

export async function enqueueCampaignSends(): Promise<{ enqueued: number }> {
    let enqueued = 0;
    const now = new Date();

    // 1. Find all RUNNING campaigns
    const { data: campaigns } = await supabase
        .from('campaigns')
        .select(`
            id, sending_gmail_account_id, daily_send_limit,
            schedule_enabled, schedule_days, schedule_start_time, schedule_end_time,
            schedule_timezone, schedule_start_date, schedule_end_date,
            email_gap_minutes, random_wait_max, daily_max_new_leads,
            text_only, first_email_text_only, stop_on_auto_reply,
            stop_for_company, prioritize_new_leads,
            cc_list, bcc_list, link_tracking, auto_variant_select
        `)
        .eq('status', 'RUNNING');

    if (!campaigns || campaigns.length === 0) return { enqueued };

    // Pre-fetch today's queued/sent counts per account
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    const accountDailyCounts = new Map<string, number>();
    const accountIds = [...new Set(campaigns.map(c => c.sending_gmail_account_id))];

    // Batch-fetch today's counts for ALL accounts in parallel
    const countResults = await Promise.all(
        accountIds.map(accountId =>
            supabase
                .from('campaign_send_queue')
                .select('id', { count: 'exact', head: true })
                .eq('gmail_account_id', accountId)
                .in('status', ['QUEUED', 'SENDING', 'SENT'])
                .gte('scheduled_for', todayStart.toISOString())
                .then(({ count }) => ({ accountId, count: count || 0 }))
        )
    );
    for (const { accountId, count } of countResults) {
        accountDailyCounts.set(accountId, count);
    }

    for (const campaign of campaigns) {
        // Schedule check
        if (!isWithinSchedule(campaign)) continue;

        // 2. Find contacts ready to send
        const orderCol = campaign.prioritize_new_leads ? 'enrolled_at' : 'next_send_at';
        const { data: readyContacts } = await supabase
            .from('campaign_contacts')
            .select(`
                id,
                contact_id,
                current_step_number,
                active_variant_label,
                custom_variables,
                contact:contacts ( id, name, email, company, phone )
            `)
            .eq('campaign_id', campaign.id)
            .eq('status', 'IN_PROGRESS')
            .is('unsubscribed_at', null)
            .is('bounced_at', null)
            .lte('next_send_at', now.toISOString())
            .order(orderCol, { ascending: true })
            .limit(100);

        if (!readyContacts || readyContacts.length === 0) continue;

        // Batch pre-fetch: already-queued, unsubscribes, steps, and stopped domains
        // All 4 queries run in parallel — replaces per-contact queries in the loop
        const contactIds = readyContacts.map(c => c.id);
        const contactEmails = readyContacts.map(c => (c.contact as any)?.email).filter(Boolean);

        const [
            { data: alreadyQueued },
            { data: unsubscribed },
            { data: steps },
            stoppedDomains,
        ] = await Promise.all([
            supabase
                .from('campaign_send_queue')
                .select('campaign_contact_id')
                .eq('campaign_id', campaign.id)
                .in('campaign_contact_id', contactIds)
                .in('status', ['QUEUED', 'SENDING']),
            supabase
                .from('unsubscribes')
                .select('email')
                .in('email', contactEmails),
            supabase
                .from('campaign_steps')
                .select(`
                    id,
                    step_number,
                    delay_days,
                    subject,
                    body,
                    is_subsequence,
                    variants:campaign_variants ( id, variant_label, subject, body )
                `)
                .eq('campaign_id', campaign.id)
                .order('step_number', { ascending: true }),
            campaign.stop_for_company
                ? getStoppedCompanyDomains(campaign.id)
                : Promise.resolve(new Set<string>()),
        ]);

        const alreadyQueuedSet = new Set((alreadyQueued || []).map(q => q.campaign_contact_id));
        const unsubSet = new Set((unsubscribed || []).map(u => u.email));

        if (!steps || steps.length === 0) continue;

        const toEnqueue: any[] = [];

        for (const cc of readyContacts) {
            if (alreadyQueuedSet.has(cc.id)) continue;

            // Check daily limit
            const currentCount = accountDailyCounts.get(campaign.sending_gmail_account_id) || 0;
            if (currentCount + toEnqueue.length >= campaign.daily_send_limit) break;

            const contact = cc.contact as any;
            if (!contact?.email) continue;

            // Unsubscribe check
            if (unsubSet.has(contact.email)) {
                await supabase
                    .from('campaign_contacts')
                    .update({ status: 'COMPLETED', stopped_reason: 'UNSUBSCRIBED', unsubscribed_at: now.toISOString() })
                    .eq('id', cc.id);
                continue;
            }

            // Stop for company check (uses pre-fetched domains — zero queries)
            if (campaign.stop_for_company) {
                const domain = contact.email.split('@')[1];
                if (domain && stoppedDomains.has(domain)) {
                    await supabase
                        .from('campaign_contacts')
                        .update({ status: 'COMPLETED', stopped_reason: 'REPLIED' })
                        .eq('id', cc.id);
                    continue;
                }
            }

            // Find step
            const step = steps.find(s => s.step_number === cc.current_step_number && !s.is_subsequence);
            if (!step) continue;

            // Determine variant content
            let emailSubject = step.subject;
            let emailBody = step.body;
            let variantId: string | null = null;

            if (cc.active_variant_label && step.variants && step.variants.length > 0) {
                const variant = step.variants.find((v: any) => v.variant_label === cc.active_variant_label);
                if (variant) {
                    emailSubject = variant.subject;
                    emailBody = variant.body;
                    variantId = variant.id;
                }
            }

            // Replace placeholders + spintax
            const customVars = (cc.custom_variables as Record<string, string>) ?? {};
            emailSubject = resolveSpintax(replacePlaceholders(emailSubject, contact, customVars));
            emailBody = resolveSpintax(replacePlaceholders(emailBody, contact, customVars));

            // Inject unsubscribe link
            emailBody = injectUnsubscribeLink(emailBody, contact.email, campaign.id);

            // Text-only mode
            if (campaign.text_only || (cc.current_step_number === 1 && campaign.first_email_text_only)) {
                emailBody = emailBody
                    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/p>/gi, '\n\n')
                    .replace(/<[^>]*>/g, '')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
            }

            toEnqueue.push({
                campaign_id: campaign.id,
                campaign_contact_id: cc.id,
                campaign_step_id: step.id,
                variant_id: variantId,
                gmail_account_id: campaign.sending_gmail_account_id,
                to_email: contact.email,
                subject: emailSubject,
                body: emailBody,
                scheduled_for: new Date(now.getTime() + getStaggerDelay(campaign, toEnqueue.length, readyContacts.length)).toISOString(),
                status: 'QUEUED',
            });
        }

        if (toEnqueue.length > 0) {
            const { error } = await supabase
                .from('campaign_send_queue')
                .insert(toEnqueue);

            if (!error) {
                enqueued += toEnqueue.length;
                accountDailyCounts.set(
                    campaign.sending_gmail_account_id,
                    (accountDailyCounts.get(campaign.sending_gmail_account_id) || 0) + toEnqueue.length
                );
            }
        }
    }

    return { enqueued };
}
