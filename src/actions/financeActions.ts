'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { requireAdmin } from '../utils/accessControl';

// Phase 7 Speed Sprint: in-memory cache. Finance numbers don't move
// every second — 60s freshness is fine and saves the heavy CTE roll-up
// when a user reloads the page or pages through a date range. Cache
// lives per-server-instance; on Vercel that's per-warm-lambda. Acceptable.
type CacheEntry = { data: any; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

export async function getFinanceOverviewAction(startDate: string, endDate: string) {
    const { role } = await ensureAuthenticated();
    // Workspace-wide revenue is admin-only — matches the /finance page gate.
    // Without this, a SALES user could call the action directly from devtools.
    try {
        requireAdmin(role);
    } catch {
        return { success: false, error: 'Admin access required' };
    }

    // Cache key includes the date range so distinct ranges cache separately.
    const cacheKey = `${startDate}|${endDate}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }

    const { data, error } = await supabase.rpc('get_finance_summary', {
        p_start: startDate,
        p_end: endDate,
    });

    if (error) {
        console.error('Finance RPC error:', error);
        return { success: false, error: error.message };
    }

    const d = data || {};
    const totalRevenue = d.totalRevenue || 0;
    const paidRevenue = d.paidRevenue || 0;
    const totalProjects = d.totalProjects || 0;

    const result = {
        success: true,
        stats: {
            totalRevenue,
            paidRevenue,
            unpaidRevenue: d.unpaidRevenue || 0,
            partialRevenue: d.partialRevenue || 0,
            totalProjects,
            paidCount: d.paidCount || 0,
            unpaidCount: d.unpaidCount || 0,
            partialCount: d.partialCount || 0,
            avgDealSize: d.avgDealSize || 0,
            collectionRate: totalProjects > 0
                ? ((d.paidCount || 0) / totalProjects * 100).toFixed(1) + '%'
                : '0%',
            pipelineValue: d.unpaidRevenue + d.partialRevenue || 0,
        },
        revenueByMonth: d.revenueByMonth || [],
        revenueByAgent: d.revenueByAgent || [],
        outstanding: d.outstanding || [],
        aging: d.aging || { current: 0, days8to30: 0, days30plus: 0 },
        paidBreakdown: [
            { name: 'Paid', value: d.paidCount || 0, color: '#10B981' },
            { name: 'Partially Paid', value: d.partialCount || 0, color: '#F59E0B' },
            { name: 'Unpaid', value: d.unpaidCount || 0, color: '#EF4444' },
        ],
    };

    cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
}
