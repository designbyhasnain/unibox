import { blockEditorAccess } from '../src/lib/roleGate';
import InboxPage from './PageClient';

export const metadata = { title: 'Inbox' };

export default async function Page() {
    await blockEditorAccess();
    return <InboxPage />;
}
