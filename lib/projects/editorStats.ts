'use server';

import { supabase } from '../../src/lib/supabase';
import { ensureAuthenticated } from '../../src/lib/safe-action';

export type EditorStats = {
    assigned: number;
    inProgress: number;
    inReview: number;
    done: number;
    deadlines: { id: string; name: string; pseudonym: string; dueDate: string; progress: string }[];
    weeklyCompleted: { week: string; count: number }[];
};

export async function getEditorDashboardStats(): Promise<EditorStats> {
    await ensureAuthenticated();

    const { data: all } = await supabase
        .from('edit_projects')
        .select('id, name, progress, due_date, created_at, completion_date')
        .order('due_date', { ascending: true, nullsFirst: false });

    const projects = all || [];

    const assigned = projects.length;
    const inProgress = projects.filter(p => p.progress === 'IN_PROGRESS' || p.progress === 'DOWNLOADED' || p.progress === 'DOWNLOADING').length;
    const inReview = projects.filter(p => p.progress === 'IN_REVIEW' || p.progress === 'REVISION').length;
    const done = projects.filter(p => p.progress === 'DONE' || p.progress === 'APPROVED' || p.progress === 'DELIVERED').length;

    const now = new Date();
    const upcoming = projects
        .filter(p => p.due_date && new Date(p.due_date) >= now && p.progress !== 'DONE' && p.progress !== 'APPROVED' && p.progress !== 'DELIVERED')
        .slice(0, 5)
        .map(p => ({
            id: p.id as string,
            name: p.name as string,
            pseudonym: `Project – ${(p.id as string).slice(0, 6)}`,
            dueDate: p.due_date as string,
            progress: p.progress as string,
        }));

    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const completed = projects.filter(p =>
        (p.progress === 'DONE' || p.progress === 'APPROVED' || p.progress === 'DELIVERED') &&
        p.completion_date && new Date(p.completion_date) >= fourWeeksAgo
    );

    const weekBuckets: Record<string, number> = {};
    for (let i = 3; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i * 7);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        weekBuckets[label] = 0;
    }

    const weekLabels = Object.keys(weekBuckets);
    for (const p of completed) {
        const cd = new Date(p.completion_date as string);
        const daysAgo = Math.floor((now.getTime() - cd.getTime()) / (1000 * 60 * 60 * 24));
        const weekIdx = 3 - Math.min(3, Math.floor(daysAgo / 7));
        const label = weekLabels[weekIdx];
        if (label !== undefined && weekBuckets[label] !== undefined) weekBuckets[label]++;
    }

    const weeklyCompleted = weekLabels.map(w => ({ week: w, count: weekBuckets[w] ?? 0 }));

    return { assigned, inProgress, inReview, done, deadlines: upcoming, weeklyCompleted };
}
