import { requireAdminAccess } from '../../src/lib/roleGate';
import TeamPage from './PageClient';

export const metadata = { title: 'Team' };

export default async function Page() {
    await requireAdminAccess();
    return <TeamPage />;
}
