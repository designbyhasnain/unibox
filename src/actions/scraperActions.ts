'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { scrapeUrl } from '../services/leadScraperService';

async function ensureAdmin(userId: string): Promise<void> {
    const { data: user } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
    if (!user || (user.role !== 'ADMIN' && user.role !== 'ACCOUNT_MANAGER')) {
        throw new Error('ADMIN_REQUIRED');
    }
}

export type ScrapeJobSummary = {
    id: string;
    status: string;
    totalUrls: number;
    processedUrls: number;
    errorCount: number;
    createdAt: string;
    completedAt: string | null;
};

export type ScrapeResultRow = {
    id: string;
    url: string;
    domain: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    score: number;
    scoreLabel: string | null;
    status: string;
    errorMsg: string | null;
};

function parseUrls(input: string): string[] {
    return input
        .split(/[\s,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.startsWith('http') ? s : `https://${s}`))
        .filter((s) => {
            try {
                new URL(s);
                return true;
            } catch {
                return false;
            }
        });
}

export async function startScrapeJobAction(
    rawUrls: string
): Promise<{ success: boolean; jobId?: string; error?: string }> {
    try {
        const { userId } = await ensureAuthenticated();
        await ensureAdmin(userId);

        const urls = [...new Set(parseUrls(rawUrls))];
        if (urls.length === 0) return { success: false, error: 'No valid URLs provided' };
        if (urls.length > 50) return { success: false, error: 'Maximum 50 URLs per job' };

        const { data: job, error: jobErr } = await supabase
            .from('scrape_jobs')
            .insert({
                user_id: userId,
                status: 'RUNNING',
                total_urls: urls.length,
            })
            .select('id')
            .single();

        if (jobErr || !job) return { success: false, error: jobErr?.message || 'Failed to create job' };

        let processed = 0;
        let errors = 0;

        for (const url of urls) {
            try {
                const lead = await scrapeUrl(url);
                await supabase.from('scrape_results').insert({
                    job_id: job.id,
                    url: lead.url,
                    domain: lead.domain,
                    name: lead.name,
                    email: lead.email,
                    phone: lead.phone,
                    location: lead.location,
                    pricing: lead.pricing,
                    social: lead.social,
                    score: lead.score,
                    score_label: lead.scoreLabel,
                    status: 'PENDING',
                });
                processed++;
            } catch (err) {
                errors++;
                await supabase.from('scrape_results').insert({
                    job_id: job.id,
                    url,
                    domain: null,
                    score: 0,
                    status: 'REJECTED',
                    error_msg: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        }

        await supabase
            .from('scrape_jobs')
            .update({
                status: errors === urls.length ? 'FAILED' : 'COMPLETED',
                processed_urls: processed,
                error_count: errors,
                completed_at: new Date().toISOString(),
            })
            .eq('id', job.id);

        revalidatePath('/scraper');
        return { success: true, jobId: job.id };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Scrape failed' };
    }
}

export async function getScrapeJobsAction(): Promise<ScrapeJobSummary[]> {
    const { userId } = await ensureAuthenticated();
    await ensureAdmin(userId);
    const { data } = await supabase
        .from('scrape_jobs')
        .select('id, status, total_urls, processed_urls, error_count, created_at, completed_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

    return (data || []).map((j) => ({
        id: j.id,
        status: j.status,
        totalUrls: j.total_urls,
        processedUrls: j.processed_urls,
        errorCount: j.error_count,
        createdAt: j.created_at,
        completedAt: j.completed_at,
    }));
}

// ─── Bulk Enroll (Phase 5) ────────────────────────────────────────────────────

/**
 * Take selected scrape_results and push them through the CRM:
 *   1. Upsert a Contact for each (by email). Preserves existing account manager.
 *   2. Enroll in the target campaign_contacts row (status=PENDING).
 *   3. Mark the scrape_result APPROVED and link contact_id for traceability.
 *
 * We don't write directly to campaign_send_queue — the campaign processor
 * cron (every 15 min) picks up PENDING enrollments and handles schedule,
 * stagger, daily limits, and account rotation. That's the one place that
 * knows how to send correctly.
 */
export type BulkEnrollResult = {
    success: boolean;
    created: number;     // new contacts created
    linked: number;      // existing contacts reused
    enrolled: number;    // campaign_contacts rows inserted
    skipped: number;     // no email, duplicate enrollment, etc.
    errors: string[];
};

export async function bulkEnrollScrapedLeadsAction(
    scrapeResultIds: string[],
    campaignId: string,
): Promise<BulkEnrollResult> {
    const { userId } = await ensureAuthenticated();
    await ensureAdmin(userId);

    if (!Array.isArray(scrapeResultIds) || scrapeResultIds.length === 0) {
        return { success: false, created: 0, linked: 0, enrolled: 0, skipped: 0, errors: ['No leads selected'] };
    }
    if (scrapeResultIds.length > 500) {
        return { success: false, created: 0, linked: 0, enrolled: 0, skipped: 0, errors: ['Select at most 500 leads per enrollment'] };
    }

    // Verify campaign ownership (admins can enroll into any campaign they own
    // or that's in their workspace — same rule as verifyCampaignOwnership in
    // campaignActions.ts).
    const { data: campaign } = await supabase
        .from('campaigns')
        .select('id, name, status, created_by_id')
        .eq('id', campaignId)
        .maybeSingle();
    if (!campaign) {
        return { success: false, created: 0, linked: 0, enrolled: 0, skipped: 0, errors: ['Campaign not found'] };
    }

    // Pull the selected scrape results, scoped to this user's jobs.
    const { data: results } = await supabase
        .from('scrape_results')
        .select('id, name, email, phone, domain, url, score, score_label, contact_id, job_id, scrape_jobs!inner(user_id)')
        .in('id', scrapeResultIds)
        .eq('scrape_jobs.user_id', userId);

    if (!results || results.length === 0) {
        return { success: false, created: 0, linked: 0, enrolled: 0, skipped: 0, errors: ['No accessible leads found'] };
    }

    let created = 0;
    let linked = 0;
    let enrolled = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const r of results) {
        try {
            const cleanEmail = (r.email || '').toLowerCase().trim();
            if (!cleanEmail || !cleanEmail.includes('@')) {
                skipped++;
                continue;
            }

            // 1. Upsert contact by email
            let contactId = r.contact_id as string | null;
            if (!contactId) {
                const { data: existing } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('email', cleanEmail)
                    .maybeSingle();
                if (existing) {
                    contactId = existing.id;
                    linked++;
                } else {
                    const fallbackName = r.name || (r.domain ? r.domain.replace(/^www\./, '') : cleanEmail.split('@')[0]);
                    const { data: newContact, error: insErr } = await supabase
                        .from('contacts')
                        .insert({
                            email: cleanEmail,
                            name: fallbackName,
                            phone: r.phone || null,
                            source: 'scraper',
                            source_url: r.url || null,
                            pipeline_stage: 'COLD_LEAD',
                            account_manager_id: userId,
                            lead_score: r.score || 0,
                            updated_at: new Date().toISOString(),
                        })
                        .select('id')
                        .single();
                    if (insErr || !newContact) {
                        errors.push(`Create contact failed for ${cleanEmail}: ${insErr?.message || 'unknown'}`);
                        skipped++;
                        continue;
                    }
                    contactId = newContact.id;
                    created++;
                }
            } else {
                linked++;
            }

            // 2. Enroll (skip if already enrolled in this campaign)
            const { data: enrollment, error: enrollErr } = await supabase
                .from('campaign_contacts')
                .insert({
                    campaign_id: campaignId,
                    contact_id: contactId,
                    status: 'PENDING',
                    current_step_number: 1,
                })
                .select('id')
                .single();

            if (enrollErr) {
                // 23505 = unique violation (campaign_id, contact_id) — already enrolled
                if (enrollErr.code === '23505') {
                    skipped++;
                } else {
                    errors.push(`Enroll failed for ${cleanEmail}: ${enrollErr.message}`);
                    skipped++;
                }
            } else if (enrollment) {
                enrolled++;
            }

            // 3. Mark the scrape_result APPROVED + link contact_id
            await supabase
                .from('scrape_results')
                .update({ status: 'APPROVED', contact_id: contactId })
                .eq('id', r.id);
        } catch (e: any) {
            errors.push(e?.message || 'Unknown error');
            skipped++;
        }
    }

    revalidatePath('/scraper');
    revalidatePath(`/campaigns/${campaignId}`);

    return {
        success: true,
        created,
        linked,
        enrolled,
        skipped,
        errors: errors.slice(0, 10),
    };
}

/**
 * List campaigns this admin can enroll leads into. Running + Draft only.
 * Used by the scraper UI's campaign dropdown.
 */
export async function listEnrollableCampaignsAction(): Promise<{ id: string; name: string; status: string }[]> {
    const { userId } = await ensureAuthenticated();
    await ensureAdmin(userId);
    const { data } = await supabase
        .from('campaigns')
        .select('id, name, status')
        .in('status', ['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED'])
        .order('created_at', { ascending: false });
    return data || [];
}

export async function getScrapeResultsAction(jobId: string): Promise<ScrapeResultRow[]> {
    const { userId } = await ensureAuthenticated();
    await ensureAdmin(userId);

    const { data: job } = await supabase
        .from('scrape_jobs')
        .select('user_id')
        .eq('id', jobId)
        .single();

    if (!job || job.user_id !== userId) return [];

    const { data } = await supabase
        .from('scrape_results')
        .select('id, url, domain, name, email, phone, score, score_label, status, error_msg')
        .eq('job_id', jobId)
        .order('score', { ascending: false });

    return (data || []).map((r) => ({
        id: r.id,
        url: r.url,
        domain: r.domain,
        name: r.name,
        email: r.email,
        phone: r.phone,
        score: r.score,
        scoreLabel: r.score_label,
        status: r.status,
        errorMsg: r.error_msg,
    }));
}
