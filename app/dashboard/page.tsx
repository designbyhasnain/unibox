import { getFreshSession } from '../../src/lib/roleGate';
import { redirect } from 'next/navigation';
import Dashboard from './PageClient';

export default async function DashboardPage() {
    const session = await getFreshSession();
    if (!session) redirect('/login');

    return <Dashboard userRole={session.role} />;
}
