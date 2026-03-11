'use server';

import { supabase } from '../lib/supabase';

export async function getAnalyticsDataAction(params: {
    startDate: string;
    endDate: string;
    managerId: string;
    accountId: string;
}) {
    try {
        // This is a draft action. In a real scenario, we would use complex SQL or multiple queries.
        // For now, we fetch summary stats for the dashboard.
        
        const { startDate, endDate, managerId, accountId } = params;
        
        // 1. Fetch Sent Emails count
        let emailQuery = supabase.from('email_messages').select('id', { count: 'exact' }).eq('direction', 'SENT');
        if (accountId !== 'ALL') emailQuery = emailQuery.eq('gmail_account_id', accountId);
        // Date and manager filters would go here
        
        const { count: sentCount } = await emailQuery;

        // 2. Fetch Leads count
        let leadQuery = supabase.from('contacts').select('id', { count: 'exact' }).eq('is_lead', true);
        // Filter by manager if applicable
        
        const { count: leadCount } = await leadQuery;

        // 3. Fetch Revenue (Paid Projects)
        let projectQuery = supabase.from('projects').select('project_value');
        if (managerId !== 'ALL') projectQuery = projectQuery.eq('account_manager_id', managerId);
        projectQuery = projectQuery.eq('paid_status', 'PAID');
        
        const { data: projects } = await projectQuery;
        const totalRevenue = projects?.reduce((acc, p) => acc + (p.project_value || 0), 0) || 0;

        // 4. Mock Daily Data for Chart
        const dailyData = [
            { name: 'Mon', sent: 45, leads: 5 },
            { name: 'Tue', sent: 52, leads: 8 },
            { name: 'Wed', sent: 38, leads: 4 },
            { name: 'Thu', sent: 65, leads: 12 },
            { name: 'Fri', sent: 48, leads: 7 },
            { name: 'Sat', sent: 24, leads: 2 },
            { name: 'Sun', sent: 15, leads: 1 },
        ];

        return {
            success: true,
            stats: {
                totalOutreach: sentCount || 0,
                leadsGenerated: leadCount || 0,
                avgReplyRate: '12.5%',
                totalRevenue: totalRevenue,
            },
            dailyData,
            managerPerformance: [
                { name: 'Abdur', sent: 120, leads: 15, conversion: '12.5%' },
                { name: 'Bilal', sent: 95, leads: 8, conversion: '8.4%' },
            ]
        };
    } catch (error: any) {
        console.error('getAnalyticsDataAction error:', error);
        return { success: false, error: error.message };
    }
}
