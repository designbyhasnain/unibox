import { blockEditorAccess } from '../../src/lib/roleGate';
import SentPage from './PageClient';

export const metadata = { title: 'Sent' };

export default async function Page() {
    await blockEditorAccess();
    return <SentPage />;
}
