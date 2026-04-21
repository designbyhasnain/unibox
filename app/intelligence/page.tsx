import { requireAdminAccess } from '../../src/lib/roleGate';
import IntelligencePage from './PageClient';

export const metadata = { title: 'Intelligence' };

export default async function Page() {
    await requireAdminAccess();
    return <IntelligencePage />;
}
