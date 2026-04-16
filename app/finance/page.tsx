import { requireAdminAccess } from '../../src/lib/roleGate';
import FinancePage from './PageClient';

export default async function Page() {
    await requireAdminAccess();
    return <FinancePage />;
}
