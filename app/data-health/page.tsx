import { requireAdminAccess } from '../../src/lib/roleGate';
import DataHealthPage from './PageClient';

export const metadata = { title: 'Data Health' };

export default async function Page() {
    await requireAdminAccess();
    return <DataHealthPage />;
}
