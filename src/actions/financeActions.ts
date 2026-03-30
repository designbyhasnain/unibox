'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';

export async function getFinanceOverviewAction(startDate: string, endDate: string) {
    const { userId, role } = await ensureAuthenticated();

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

    return {
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
}
