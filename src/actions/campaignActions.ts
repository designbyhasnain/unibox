'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds, requireAdmin } from '../utils/accessControl';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CampaignStepInput = {
    stepNumber: number;
    delayDays: number;
    subject: string;
    body: string;
    isSubsequence?: boolean;
    subsequenceTrigger?: string | null;
    parentStepNumber?: number | null;
    variants?: {
        variantLabel: string;
        subject: string;
        body: string;
        weight: number;
    }[];
};

export type CreateCampaignPayload = {
    name: string;
    goal: string;
    sendingGmailAccountId: string;
    dailySendLimit?: number;
    trackReplies?: boolean;
    autoStopOnReply?: boolean;
    scheduledStartAt?: string | null;
    steps: CampaignStepInput[];
};

export type UpdateCampaignPayload = {
    name?: string;
    goal?: string;
    status?: string;
    sendingGmailAccountId?: string;
    dailySendLimit?: number;
    trackReplies?: boolean;
    autoStopOnReply?: boolean;
    scheduledStartAt?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function verifyAccountAccess(userId: string, role: string, accountId: string): Promise<boolean> {
    const accessible = await getAccessibleGmailAccountIds(userId, role);
    if (accessible === 'ALL') return true;
    return accessible.includes(accountId);
}

async function verifyCampaignOwnership(campaignId: string, userId: string, role: string) {
    const { data: campaign, error } = await supabase
        .from('campaigns')
        .select('id, created_by_id, sending_gmail_account_id, status')
        .eq('id', campaignId)
        .single();

    if (error || !campaign) return null;

    // ADMIN can access all, SALES can only access their own
    if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER' && campaign.created_by_id !== userId) {
        return null;
    }

    return campaign;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createCampaignAction(payload: CreateCampaignPayload) {
    try {
        const { userId, role } = await ensureAuthenticated();

        if (!payload.name || !payload.goal || !payload.sendingGmailAccountId) {
            return { success: false, error: 'Name, goal, and sending account are required' };
        }

        if (!payload.steps || payload.steps.length === 0) {
            return { success: false, error: 'At least one step is required' };
        }

        // Verify account access
        const hasAccess = await verifyAccountAccess(userId, role, payload.sendingGmailAccountId);
        if (!hasAccess) {
            return { success: false, error: 'You do not have access to this Gmail account' };
        }

        // 1. Create the campaign
        const { data: campaign, error: campError } = await supabase
            .from('campaigns')
            .insert({
                name: payload.name,
                goal: payload.goal,
                sending_gmail_account_id: payload.sendingGmailAccountId,
                created_by_id: userId,
                daily_send_limit: payload.dailySendLimit ?? 50,
                track_replies: payload.trackReplies ?? true,
                auto_stop_on_reply: payload.autoStopOnReply ?? true,
                scheduled_start_at: payload.scheduledStartAt || null,
                status: 'DRAFT',
                updated_at: new Date().toISOString(),
            })
            .select('id')
            .single();

        if (campError || !campaign) {
            console.error('[createCampaignAction] campaign insert error:', campError);
            return { success: false, error: 'Failed to create campaign' };
        }

        // 2. Create steps
        // First pass: insert all steps (resolve parentStepId in second pass)
        const stepIdMap = new Map<number, string>(); // stepNumber -> id

        for (const step of payload.steps) {
            const { data: stepData, error: stepError } = await supabase
                .from('campaign_steps')
                .insert({
                    campaign_id: campaign.id,
                    step_number: step.stepNumber,
                    delay_days: step.delayDays,
                    subject: step.subject,
                    body: step.body,
                    is_subsequence: step.isSubsequence || false,
                    subsequence_trigger: step.subsequenceTrigger || null,
                    parent_step_id: null, // set in second pass
                })
                .select('id')
                .single();

            if (stepError || !stepData) {
                console.error('[createCampaignAction] step insert error:', stepError);
                continue;
            }

            stepIdMap.set(step.stepNumber, stepData.id);

            // 3. Create variants if any
            if (step.variants && step.variants.length > 0) {
                const variantRows = step.variants.map(v => ({
                    step_id: stepData.id,
                    variant_label: v.variantLabel,
                    subject: v.subject,
                    body: v.body,
                    weight: v.weight,
                }));

                const { error: varError } = await supabase
                    .from('campaign_variants')
                    .insert(variantRows);

                if (varError) {
                    console.error('[createCampaignAction] variant insert error:', varError);
                }
            }
        }

        // Second pass: set parentStepId for subsequences
        for (const step of payload.steps) {
            if (step.isSubsequence && step.parentStepNumber != null) {
                const parentId = stepIdMap.get(step.parentStepNumber);
                const stepId = stepIdMap.get(step.stepNumber);
                if (parentId && stepId) {
                    await supabase
                        .from('campaign_steps')
                        .update({ parent_step_id: parentId })
                        .eq('id', stepId);
                }
            }
        }

        revalidatePath('/campaigns');
        return { success: true, campaignId: campaign.id };
    } catch (error: any) {
        console.error('[createCampaignAction] error:', error);
        return { success: false, error: 'An error occurred while creating the campaign' };
    }
}

export async function getCampaignsAction() {
    try {
        const { userId, role } = await ensureAuthenticated();

        let query = supabase
            .from('campaigns')
            .select(`
                id,
                name,
                goal,
                status,
                daily_send_limit,
                track_replies,
                auto_stop_on_reply,
                scheduled_start_at,
                created_at,
                updated_at,
                sending_gmail_account_id,
                created_by_id,
                sending_account:gmail_accounts ( id, email ),
                created_by:users ( id, name )
            `)
            .neq('status', 'ARCHIVED')
            .order('created_at', { ascending: false });

        // SALES users only see their own campaigns
        if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') {
            query = query.eq('created_by_id', userId);
        }

        const { data: campaigns, error } = await query;

        if (error) {
            console.error('[getCampaignsAction] error:', error);
            return [];
        }

        if (!campaigns || campaigns.length === 0) return [];

        const campaignIds = campaigns.map(c => c.id);

        // Fetch contact counts per campaign
        const { data: contactCounts } = await supabase
            .from('campaign_contacts')
            .select('campaign_id, status')
            .in('campaign_id', campaignIds);

        // Fetch sent email counts per campaign
        const { data: emailCounts } = await supabase
            .from('campaign_emails')
            .select('campaign_id')
            .in('campaign_id', campaignIds);

        // Fetch step counts per campaign
        const { data: stepCounts } = await supabase
            .from('campaign_steps')
            .select('campaign_id')
            .in('campaign_id', campaignIds);

        // Fetch open/reply stats from campaign emails
        const { data: campaignEmailIds } = await supabase
            .from('campaign_emails')
            .select('campaign_id, email_id')
            .in('campaign_id', campaignIds);

        let openedMap = new Map<string, number>();
        let repliedMap = new Map<string, number>();

        if (campaignEmailIds && campaignEmailIds.length > 0) {
            const emailIds = campaignEmailIds.map(e => e.email_id);

            const { data: trackedEmails } = await supabase
                .from('email_messages')
                .select('id, opened_at, thread_id')
                .in('id', emailIds.slice(0, 500)); // Limit to avoid query size issues

            if (trackedEmails) {
                const emailToCampaign = new Map<string, string>();
                for (const ce of campaignEmailIds) {
                    emailToCampaign.set(ce.email_id, ce.campaign_id);
                }

                for (const email of trackedEmails) {
                    const cid = emailToCampaign.get(email.id);
                    if (!cid) continue;
                    if (email.opened_at) {
                        openedMap.set(cid, (openedMap.get(cid) || 0) + 1);
                    }
                }
            }
        }

        // Fetch stopped-by-reply counts
        if (contactCounts) {
            for (const cc of contactCounts) {
                if (cc.status === 'STOPPED') {
                    // We'll count stopped as replied for the list view
                }
            }
        }

        const { data: repliedContacts } = await supabase
            .from('campaign_contacts')
            .select('campaign_id')
            .in('campaign_id', campaignIds)
            .eq('stopped_reason', 'REPLIED');

        if (repliedContacts) {
            for (const rc of repliedContacts) {
                repliedMap.set(rc.campaign_id, (repliedMap.get(rc.campaign_id) || 0) + 1);
            }
        }

        // Build stats maps
        const contactCountMap = new Map<string, number>();
        const activeContactMap = new Map<string, number>();
        if (contactCounts) {
            for (const cc of contactCounts) {
                contactCountMap.set(cc.campaign_id, (contactCountMap.get(cc.campaign_id) || 0) + 1);
                if (cc.status === 'IN_PROGRESS' || cc.status === 'PENDING') {
                    activeContactMap.set(cc.campaign_id, (activeContactMap.get(cc.campaign_id) || 0) + 1);
                }
            }
        }

        const emailCountMap = new Map<string, number>();
        if (emailCounts) {
            for (const ec of emailCounts) {
                emailCountMap.set(ec.campaign_id, (emailCountMap.get(ec.campaign_id) || 0) + 1);
            }
        }

        const stepCountMap = new Map<string, number>();
        if (stepCounts) {
            for (const sc of stepCounts) {
                stepCountMap.set(sc.campaign_id, (stepCountMap.get(sc.campaign_id) || 0) + 1);
            }
        }

        return campaigns.map(c => {
            const sent = emailCountMap.get(c.id) || 0;
            const opened = openedMap.get(c.id) || 0;
            const replied = repliedMap.get(c.id) || 0;

            return {
                id: c.id,
                name: c.name,
                goal: c.goal,
                status: c.status,
                dailySendLimit: c.daily_send_limit,
                scheduledStartAt: c.scheduled_start_at,
                createdAt: c.created_at,
                updatedAt: c.updated_at,
                sendingAccount: c.sending_account,
                createdBy: c.created_by,
                contactCount: contactCountMap.get(c.id) || 0,
                activeContactCount: activeContactMap.get(c.id) || 0,
                stepCount: stepCountMap.get(c.id) || 0,
                sentCount: sent,
                openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
                replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
            };
        });
    } catch (error: any) {
        console.error('[getCampaignsAction] error:', error);
        return [];
    }
}

export async function getCampaignDetailAction(campaignId: string) {
    try {
        const { userId, role } = await ensureAuthenticated();

        if (!campaignId) return null;

        const campaign = await verifyCampaignOwnership(campaignId, userId, role);
        if (!campaign) return null;

        // Fetch full campaign with steps, variants, and sending account
        const { data: fullCampaign, error } = await supabase
            .from('campaigns')
            .select(`
                id,
                name,
                goal,
                status,
                daily_send_limit,
                track_replies,
                auto_stop_on_reply,
                scheduled_start_at,
                created_at,
                updated_at,
                sending_gmail_account_id,
                created_by_id,
                sending_account:gmail_accounts ( id, email ),
                created_by:users ( id, name )
            `)
            .eq('id', campaignId)
            .single();

        if (error || !fullCampaign) return null;

        // Fetch steps with variants
        const { data: steps } = await supabase
            .from('campaign_steps')
            .select(`
                id,
                step_number,
                delay_days,
                subject,
                body,
                is_subsequence,
                subsequence_trigger,
                parent_step_id,
                variants:campaign_variants (
                    id,
                    variant_label,
                    subject,
                    body,
                    weight
                )
            `)
            .eq('campaign_id', campaignId)
            .order('step_number', { ascending: true });

        // Fetch contacts
        const { data: contacts } = await supabase
            .from('campaign_contacts')
            .select(`
                id,
                contact_id,
                status,
                current_step_number,
                active_variant_label,
                stopped_reason,
                enrolled_at,
                last_step_sent_at,
                next_send_at,
                contact:contacts ( id, name, email, company, pipeline_stage )
            `)
            .eq('campaign_id', campaignId)
            .order('enrolled_at', { ascending: false });

        // Fetch sent emails with tracking data
        const { data: campaignEmails } = await supabase
            .from('campaign_emails')
            .select(`
                id,
                step_id,
                contact_id,
                email_id,
                variant_label,
                sent_at
            `)
            .eq('campaign_id', campaignId)
            .order('sent_at', { ascending: false });

        // Fetch tracking data for campaign emails
        let emailTrackingMap = new Map<string, { openedAt: string | null }>();
        if (campaignEmails && campaignEmails.length > 0) {
            const emailIds = campaignEmails.map(e => e.email_id);
            const { data: trackedEmails } = await supabase
                .from('email_messages')
                .select('id, opened_at')
                .in('id', emailIds.slice(0, 500));

            if (trackedEmails) {
                for (const te of trackedEmails) {
                    emailTrackingMap.set(te.id, { openedAt: te.opened_at });
                }
            }
        }

        // Build per-step stats
        const stepStats = new Map<string, {
            sent: number;
            opened: number;
            replied: number;
            variantASent: number;
            variantAOpened: number;
            variantBSent: number;
            variantBOpened: number;
        }>();

        if (campaignEmails && steps) {
            for (const step of steps) {
                stepStats.set(step.id, {
                    sent: 0, opened: 0, replied: 0,
                    variantASent: 0, variantAOpened: 0,
                    variantBSent: 0, variantBOpened: 0,
                });
            }

            for (const ce of campaignEmails) {
                const stat = stepStats.get(ce.step_id);
                if (!stat) continue;

                stat.sent += 1;
                const tracking = emailTrackingMap.get(ce.email_id);
                if (tracking?.openedAt) stat.opened += 1;

                if (ce.variant_label === 'A') {
                    stat.variantASent += 1;
                    if (tracking?.openedAt) stat.variantAOpened += 1;
                } else if (ce.variant_label === 'B') {
                    stat.variantBSent += 1;
                    if (tracking?.openedAt) stat.variantBOpened += 1;
                }
            }
        }

        // Count replied contacts per step
        const repliedContactSteps = new Map<string, number>();
        if (contacts) {
            for (const cc of contacts) {
                if (cc.stopped_reason === 'REPLIED' && cc.current_step_number) {
                    const step = steps?.find(s => s.step_number === cc.current_step_number);
                    if (step) {
                        repliedContactSteps.set(step.id, (repliedContactSteps.get(step.id) || 0) + 1);
                    }
                }
            }
        }

        // Merge replied counts into step stats
        for (const [stepId, count] of repliedContactSteps) {
            const stat = stepStats.get(stepId);
            if (stat) stat.replied = count;
        }

        // Compute totals
        const totalSent = campaignEmails?.length || 0;
        let totalOpened = 0;
        let totalReplied = 0;

        for (const [, stat] of stepStats) {
            totalOpened += stat.opened;
            totalReplied += stat.replied;
        }

        return {
            ...fullCampaign,
            steps: (steps || []).map(s => ({
                ...s,
                stats: stepStats.get(s.id) || {
                    sent: 0, opened: 0, replied: 0,
                    variantASent: 0, variantAOpened: 0,
                    variantBSent: 0, variantBOpened: 0,
                },
            })),
            contacts: contacts || [],
            totalSent,
            totalOpened,
            totalReplied,
            openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
            replyRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0,
        };
    } catch (error: any) {
        console.error('[getCampaignDetailAction] error:', error);
        return null;
    }
}

export async function updateCampaignAction(campaignId: string, updates: UpdateCampaignPayload) {
    try {
        const { userId, role } = await ensureAuthenticated();

        if (!campaignId) return { success: false, error: 'campaignId is required' };

        const campaign = await verifyCampaignOwnership(campaignId, userId, role);
        if (!campaign) return { success: false, error: 'Campaign not found or access denied' };

        // Only DRAFT campaigns can have their core settings edited
        if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED') {
            const allowedWhileRunning = ['status', 'dailySendLimit', 'autoStopOnReply'];
            const hasDisallowed = Object.keys(updates).some(k => !allowedWhileRunning.includes(k));
            if (hasDisallowed) {
                return { success: false, error: 'Cannot edit campaign settings while it is running. Pause it first.' };
            }
        }

        // Verify new account access if changing
        if (updates.sendingGmailAccountId) {
            const hasAccess = await verifyAccountAccess(userId, role, updates.sendingGmailAccountId);
            if (!hasAccess) return { success: false, error: 'No access to the selected Gmail account' };
        }

        const payload: Record<string, any> = { updated_at: new Date().toISOString() };
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.goal !== undefined) payload.goal = updates.goal;
        if (updates.status !== undefined) payload.status = updates.status;
        if (updates.sendingGmailAccountId !== undefined) payload.sending_gmail_account_id = updates.sendingGmailAccountId;
        if (updates.dailySendLimit !== undefined) payload.daily_send_limit = updates.dailySendLimit;
        if (updates.trackReplies !== undefined) payload.track_replies = updates.trackReplies;
        if (updates.autoStopOnReply !== undefined) payload.auto_stop_on_reply = updates.autoStopOnReply;
        if (updates.scheduledStartAt !== undefined) payload.scheduled_start_at = updates.scheduledStartAt;

        const { error } = await supabase
            .from('campaigns')
            .update(payload)
            .eq('id', campaignId);

        if (error) {
            console.error('[updateCampaignAction] error:', error);
            return { success: false, error: 'Failed to update campaign' };
        }

        revalidatePath('/campaigns');
        return { success: true };
    } catch (error: any) {
        console.error('[updateCampaignAction] error:', error);
        return { success: false, error: 'An error occurred' };
    }
}

export async function deleteCampaignAction(campaignId: string) {
    try {
        const { userId, role } = await ensureAuthenticated();

        // Only ADMIN can archive/delete
        requireAdmin(role);

        const campaign = await verifyCampaignOwnership(campaignId, userId, role);
        if (!campaign) return { success: false, error: 'Campaign not found' };

        // Soft delete — set to ARCHIVED
        const { error } = await supabase
            .from('campaigns')
            .update({ status: 'ARCHIVED', updated_at: new Date().toISOString() })
            .eq('id', campaignId);

        if (error) {
            console.error('[deleteCampaignAction] error:', error);
            return { success: false, error: 'Failed to archive campaign' };
        }

        revalidatePath('/campaigns');
        return { success: true };
    } catch (error: any) {
        console.error('[deleteCampaignAction] error:', error);
        return { success: false, error: error.message === 'ADMIN_REQUIRED' ? 'Only admins can delete campaigns' : 'An error occurred' };
    }
}

// ─── Campaign Actions (Launch / Pause / Resume) ──────────────────────────────

export async function launchCampaignAction(campaignId: string) {
    try {
        const { userId, role } = await ensureAuthenticated();

        const campaign = await verifyCampaignOwnership(campaignId, userId, role);
        if (!campaign) return { success: false, error: 'Campaign not found' };

        if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
            return { success: false, error: 'Only DRAFT or SCHEDULED campaigns can be launched' };
        }

        // Validate campaign has steps
        const { count: stepCount } = await supabase
            .from('campaign_steps')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', campaignId);

        if (!stepCount || stepCount === 0) {
            return { success: false, error: 'Campaign must have at least one step before launching' };
        }

        // Validate campaign has contacts
        const { count: contactCount } = await supabase
            .from('campaign_contacts')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', campaignId);

        if (!contactCount || contactCount === 0) {
            return { success: false, error: 'Campaign must have at least one contact enrolled before launching' };
        }

        // Set all PENDING contacts to IN_PROGRESS with nextSendAt = now
        const now = new Date().toISOString();
        await supabase
            .from('campaign_contacts')
            .update({
                status: 'IN_PROGRESS',
                next_send_at: now,
            })
            .eq('campaign_id', campaignId)
            .eq('status', 'PENDING');

        // Update campaign status
        const { error } = await supabase
            .from('campaigns')
            .update({ status: 'RUNNING', updated_at: now })
            .eq('id', campaignId);

        if (error) {
            console.error('[launchCampaignAction] error:', error);
            return { success: false, error: 'Failed to launch campaign' };
        }

        revalidatePath('/campaigns');
        return { success: true };
    } catch (error: any) {
        console.error('[launchCampaignAction] error:', error);
        return { success: false, error: 'An error occurred' };
    }
}

export async function pauseCampaignAction(campaignId: string) {
    try {
        const { userId, role } = await ensureAuthenticated();

        const campaign = await verifyCampaignOwnership(campaignId, userId, role);
        if (!campaign) return { success: false, error: 'Campaign not found' };

        if (campaign.status !== 'RUNNING') {
            return { success: false, error: 'Only RUNNING campaigns can be paused' };
        }

        const { error } = await supabase
            .from('campaigns')
            .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
            .eq('id', campaignId);

        if (error) return { success: false, error: 'Failed to pause campaign' };

        revalidatePath('/campaigns');
        return { success: true };
    } catch (error: any) {
        console.error('[pauseCampaignAction] error:', error);
        return { success: false, error: 'An error occurred' };
    }
}

export async function resumeCampaignAction(campaignId: string) {
    try {
        const { userId, role } = await ensureAuthenticated();

        const campaign = await verifyCampaignOwnership(campaignId, userId, role);
        if (!campaign) return { success: false, error: 'Campaign not found' };

        if (campaign.status !== 'PAUSED') {
            return { success: false, error: 'Only PAUSED campaigns can be resumed' };
        }

        const { error } = await supabase
            .from('campaigns')
            .update({ status: 'RUNNING', updated_at: new Date().toISOString() })
            .eq('id', campaignId);

        if (error) return { success: false, error: 'Failed to resume campaign' };

        revalidatePath('/campaigns');
        return { success: true };
    } catch (error: any) {
        console.error('[resumeCampaignAction] error:', error);
        return { success: false, error: 'An error occurred' };
    }
}

// ─── Contact Enrollment ──────────────────────────────────────────────────────

export async function enrollContactsAction(campaignId: string, contactIds: string[]) {
    try {
        const { userId, role } = await ensureAuthenticated();

        if (!campaignId || !contactIds || contactIds.length === 0) {
            return { success: false, error: 'Campaign ID and contact IDs are required' };
        }

        const campaign = await verifyCampaignOwnership(campaignId, userId, role);
        if (!campaign) return { success: false, error: 'Campaign not found' };

        if (campaign.status !== 'DRAFT' && campaign.status !== 'RUNNING') {
            return { success: false, error: 'Can only enroll contacts in DRAFT or RUNNING campaigns' };
        }

        // Check which contacts already enrolled
        const { data: existing } = await supabase
            .from('campaign_contacts')
            .select('contact_id')
            .eq('campaign_id', campaignId)
            .in('contact_id', contactIds);

        const existingIds = new Set((existing || []).map(e => e.contact_id));
        const newContactIds = contactIds.filter(id => !existingIds.has(id));

        if (newContactIds.length === 0) {
            return { success: true, enrolled: 0, message: 'All contacts are already enrolled' };
        }

        // Fetch campaign steps to determine variant assignment
        const { data: steps } = await supabase
            .from('campaign_steps')
            .select(`
                id,
                step_number,
                variants:campaign_variants ( variant_label, weight )
            `)
            .eq('campaign_id', campaignId)
            .order('step_number', { ascending: true });

        // Determine variant for each contact if step 1 has variants
        const step1 = steps?.find(s => s.step_number === 1);
        const hasVariants = step1?.variants && step1.variants.length > 0;

        const rows = newContactIds.map(contactId => {
            let variantLabel: string | null = null;
            if (hasVariants && step1?.variants) {
                // Random weighted assignment
                const totalWeight = step1.variants.reduce((sum: number, v: any) => sum + v.weight, 0);
                const rand = Math.random() * totalWeight;
                let cumulative = 0;
                for (const v of step1.variants) {
                    cumulative += v.weight;
                    if (rand <= cumulative) {
                        variantLabel = v.variant_label;
                        break;
                    }
                }
            }

            return {
                campaign_id: campaignId,
                contact_id: contactId,
                status: campaign.status === 'RUNNING' ? 'IN_PROGRESS' : 'PENDING',
                current_step_number: 1,
                active_variant_label: variantLabel,
                next_send_at: campaign.status === 'RUNNING' ? new Date().toISOString() : null,
            };
        });

        const { error } = await supabase
            .from('campaign_contacts')
            .insert(rows);

        if (error) {
            console.error('[enrollContactsAction] error:', error);
            return { success: false, error: 'Failed to enroll contacts' };
        }

        revalidatePath('/campaigns');
        return { success: true, enrolled: newContactIds.length };
    } catch (error: any) {
        console.error('[enrollContactsAction] error:', error);
        return { success: false, error: 'An error occurred' };
    }
}

export async function removeContactFromCampaignAction(campaignId: string, contactId: string) {
    try {
        const { userId, role } = await ensureAuthenticated();

        const campaign = await verifyCampaignOwnership(campaignId, userId, role);
        if (!campaign) return { success: false, error: 'Campaign not found' };

        // Mark as STOPPED (manual) instead of deleting to preserve history
        const { error } = await supabase
            .from('campaign_contacts')
            .update({ status: 'STOPPED', stopped_reason: 'MANUAL' })
            .eq('campaign_id', campaignId)
            .eq('contact_id', contactId);

        if (error) {
            console.error('[removeContactFromCampaignAction] error:', error);
            return { success: false, error: 'Failed to remove contact' };
        }

        revalidatePath('/campaigns');
        return { success: true };
    } catch (error: any) {
        console.error('[removeContactFromCampaignAction] error:', error);
        return { success: false, error: 'An error occurred' };
    }
}

// ─── Update Steps (for editing draft campaigns) ─────────────────────────────

export async function updateCampaignStepsAction(campaignId: string, steps: CampaignStepInput[]) {
    try {
        const { userId, role } = await ensureAuthenticated();

        const campaign = await verifyCampaignOwnership(campaignId, userId, role);
        if (!campaign) return { success: false, error: 'Campaign not found' };

        if (campaign.status !== 'DRAFT') {
            return { success: false, error: 'Can only edit steps on DRAFT campaigns' };
        }

        // Delete existing steps (cascade deletes variants too)
        await supabase
            .from('campaign_steps')
            .delete()
            .eq('campaign_id', campaignId);

        // Re-insert all steps
        const stepIdMap = new Map<number, string>();

        for (const step of steps) {
            const { data: stepData, error: stepError } = await supabase
                .from('campaign_steps')
                .insert({
                    campaign_id: campaignId,
                    step_number: step.stepNumber,
                    delay_days: step.delayDays,
                    subject: step.subject,
                    body: step.body,
                    is_subsequence: step.isSubsequence || false,
                    subsequence_trigger: step.subsequenceTrigger || null,
                    parent_step_id: null,
                })
                .select('id')
                .single();

            if (stepError || !stepData) continue;
            stepIdMap.set(step.stepNumber, stepData.id);

            if (step.variants && step.variants.length > 0) {
                await supabase
                    .from('campaign_variants')
                    .insert(step.variants.map(v => ({
                        step_id: stepData.id,
                        variant_label: v.variantLabel,
                        subject: v.subject,
                        body: v.body,
                        weight: v.weight,
                    })));
            }
        }

        // Set parentStepId for subsequences
        for (const step of steps) {
            if (step.isSubsequence && step.parentStepNumber != null) {
                const parentId = stepIdMap.get(step.parentStepNumber);
                const stepId = stepIdMap.get(step.stepNumber);
                if (parentId && stepId) {
                    await supabase
                        .from('campaign_steps')
                        .update({ parent_step_id: parentId })
                        .eq('id', stepId);
                }
            }
        }

        revalidatePath('/campaigns');
        return { success: true };
    } catch (error: any) {
        console.error('[updateCampaignStepsAction] error:', error);
        return { success: false, error: 'An error occurred' };
    }
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export async function getCampaignAnalyticsAction(campaignId: string) {
    try {
        const { userId, role } = await ensureAuthenticated();

        const campaign = await verifyCampaignOwnership(campaignId, userId, role);
        if (!campaign) return null;

        // Fetch all campaign emails with their tracking data
        const { data: campaignEmails } = await supabase
            .from('campaign_emails')
            .select('id, step_id, contact_id, variant_label, sent_at, email_id')
            .eq('campaign_id', campaignId)
            .order('sent_at', { ascending: true });

        if (!campaignEmails || campaignEmails.length === 0) {
            return { dailySends: [], stepPerformance: [], contactStatusDistribution: [] };
        }

        // Fetch tracking data
        const emailIds = campaignEmails.map(e => e.email_id);
        const { data: trackedEmails } = await supabase
            .from('email_messages')
            .select('id, opened_at, delivered_at')
            .in('id', emailIds.slice(0, 1000));

        const trackingMap = new Map<string, { openedAt: string | null; deliveredAt: string | null }>();
        if (trackedEmails) {
            for (const te of trackedEmails) {
                trackingMap.set(te.id, { openedAt: te.opened_at, deliveredAt: te.delivered_at });
            }
        }

        // Daily sends aggregation
        const dailySendsMap = new Map<string, number>();
        for (const ce of campaignEmails) {
            const day = new Date(ce.sent_at).toISOString().split('T')[0] || '';
            dailySendsMap.set(day, (dailySendsMap.get(day) || 0) + 1);
        }
        const dailySends = Array.from(dailySendsMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Contact status distribution
        const { data: contactStatuses } = await supabase
            .from('campaign_contacts')
            .select('status')
            .eq('campaign_id', campaignId);

        const statusDist = new Map<string, number>();
        if (contactStatuses) {
            for (const cs of contactStatuses) {
                statusDist.set(cs.status, (statusDist.get(cs.status) || 0) + 1);
            }
        }
        const contactStatusDistribution = Array.from(statusDist.entries())
            .map(([status, count]) => ({ status, count }));

        // Step performance
        const { data: steps } = await supabase
            .from('campaign_steps')
            .select('id, step_number, subject')
            .eq('campaign_id', campaignId)
            .order('step_number', { ascending: true });

        const stepPerformance = (steps || []).map(step => {
            const stepEmails = campaignEmails.filter(e => e.step_id === step.id);
            const sent = stepEmails.length;
            let opened = 0;
            let delivered = 0;

            for (const se of stepEmails) {
                const tracking = trackingMap.get(se.email_id);
                if (tracking?.deliveredAt) delivered++;
                if (tracking?.openedAt) opened++;
            }

            return {
                stepNumber: step.step_number,
                subject: step.subject,
                sent,
                delivered,
                opened,
                openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
            };
        });

        return { dailySends, stepPerformance, contactStatusDistribution };
    } catch (error: any) {
        console.error('[getCampaignAnalyticsAction] error:', error);
        return null;
    }
}

// ─── A/B Variant Analytics ───────────────────────────────────────────────────

export type VariantAnalyticsItem = {
    id: string;
    label: string;
    subject: string;
    totalSent: number;
    opens: number;
    replies: number;
    openRate: number;
    replyRate: number;
    isWinner: boolean;
};

export type VariantAnalytics = {
    stepNumber: number;
    stepSubject: string;
    variants: VariantAnalyticsItem[];
};

export async function getVariantAnalyticsAction(campaignId: string): Promise<VariantAnalytics[] | null> {
    try {
        const { userId, role } = await ensureAuthenticated();
        const campaign = await verifyCampaignOwnership(campaignId, userId, role);
        if (!campaign) return null;

        // Fetch steps with their variants
        const { data: steps } = await supabase
            .from('campaign_steps')
            .select(`
                id,
                step_number,
                subject,
                variants:campaign_variants ( id, variant_label, subject )
            `)
            .eq('campaign_id', campaignId)
            .order('step_number', { ascending: true });

        if (!steps || steps.length === 0) return [];

        // Fetch all campaign emails for this campaign
        const { data: campaignEmails } = await supabase
            .from('campaign_emails')
            .select('id, step_id, variant_label, email_id, contact_id, sent_at')
            .eq('campaign_id', campaignId);

        if (!campaignEmails || campaignEmails.length === 0) {
            return steps.map((s: any) => ({
                stepNumber: s.step_number,
                stepSubject: s.subject,
                variants: (s.variants || []).map((v: any) => ({
                    id: v.id,
                    label: `Variant ${v.variant_label}`,
                    subject: v.subject,
                    totalSent: 0,
                    opens: 0,
                    replies: 0,
                    openRate: 0,
                    replyRate: 0,
                    isWinner: false,
                })),
            }));
        }

        // Fetch tracking data for campaign emails
        const emailIds = campaignEmails.map(e => e.email_id);
        const { data: trackedEmails } = await supabase
            .from('email_messages')
            .select('id, opened_at, thread_id')
            .in('id', emailIds.slice(0, 1000));

        const trackingMap = new Map<string, { openedAt: string | null; threadId: string }>();
        if (trackedEmails) {
            for (const te of trackedEmails) {
                trackingMap.set(te.id, { openedAt: te.opened_at, threadId: te.thread_id });
            }
        }

        // Fetch replies: received emails in threads that have campaign sends
        const threadIds = new Set<string>();
        if (trackedEmails) {
            for (const te of trackedEmails) {
                if (te.thread_id) threadIds.add(te.thread_id);
            }
        }

        const repliedThreads = new Set<string>();
        if (threadIds.size > 0) {
            const { data: replies } = await supabase
                .from('email_messages')
                .select('thread_id')
                .in('thread_id', Array.from(threadIds).slice(0, 500))
                .eq('direction', 'RECEIVED');

            if (replies) {
                for (const r of replies) {
                    repliedThreads.add(r.thread_id);
                }
            }
        }

        // Build per-step, per-variant analytics
        const result: VariantAnalytics[] = [];

        for (const step of steps) {
            const stepEmails = campaignEmails.filter(e => e.step_id === step.id);
            const variants: any[] = step.variants || [];

            if (variants.length === 0) {
                // No A/B test — single summary
                const sent = stepEmails.length;
                let opens = 0;
                let replies = 0;
                for (const se of stepEmails) {
                    const tracking = trackingMap.get(se.email_id);
                    if (tracking?.openedAt) opens++;
                    if (tracking && repliedThreads.has(tracking.threadId)) replies++;
                }
                result.push({
                    stepNumber: step.step_number,
                    stepSubject: step.subject,
                    variants: [{
                        id: step.id,
                        label: 'Main',
                        subject: step.subject,
                        totalSent: sent,
                        opens,
                        replies,
                        openRate: sent > 0 ? Math.round((opens / sent) * 100) : 0,
                        replyRate: sent > 0 ? Math.round((replies / sent) * 100) : 0,
                        isWinner: false,
                    }],
                });
                continue;
            }

            // A/B test step — compute per variant
            const variantStats: VariantAnalyticsItem[] = variants.map((v: any) => {
                const vEmails = stepEmails.filter(e => e.variant_label === v.variant_label);
                const sent = vEmails.length;
                let opens = 0;
                let replies = 0;
                for (const ve of vEmails) {
                    const tracking = trackingMap.get(ve.email_id);
                    if (tracking?.openedAt) opens++;
                    if (tracking && repliedThreads.has(tracking.threadId)) replies++;
                }
                return {
                    id: v.id,
                    label: `Variant ${v.variant_label}`,
                    subject: v.subject,
                    totalSent: sent,
                    opens,
                    replies,
                    openRate: sent > 0 ? Math.round((opens / sent) * 100) : 0,
                    replyRate: sent > 0 ? Math.round((replies / sent) * 100) : 0,
                    isWinner: false,
                };
            });

            // Mark winner (highest reply rate, tie-break by open rate)
            if (variantStats.length > 1) {
                const sorted = [...variantStats].sort((a, b) => {
                    if (b.replyRate !== a.replyRate) return b.replyRate - a.replyRate;
                    return b.openRate - a.openRate;
                });
                const winner = sorted[0];
                if (winner && winner.totalSent > 0) {
                    const found = variantStats.find(v => v.id === winner.id);
                    if (found) found.isWinner = true;
                }
            }

            result.push({
                stepNumber: step.step_number,
                stepSubject: step.subject,
                variants: variantStats,
            });
        }

        return result;
    } catch (error: any) {
        console.error('[getVariantAnalyticsAction] error:', error);
        return null;
    }
}

// ─── Get contacts available for enrollment ───────────────────────────────────

export async function getEnrollableContactsAction(campaignId: string, search?: string) {
    try {
        const { userId, role } = await ensureAuthenticated();

        // Fetch all contacts
        let query = supabase
            .from('contacts')
            .select('id, name, email, company, pipeline_stage, priority')
            .order('updated_at', { ascending: false })
            .limit(200);

        if (search && search.trim()) {
            const escaped = search.replace(/[%_\\]/g, '\\$&');
            query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%,company.ilike.%${escaped}%`);
        }

        const { data: contacts, error } = await query;

        if (error || !contacts) return [];

        // Fetch already enrolled contacts for this campaign
        const { data: enrolled } = await supabase
            .from('campaign_contacts')
            .select('contact_id')
            .eq('campaign_id', campaignId);

        const enrolledSet = new Set((enrolled || []).map(e => e.contact_id));

        // Check if contacts are in other active campaigns
        const contactIds = contacts.map(c => c.id);
        const { data: otherCampaignContacts } = await supabase
            .from('campaign_contacts')
            .select('contact_id, campaign_id')
            .in('contact_id', contactIds)
            .in('status', ['PENDING', 'IN_PROGRESS']);

        const inOtherCampaign = new Set<string>();
        if (otherCampaignContacts) {
            for (const occ of otherCampaignContacts) {
                if (occ.campaign_id !== campaignId) {
                    inOtherCampaign.add(occ.contact_id);
                }
            }
        }

        return contacts.map(c => ({
            ...c,
            isEnrolled: enrolledSet.has(c.id),
            inOtherActiveCampaign: inOtherCampaign.has(c.id),
        }));
    } catch (error: any) {
        console.error('[getEnrollableContactsAction] error:', error);
        return [];
    }
}

// ─── CSV Import ──────────────────────────────────────────────────────────────

import { parseLeadsCSV } from '../utils/csvParser';

export async function importLeadsFromCSVAction(campaignId: string, csvText: string) {
    const { userId } = await ensureAuthenticated();

    const { leads, errors, customColumns } = parseLeadsCSV(csvText);
    if (!leads.length) return { success: false, error: 'No valid leads found', errors };

    let imported = 0;
    let skipped = 0;

    for (const lead of leads) {
        const email = lead.email.toLowerCase().trim();

        // Upsert contact
        let { data: contact } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (!contact) {
            const { data: newContact } = await supabase
                .from('contacts')
                .insert({
                    email,
                    name: [lead.firstName, lead.lastName].filter(Boolean).join(' ') || email.split('@')[0],
                    company: lead.company ?? null,
                    phone: lead.phone ?? null,
                    pipeline_stage: 'COLD_LEAD',
                    account_manager_id: userId,
                    updated_at: new Date().toISOString(),
                })
                .select('id')
                .single();
            contact = newContact;
        }

        if (!contact) { skipped++; continue; }

        // Check if already enrolled
        const { data: existing } = await supabase
            .from('campaign_contacts')
            .select('id')
            .eq('campaign_id', campaignId)
            .eq('contact_id', contact.id)
            .maybeSingle();

        if (existing) { skipped++; continue; }

        await supabase
            .from('campaign_contacts')
            .insert({
                campaign_id: campaignId,
                contact_id: contact.id,
                custom_variables: lead.customVariables,
                status: 'PENDING',
            });

        imported++;
    }

    return { success: true, imported, skipped, errors, customColumns };
}

// ─── Test Email ──────────────────────────────────────────────────────────────

import { replacePlaceholders } from '../utils/placeholders';
import { resolveSpintax } from '../utils/spintax';

export async function sendTestEmailAction(data: {
    toEmail: string;
    subject: string;
    body: string;
    fromAccountId: string;
}) {
    await ensureAuthenticated();

    const sampleContact = {
        name: 'Test User', email: data.toEmail,
        company: 'Test Company', phone: '+1234567890',
    };

    const subject = resolveSpintax(replacePlaceholders(data.subject, sampleContact));
    const body = resolveSpintax(replacePlaceholders(data.body, sampleContact));

    // Queue it via send queue for rate limiting
    const { error } = await supabase
        .from('campaign_send_queue')
        .insert({
            campaign_id: '00000000-0000-0000-0000-000000000000',
            campaign_contact_id: '00000000-0000-0000-0000-000000000000',
            campaign_step_id: '00000000-0000-0000-0000-000000000000',
            gmail_account_id: data.fromAccountId,
            to_email: data.toEmail,
            subject: `[TEST] ${subject}`,
            body,
            scheduled_for: new Date().toISOString(),
            status: 'QUEUED',
        });

    if (error) return { success: false, error: error.message };
    return { success: true };
}

// ─── Preview with Lead Data ──────────────────────────────────────────────────

export async function previewWithLeadAction(data: {
    subject: string;
    body: string;
    contactId: string;
    campaignId: string;
}) {
    await ensureAuthenticated();

    const { data: contact } = await supabase
        .from('contacts')
        .select('id, name, email, company, phone')
        .eq('id', data.contactId)
        .single();

    if (!contact) return null;

    const { data: cc } = await supabase
        .from('campaign_contacts')
        .select('custom_variables')
        .eq('campaign_id', data.campaignId)
        .eq('contact_id', data.contactId)
        .maybeSingle();

    const customVars = (cc?.custom_variables as Record<string, string>) ?? {};

    return {
        subject: resolveSpintax(replacePlaceholders(data.subject, contact, customVars)),
        body: resolveSpintax(replacePlaceholders(data.body, contact, customVars)),
    };
}

// ─── Diagnose Campaign ──────────────────────────────────────────────────────

export async function diagnoseCampaignAction(campaignId: string) {
    await ensureAuthenticated();

    const { data: campaign } = await supabase
        .from('campaigns')
        .select('*, sending_gmail_account:gmail_accounts ( id, email, status )')
        .eq('id', campaignId)
        .single();

    if (!campaign) return { issues: ['Campaign not found'] };

    const issues: string[] = [];
    const warnings: string[] = [];

    if (campaign.status !== 'RUNNING') issues.push(`Campaign is ${campaign.status} — not RUNNING`);
    if (!campaign.sending_gmail_account) issues.push('No Gmail account connected');
    else if (campaign.sending_gmail_account.status !== 'ACTIVE') issues.push('Gmail account is not ACTIVE');

    const { count: totalContacts } = await supabase
        .from('campaign_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId);

    if (!totalContacts || totalContacts === 0) issues.push('No leads enrolled');

    const { count: pendingCount } = await supabase
        .from('campaign_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('status', ['PENDING', 'IN_PROGRESS']);

    if (pendingCount === 0 && totalContacts && totalContacts > 0) {
        warnings.push('All contacts completed/replied — no pending sends left');
    }

    const { count: stepCount } = await supabase
        .from('campaign_steps')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId);

    if (!stepCount || stepCount === 0) issues.push('No email steps defined');

    // Check daily limit
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count: todaySent } = await supabase
        .from('campaign_send_queue')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('status', ['SENT', 'QUEUED', 'SENDING'])
        .gte('scheduled_for', todayStart.toISOString());

    if (todaySent && todaySent >= campaign.daily_send_limit) {
        warnings.push(`Daily limit reached: ${todaySent}/${campaign.daily_send_limit}`);
    }

    if (campaign.schedule_enabled) {
        warnings.push(`Schedule: ${campaign.schedule_start_time}-${campaign.schedule_end_time} ${campaign.schedule_timezone}, Days: ${(campaign.schedule_days || []).join(',')}`);
    }

    const { count: repliedCount } = await supabase
        .from('campaign_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'COMPLETED')
        .eq('stopped_reason', 'REPLIED');

    const { count: unsubCount } = await supabase
        .from('campaign_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .not('unsubscribed_at', 'is', null);

    return {
        issues,
        warnings,
        stats: {
            total: totalContacts || 0,
            pending: pendingCount || 0,
            replied: repliedCount || 0,
            unsubscribed: unsubCount || 0,
            todaySent: todaySent || 0,
            dailyLimit: campaign.daily_send_limit,
        },
    };
}

// ─── Update Campaign Options ─────────────────────────────────────────────────

export async function updateCampaignOptionsAction(campaignId: string, updates: Record<string, any>) {
    await ensureAuthenticated();

    const allowedFields = [
        'schedule_enabled', 'schedule_days', 'schedule_start_time', 'schedule_end_time',
        'schedule_timezone', 'schedule_start_date', 'schedule_end_date',
        'email_gap_minutes', 'random_wait_max', 'daily_max_new_leads', 'daily_send_limit',
        'text_only', 'first_email_text_only', 'stop_on_auto_reply', 'stop_for_company',
        'prioritize_new_leads', 'cc_list', 'bcc_list', 'link_tracking',
        'auto_variant_select', 'match_lead_esp', 'auto_stop_on_reply',
    ];

    const payload: Record<string, any> = {};
    for (const field of allowedFields) {
        if (updates[field] !== undefined) payload[field] = updates[field];
    }

    const { error } = await supabase
        .from('campaigns')
        .update(payload)
        .eq('id', campaignId);

    if (error) return { success: false, error: error.message };
    revalidatePath(`/campaigns/${campaignId}`);
    return { success: true };
}
