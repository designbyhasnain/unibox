import { requireAdminAccess } from '../../src/lib/roleGate';
import BrandingPage from './PageClient';

export const metadata = { title: 'Branding & Deliverability' };

export default async function Page() {
    await requireAdminAccess();
    return <BrandingPage />;
}
