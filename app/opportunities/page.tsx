import { blockEditorAccess } from '../../src/lib/roleGate';
import OpportunitiesPage from './PageClient';

export default async function Page() {
    await blockEditorAccess();
    return <OpportunitiesPage />;
}
