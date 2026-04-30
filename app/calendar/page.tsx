import { getFreshSession } from '../../src/lib/roleGate';
import { redirect } from 'next/navigation';
import CalendarClient from './PageClient';
export const metadata = { title: 'Calendar' };
export default async function CalendarPage() {
    const session = await getFreshSession();
    if (!session) redirect('/login');
    return <CalendarClient />;
}
