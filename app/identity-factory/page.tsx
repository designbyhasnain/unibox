import { requireAdminAccess } from '../../src/lib/roleGate';
import IdentityFactoryClient from './PageClient';

export const metadata = { title: 'Identity Factory' };

export default async function Page() {
    await requireAdminAccess();
    return <IdentityFactoryClient />;
}
