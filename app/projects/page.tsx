import { getFreshSession } from '../../src/lib/roleGate';
import { redirect } from 'next/navigation';
import ProjectsClient from '../../components/projects/ProjectsClient';
import EditorWorkstation from '../../components/projects/EditorWorkstation';

export default async function ProjectsPage() {
    const session = await getFreshSession();
    if (!session) redirect('/login');

    if (session.role === 'VIDEO_EDITOR') {
        return <EditorWorkstation />;
    }

    return <ProjectsClient />;
}
