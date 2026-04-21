import { blockEditorAccess } from '../../src/lib/roleGate';
import JarvisPage from './PageClient';

export const metadata = { title: 'Jarvis' };

export default async function Page() {
    await blockEditorAccess();
    return <JarvisPage />;
}
