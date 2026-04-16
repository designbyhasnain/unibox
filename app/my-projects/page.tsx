import { blockEditorAccess } from '../../src/lib/roleGate';
import MyProjectsPage from './PageClient';

export default async function Page() {
    await blockEditorAccess();
    return <MyProjectsPage />;
}
