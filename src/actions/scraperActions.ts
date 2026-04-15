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
