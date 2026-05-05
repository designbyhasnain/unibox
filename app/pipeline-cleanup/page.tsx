import { ensureAuthenticated } from '../../src/lib/safe-action';
import { isAdmin } from '../../src/utils/accessControl';
import { redirect } from 'next/navigation';
import PipelineCleanupClient from './PipelineCleanupClient';

export const metadata = { title: 'Pipeline cleanup' };

export default async function Page() {
    const { role } = await ensureAuthenticated();
    if (!isAdmin(role)) redirect('/');
    return <PipelineCleanupClient />;
}
