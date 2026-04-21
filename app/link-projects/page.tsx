import { blockEditorAccess } from '../../src/lib/roleGate';
import LinkProjectsPage from './PageClient';

export const metadata = { title: 'Link Projects' };

export default async function Page() {
    await blockEditorAccess();
    return <LinkProjectsPage />;
}
