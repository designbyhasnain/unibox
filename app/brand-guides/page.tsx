import { getFreshSession } from '../../src/lib/roleGate';
import { redirect } from 'next/navigation';
import BrandGuidesClient from './PageClient';
export const metadata = { title: 'Brand Guides' };
export default async function BrandGuidesPage() {
    const session = await getFreshSession();
    if (!session) redirect('/login');
    return <BrandGuidesClient />;
}
