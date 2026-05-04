import { blockEditorAccess } from '../../../src/utils/accessControl';
import { ensureAuthenticated } from '../../../src/lib/safe-action';
import GoalPlannerClient from './GoalPlannerClient';

export const metadata = { title: 'Goal Planner' };

export default async function Page() {
    const { role } = await ensureAuthenticated();
    blockEditorAccess(role);
    return <GoalPlannerClient />;
}
