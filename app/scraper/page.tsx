import { redirect } from 'next/navigation';
import { getSession } from '../../src/lib/auth';
import { supabase } from '../../src/lib/supabase';
import ScraperClient from './ScraperClient';

export default async function ScraperPage() {
    const session = await getSession();
    if (!session) redirect('/login');

    const { data: user } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.userId)
        .maybeSingle();

    if (!user || (user.role !== 'ADMIN' && user.role !== 'ACCOUNT_MANAGER')) {
        redirect('/');
    }
    return <ScraperClient />;
}
