import { blockEditorAccess } from '../../src/lib/roleGate';
import MyProjectsPage from './PageClient';

export const metadata = { title: 'My Projects' };

export default async function Page() {
    await blockEditorAccess();
    return <MyProjectsPage />;
}
