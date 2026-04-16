import { requireAdminAccess } from '../../src/lib/roleGate';
import TeamPage from './PageClient';

export default async function Page() {
    await requireAdminAccess();
    return <TeamPage />;
}
