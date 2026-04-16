import { blockEditorAccess } from '../../src/lib/roleGate';
import LinkProjectsPage from './PageClient';

export default async function Page() {
    await blockEditorAccess();
    return <LinkProjectsPage />;
}
