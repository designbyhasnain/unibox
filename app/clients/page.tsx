import { blockEditorAccess } from '../../src/lib/roleGate';
import ClientsPage from './PageClient';

export const metadata = { title: 'Clients' };

export default async function Page() {
    await blockEditorAccess();
    return <ClientsPage />;
}
