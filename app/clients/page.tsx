import { blockEditorAccess } from '../../src/lib/roleGate';
import ClientsPage from './PageClient';

export default async function Page() {
    await blockEditorAccess();
    return <ClientsPage />;
}
