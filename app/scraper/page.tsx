import { redirect } from 'next/navigation';
import { getSession } from '../../src/lib/auth';
import ScraperClient from './ScraperClient';

export default async function ScraperPage() {
    const session = await getSession();
    if (!session) redirect('/login');
    if (session.role !== 'ADMIN' && session.role !== 'ACCOUNT_MANAGER') {
        redirect('/');
    }
    return <ScraperClient />;
}
