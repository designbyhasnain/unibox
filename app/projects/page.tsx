import { getFreshSession } from '../../src/lib/roleGate';
import { redirect } from 'next/navigation';
import ProjectsClient from '../../components/projects/ProjectsClient';

export default async function ProjectsPage() {
    const session = await getFreshSession();
    if (!session) redirect('/login');

    return <ProjectsClient userRole={session.role} />;
}
