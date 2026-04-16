import { getFreshSession } from '../../src/lib/roleGate';
import { redirect } from 'next/navigation';
import SalesDashboard from './PageClient';
import EditorDashboard from '../../components/projects/EditorDashboard';

export default async function DashboardPage() {
    const session = await getFreshSession();
    if (!session) redirect('/login');

    if (session.role === 'VIDEO_EDITOR') {
        return <EditorDashboard />;
    }

    return <SalesDashboard />;
}
