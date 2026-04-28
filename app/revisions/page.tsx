import { getFreshSession } from '../../src/lib/roleGate';
import { redirect } from 'next/navigation';
import RevisionsClient from './PageClient';
export const metadata = { title: 'Revisions | Unibox' };
export default async function RevisionsPage() {
    const session = await getFreshSession();
    if (!session) redirect('/login');
    return <RevisionsClient />;
}
