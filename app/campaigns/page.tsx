import { blockEditorAccess } from '../../src/lib/roleGate';
import CampaignsPage from './PageClient';

export const metadata = { title: 'Campaigns' };

export default async function Page() {
    await blockEditorAccess();
    return <CampaignsPage />;
}
