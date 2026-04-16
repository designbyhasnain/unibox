import { blockEditorAccess } from '../../../src/lib/roleGate';
import ContactDetailPage from './PageClient';

export default async function Page() {
    await blockEditorAccess();
    return <ContactDetailPage />;
}
