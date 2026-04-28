import { getFreshSession } from '../../src/lib/roleGate';
import { redirect } from 'next/navigation';
import MyQueueClient from './PageClient';
export const metadata = { title: 'My Queue | Unibox' };
export default async function MyQueuePage() {
    const session = await getFreshSession();
    if (!session) redirect('/login');
    return <MyQueueClient />;
}
