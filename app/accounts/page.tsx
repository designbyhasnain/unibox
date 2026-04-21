import { blockEditorAccess } from '../../src/lib/roleGate';
import AccountsPage from './PageClient';

export const metadata = { title: 'Accounts' };

export default async function Page() {
    await blockEditorAccess();
    return <AccountsPage />;
}
