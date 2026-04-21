import { blockEditorAccess } from '../../../src/lib/roleGate';
import CampaignBuilderPage from './PageClient';

export const metadata = { title: 'New Campaign' };

export default async function Page() {
    await blockEditorAccess();
    return <CampaignBuilderPage />;
}
