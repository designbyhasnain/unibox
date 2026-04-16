import { blockEditorAccess } from '../../../src/lib/roleGate';
import CampaignDetailPage from './PageClient';

export default async function Page() {
    await blockEditorAccess();
    return <CampaignDetailPage />;
}
