'use server';

import { ensureAuthenticated } from '../lib/safe-action';
import { blockEditorAccess } from '../utils/accessControl';
import { supabase } from '../lib/supabase';
import { computeGoalProgress, getActiveGoal, type GoalProgress } from '../services/goalTrackingService';

/**
 * Read the calling user's active goal (per-user scope, decided in plan).
 * Returns null if no active goal — the dashboard card hides in that case.
 */
export async function getActiveGoalProgressAction(): Promise<{
    success: true;
    progress: GoalProgress | null;
} | { success: false; error: string }> {
    try {
        const { userId, role } = await ensureAuthenticated();
        blockEditorAccess(role);

        const goal = await getActiveGoal(userId);
        if (!goal) return { success: true, progress: null };

        const progress = await computeGoalProgress(goal.id);
        return { success: true, progress };
    } catch (err: any) {
        console.error('[goalTracking] getActiveGoalProgressAction error:', err);
        return { success: false, error: err?.message || 'Failed to read goal progress.' };
    }
}

/**
 * Soft-cancel the active goal. Doesn't touch attached campaigns — those keep
 * running on whatever schedule they have. Rep can fire a new goal afterward.
 */
export async function cancelActiveGoalAction(): Promise<{ success: boolean; error?: string }> {
    try {
        const { userId, role } = await ensureAuthenticated();
        blockEditorAccess(role);

        const goal = await getActiveGoal(userId);
        if (!goal) return { success: false, error: 'No active goal to cancel.' };

        const { error } = await supabase
            .from('goals')
            .update({ status: 'CANCELLED' })
            .eq('id', goal.id);
        if (error) return { success: false, error: error.message };

        return { success: true };
    } catch (err: any) {
        console.error('[goalTracking] cancelActiveGoalAction error:', err);
        return { success: false, error: err?.message || 'Failed to cancel goal.' };
    }
}
