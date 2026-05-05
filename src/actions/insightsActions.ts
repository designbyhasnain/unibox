'use server';

import { ensureAuthenticated } from '../lib/safe-action';
import { blockEditorAccess } from '../utils/accessControl';
import { supabase } from '../lib/supabase';

/**
 * Read-side helpers for the Email Intelligence Layer.
 *
 * The extractor (src/services/insightsExtractor.ts) writes facts into
 * `contact_insights`. Surfaces (inbox, dashboard, Goal Planner, calendar)
 * read through here so we have one place to add caching, RBAC, and access
 * scoping for the new dataset.
 */

const HIGH_CONFIDENCE = 0.6;

/**
 * Bulk-fetch the wedding_date for a list of contacts, returning a Map.
 * Used by the inbox row renderer to show the "💍 in N days" badge.
 *
 * Filters to confidence ≥ 0.6 so low-signal extractions don't poison the UI.
 */
export async function fetchWeddingDatesByContact(
    contactIds: string[]
): Promise<Record<string, string>> {
    if (!contactIds.length) return {};
    const { data, error } = await supabase
        .from('contact_insights')
        .select('contact_id, value, confidence')
        .eq('fact_type', 'wedding_date')
        .gte('confidence', HIGH_CONFIDENCE)
        .in('contact_id', contactIds);
    if (error) {
        console.warn('[insights] fetchWeddingDatesByContact error:', error.message);
        return {};
    }
    const out: Record<string, string> = {};
    for (const row of data ?? []) {
        const iso = (row.value as any)?.iso;
        if (typeof iso === 'string') out[row.contact_id as string] = iso;
    }
    return out;
}

/** Calendar feed: every contact with a wedding_date in [from, to]. */
export async function getUpcomingWeddingsAction(input: {
    fromISO: string;
    toISO: string;
    limit?: number;
}): Promise<
    | { success: true; weddings: { contact_id: string; date: string; couple: string[]; city: string | null; price: number | null }[] }
    | { success: false; error: string }
> {
    try {
        const { role } = await ensureAuthenticated();
        blockEditorAccess(role);
        const limit = Math.min(input.limit ?? 500, 1000);

        const { data, error } = await supabase
            .from('contact_insights')
            .select('contact_id, value')
            .eq('fact_type', 'wedding_date')
            .gte('confidence', HIGH_CONFIDENCE)
            .limit(limit * 2); // over-fetch; we filter date range in JS since value is JSON
        if (error) return { success: false, error: error.message };

        const inRange: { contactId: string; iso: string }[] = [];
        for (const row of data ?? []) {
            const iso = (row.value as any)?.iso as string | undefined;
            if (typeof iso !== 'string') continue;
            if (iso >= input.fromISO && iso <= input.toISO) {
                inRange.push({ contactId: row.contact_id as string, iso });
            }
        }
        if (inRange.length === 0) return { success: true, weddings: [] };

        const ids = inRange.map(r => r.contactId);

        // Pull couple names + price + location side-data in three parallel fetches.
        const [namesResp, priceResp, locResp] = await Promise.all([
            supabase
                .from('contact_insights')
                .select('contact_id, value')
                .eq('fact_type', 'couple_names')
                .in('contact_id', ids),
            supabase
                .from('contact_insights')
                .select('contact_id, value')
                .eq('fact_type', 'price_quoted')
                .in('contact_id', ids),
            supabase
                .from('contact_insights')
                .select('contact_id, value')
                .eq('fact_type', 'location')
                .in('contact_id', ids),
        ]);

        const nameMap: Record<string, string[]> = {};
        for (const r of namesResp.data ?? []) {
            const names = (r.value as any)?.names;
            if (Array.isArray(names)) nameMap[r.contact_id as string] = names.filter(n => typeof n === 'string');
        }
        const priceMap: Record<string, number> = {};
        for (const r of priceResp.data ?? []) {
            const usd = (r.value as any)?.usd;
            if (typeof usd === 'number') priceMap[r.contact_id as string] = usd;
        }
        const cityMap: Record<string, string> = {};
        for (const r of locResp.data ?? []) {
            const city = (r.value as any)?.city;
            if (typeof city === 'string') cityMap[r.contact_id as string] = city;
        }

        const weddings = inRange
            .slice(0, limit)
            .map(r => ({
                contact_id: r.contactId,
                date: r.iso,
                couple: nameMap[r.contactId] ?? [],
                city: cityMap[r.contactId] ?? null,
                price: priceMap[r.contactId] ?? null,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        return { success: true, weddings };
    } catch (err: any) {
        console.error('[insights] getUpcomingWeddingsAction error:', err);
        return { success: false, error: err?.message || 'Failed to load upcoming weddings.' };
    }
}

/**
 * Backfill / re-extract trigger — admin-only. Kicks off the extractor for a
 * batch of contacts. Used by the manual `scripts/backfill-insights.ts` and
 * (in the future) by an admin "rebuild insights" button.
 */
export async function extractInsightsBatchAction(input: {
    contactIds: string[];
}): Promise<{ success: true; processed: number; written: number; errors: number } | { success: false; error: string }> {
    try {
        const { role } = await ensureAuthenticated();
        blockEditorAccess(role);
        // Admin-only — large LLM cost.
        const { isAdmin } = await import('../utils/accessControl');
        if (!isAdmin(role)) {
            return { success: false, error: 'Admin access required' };
        }
        const { extractInsightsForContact, persistExtraction } = await import(
            '../services/insightsExtractor'
        );

        let processed = 0;
        let written = 0;
        let errors = 0;
        for (const id of input.contactIds) {
            const r = await extractInsightsForContact(id);
            processed++;
            if (r.error) {
                errors++;
                continue;
            }
            const p = await persistExtraction(r);
            written += p.written;
            if (p.error) errors++;
        }
        return { success: true, processed, written, errors };
    } catch (err: any) {
        console.error('[insights] extractInsightsBatchAction error:', err);
        return { success: false, error: err?.message || 'Failed.' };
    }
}
