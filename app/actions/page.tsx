import { blockEditorAccess } from '../../src/lib/roleGate';
import ActionsPage from './PageClient';

export default async function Page() {
    await blockEditorAccess();
    return <ActionsPage />;
}
