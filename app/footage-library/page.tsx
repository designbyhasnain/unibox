import { getFreshSession } from '../../src/lib/roleGate';
import { redirect } from 'next/navigation';
export const metadata = { title: 'Footage Library | Unibox' };
export default async function FootageLibraryPage() {
    const session = await getFreshSession();
    if (!session) redirect('/login');
    return (
        <div style={{ padding: '40px 36px', height: '100%', overflowY: 'auto' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Footage Library</h1>
            <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Your raw footage links from active projects appear here.</p>
        </div>
    );
}
