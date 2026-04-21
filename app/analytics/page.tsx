import { blockEditorAccess } from '../../src/lib/roleGate';
import AnalyticsPage from './PageClient';

export const metadata = { title: 'Analytics' };

export default async function Page() {
    await blockEditorAccess();
    return <AnalyticsPage />;
}
