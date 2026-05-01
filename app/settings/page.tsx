import { getFreshSession } from '../../src/lib/roleGate';
import { redirect } from 'next/navigation';
import SettingsClient from './PageClient';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
    const session = await getFreshSession();
    if (!session) redirect('/login');
    return <SettingsClient />;
}
