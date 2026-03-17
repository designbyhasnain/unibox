import { getAnalyticsDataAction, getDeviceAnalyticsAction } from '../../src/actions/analyticsActions';
import { AnalyticsClient } from './AnalyticsClient';

/* ── Default filter values (mirrors FilterContext initial state) ── */
function getDefaultDates(): { startDate: string; endDate: string } {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return {
        startDate: start.toISOString().split('T')[0] as string,
        endDate: end.toISOString().split('T')[0] as string,
    };
}

export default async function AnalyticsPage() {
    const { startDate, endDate } = getDefaultDates();

    const [analyticsResult, deviceResult] = await Promise.all([
        getAnalyticsDataAction({
            startDate,
            endDate,
            managerId: 'ALL',
            accountId: 'ALL',
        }),
        getDeviceAnalyticsAction({
            accountId: 'ALL',
            startDate,
            endDate,
        }),
    ]);

    const initialData = analyticsResult.success ? analyticsResult : null;
    const initialDeviceData = deviceResult.success ? deviceResult : null;

    return (
        <AnalyticsClient
            initialData={initialData}
            initialDeviceData={initialDeviceData}
        />
    );
}
