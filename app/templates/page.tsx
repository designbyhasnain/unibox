import { blockEditorAccess } from '../../src/lib/roleGate';
import TemplatesPage from './PageClient';

export default async function Page() {
    await blockEditorAccess();
    return <TemplatesPage />;
}
