import { blockEditorAccess } from '../../src/lib/roleGate';
import SentPage from './PageClient';

export default async function Page() {
    await blockEditorAccess();
    return <SentPage />;
}
