import { blockEditorAccess } from '../../src/lib/roleGate';
import OpportunitiesPage from './PageClient';

export const metadata = { title: 'Opportunities' };

export default async function Page() {
    await blockEditorAccess();
    return <OpportunitiesPage />;
}
