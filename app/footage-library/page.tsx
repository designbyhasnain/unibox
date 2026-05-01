import { getFreshSession } from '../../src/lib/roleGate';
import { redirect } from 'next/navigation';
import FootageLibraryClient from './PageClient';
export const metadata = { title: 'Footage Library' };
export default async function FootageLibraryPage() {
    const session = await getFreshSession();
    if (!session) redirect('/login');
    return <FootageLibraryClient />;
}
