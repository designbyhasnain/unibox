import { blockEditorAccess } from '../../../src/lib/roleGate';
import CampaignBuilderPage from './PageClient';

export default async function Page() {
    await blockEditorAccess();
    return <CampaignBuilderPage />;
}
