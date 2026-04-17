import { requireAdminAccess } from '../../src/lib/roleGate';
import DataHealthPage from './PageClient';

export default async function Page() {
    await requireAdminAccess();
    return <DataHealthPage />;
}
