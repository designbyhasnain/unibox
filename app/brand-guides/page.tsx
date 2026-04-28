import { getFreshSession } from '../../src/lib/roleGate';
import { redirect } from 'next/navigation';
export const metadata = { title: 'Brand Guides | Unibox' };
export default async function BrandGuidesPage() {
    const session = await getFreshSession();
    if (!session) redirect('/login');
    return (
        <div style={{ padding: '40px 36px', height: '100%', overflowY: 'auto' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Brand Guides</h1>
            <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Client brand guidelines and style references.</p>
        </div>
    );
}
