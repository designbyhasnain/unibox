import { getFreshSession } from '../../src/lib/roleGate';
import { redirect } from 'next/navigation';
import DeliveredClient from './PageClient';
export const metadata = { title: 'Delivered | Unibox' };
export default async function DeliveredPage() {
    const session = await getFreshSession();
    if (!session) redirect('/login');
    return <DeliveredClient />;
}
