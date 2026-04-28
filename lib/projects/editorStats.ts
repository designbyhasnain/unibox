'use server';

import { supabase } from '../../src/lib/supabase';
import { ensureAuthenticated } from '../../src/lib/safe-action';
import { getSession } from '../../src/lib/auth';

/* ── Editor Today Dashboard ─────────────────────────────── */

export type EditorTodayProject = {
    id: string;
    name: string;
    clientName: string | null;
    progress: string;
    formulaPercent: number;
    dueDate: string | null;
    sizeInGbs: string | null;
    hardDrive: string | null;
    workingHours: number;
    actualHours: number;
    dataChecked: boolean;
    priority: string | null;
    latestComment: { content: string; authorName: string; createdAt: string } | null;
};

export type EditorTodayData = {
    userName: string;
    activeProjects: EditorTodayProject[];
    weekProjects: { id: string; name: string; clientName: string | null; dueDate: string; progress: string }[];
    feedbackItems: { projectId: string; projectName: string; clientName: string | null; content: string; authorName: string; createdAt: string }[];
    blockers: EditorTodayProject[];
    weeklyLoadHours: number;
    weeklyCapacity: number;
};

export async function getEditorTodayData(): Promise<EditorTodayData> {
    const { userId } = await ensureAuthenticated();
    const session = await getSession();
    const name = session?.name || 'Editor';

    const ACTIVE = ['IN_PROGRESS', 'IN_REVISION', 'DOWNLOADING', 'DOWNLOADED', 'ON_HOLD'];

    const { data: projects } = await supabase
        .from('edit_projects')
        .select('id, name, client_name, progress, formula_percent, due_date, size_in_gbs, hard_drive, working_hours, actual_hours, data_checked, priority')
        .eq('user_id', userId)
        .in('progress', ACTIVE)
        .order('due_date', { ascending: true, nullsFirst: false });

    const active = projects || [];
    const projectIds = active.map(p => p.id as string);

    // Latest comment per project
    let latestCommentByProject: Record<string, { content: string; authorName: string; createdAt: string }> = {};
    let feedbackItems: EditorTodayData['feedbackItems'] = [];

    if (projectIds.length > 0) {
        const { data: comments } = await supabase
            .from('project_comments')
            .select('id, project_id, content, author_name, created_at')
            .in('project_id', projectIds)
            .order('created_at', { ascending: false })
            .limit(50);

        for (const c of comments || []) {
            const pid = c.project_id as string;
            if (!latestCommentByProject[pid]) {
                latestCommentByProject[pid] = { content: c.content as string, authorName: c.author_name as string, createdAt: c.created_at as string };
            }
        }

        // Feedback feed: latest unique comment per project, for the right panel
        const seen = new Set<string>();
        for (const c of comments || []) {
            const pid = c.project_id as string;
            if (seen.has(pid)) continue;
            seen.add(pid);
            const proj = active.find(p => p.id === pid);
            if (proj) {
                feedbackItems.push({
                    projectId: pid,
                    projectName: proj.name as string,
                    clientName: proj.client_name as string | null,
                    content: c.content as string,
                    authorName: c.author_name as string,
                    createdAt: c.created_at as string,
                });
            }
        }
    }

    // Build typed project list
    const activeProjects: EditorTodayProject[] = active.map(p => ({
        id: p.id as string,
        name: p.name as string,
        clientName: p.client_name as string | null,
        progress: p.progress as string,
        formulaPercent: (p.formula_percent as number) || 0,
        dueDate: p.due_date as string | null,
        sizeInGbs: p.size_in_gbs as string | null,
        hardDrive: p.hard_drive as string | null,
        workingHours: (p.working_hours as number) || 0,
        actualHours: (p.actual_hours as number) || 0,
        dataChecked: (p.data_checked as boolean) || false,
        priority: p.priority as string | null,
        latestComment: latestCommentByProject[p.id as string] || null,
    }));

    // This-week projects (Mon–Sun) for calendar strip — all active
    const today = new Date();
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const weekProjects = activeProjects
        .filter(p => p.dueDate && new Date(p.dueDate) >= monday && new Date(p.dueDate) <= sunday)
        .map(p => ({ id: p.id, name: p.name, clientName: p.clientName, dueDate: p.dueDate!, progress: p.progress }));

    // Blockers: no data_checked OR no hard_drive
    const blockers = activeProjects.filter(p => !p.dataChecked || !p.hardDrive);

    // Weekly load
    const weeklyLoadHours = activeProjects.reduce((sum, p) => sum + p.workingHours, 0);

    return {
        userName: (name as string) || 'Editor',
        activeProjects,
        weekProjects,
        feedbackItems,
        blockers,
        weeklyLoadHours,
        weeklyCapacity: 40,
    };
}

export async function getEditorActiveCountAction(): Promise<{ active: number; revisions: number }> {
    const { userId } = await ensureAuthenticated();

    const { count: active } = await supabase
        .from('edit_projects')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('progress', ['IN_PROGRESS', 'IN_REVISION', 'DOWNLOADING', 'DOWNLOADED']);

    const { count: revisions } = await supabase
        .from('edit_projects')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('progress', 'IN_REVISION');

    return { active: active || 0, revisions: revisions || 0 };
}

/* ── Project Detail (for drawer) ────────────────────────── */

export type EditorProjectDetailData = {
    id: string;
    name: string;
    clientName: string | null;
    progress: string;
    formulaPercent: number;
    dueDate: string | null;
    sizeInGbs: string | null;
    hardDrive: string | null;
    rawDataUrl: string | null;
    priority: string | null;
    notes: string | null;
    workingHours: number;
    actualHours: number;
    briefLength: string | null;
    software: string | null;
    dataChecked: boolean;
    editor: string | null;
    accountManager: string | null;
    comments: { id: string; content: string; authorName: string; createdAt: string }[];
};

export async function getEditorProjectDetail(projectId: string): Promise<EditorProjectDetailData | null> {
    const { userId } = await ensureAuthenticated();

    const { data: project } = await supabase
        .from('edit_projects')
        .select('id, name, client_name, progress, formula_percent, due_date, size_in_gbs, hard_drive, raw_data_url, priority, notes, working_hours, actual_hours, brief_length, software, data_checked, editor, account_manager')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

    if (!project) return null;

    const { data: comments } = await supabase
        .from('project_comments')
        .select('id, content, author_name, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(30);

    return {
        id: project.id as string,
        name: project.name as string,
        clientName: project.client_name as string | null,
        progress: project.progress as string,
        formulaPercent: (project.formula_percent as number) || 0,
        dueDate: project.due_date as string | null,
        sizeInGbs: project.size_in_gbs as string | null,
        hardDrive: project.hard_drive as string | null,
        rawDataUrl: project.raw_data_url as string | null,
        priority: project.priority as string | null,
        notes: project.notes as string | null,
        workingHours: (project.working_hours as number) || 0,
        actualHours: (project.actual_hours as number) || 0,
        briefLength: project.brief_length as string | null,
        software: project.software as string | null,
        dataChecked: (project.data_checked as boolean) || false,
        editor: project.editor as string | null,
        accountManager: project.account_manager as string | null,
        comments: (comments || []).map(c => ({
            id: c.id as string,
            content: c.content as string,
            authorName: c.author_name as string,
            createdAt: c.created_at as string,
        })),
    };
}

/* ── My Queue ───────────────────────────────────────────── */

export type EditorQueueProject = {
    id: string;
    name: string;
    clientName: string | null;
    progress: string;
    formulaPercent: number;
    date: string | null;
    dueDate: string | null;
    sizeInGbs: string | null;
    priority: string | null;
    dataChecked: boolean;
    hardDrive: string | null;
    workingHours: number;
    commentCount: number;
    latestFeedback: string | null;
};

/**
 * Returns the editor's full active-project list. Filtering + search are done in
 * the client for instant feel — the row count per editor is small (≤ ~30) so
 * a single fetch + in-memory filter beats per-keystroke server roundtrips.
 *
 * Identity scope: rows are restricted to `edit_projects.user_id === session.userId`.
 * The SELECT intentionally excludes financial fields (`initial_project_value`,
 * `total_amount`, `paid`, `received_1`, etc.) so editors never see revenue.
 */
export async function getEditorMyQueueData(): Promise<{ projects: EditorQueueProject[]; userName: string }> {
    const { userId } = await ensureAuthenticated();
    const session = await getSession();
    const name = session?.name || 'Editor';

    const ACTIVE = ['IN_PROGRESS', 'IN_REVISION', 'DOWNLOADING', 'DOWNLOADED', 'ON_HOLD'];

    const { data: projects } = await supabase
        .from('edit_projects')
        .select('id, name, client_name, progress, formula_percent, date, due_date, size_in_gbs, priority, data_checked, hard_drive, working_hours')
        .eq('user_id', userId)
        .in('progress', ACTIVE)
        .order('due_date', { ascending: true, nullsFirst: false });

    const all = projects || [];
    const projectIds = all.map(p => p.id as string);

    const latestFeedbackByProject: Record<string, string> = {};
    const commentCountByProject: Record<string, number> = {};

    if (projectIds.length > 0) {
        const { data: comments } = await supabase
            .from('project_comments')
            .select('project_id, content, created_at')
            .in('project_id', projectIds)
            .order('created_at', { ascending: false })
            .limit(200);

        for (const c of comments || []) {
            const pid = c.project_id as string;
            if (!latestFeedbackByProject[pid]) latestFeedbackByProject[pid] = c.content as string;
            commentCountByProject[pid] = (commentCountByProject[pid] || 0) + 1;
        }
    }

    const result = all.map(p => ({
        id: p.id as string,
        name: p.name as string,
        clientName: p.client_name as string | null,
        progress: p.progress as string,
        formulaPercent: (p.formula_percent as number) || 0,
        date: p.date as string | null,
        dueDate: p.due_date as string | null,
        sizeInGbs: p.size_in_gbs as string | null,
        priority: p.priority as string | null,
        dataChecked: (p.data_checked as boolean) || false,
        hardDrive: p.hard_drive as string | null,
        workingHours: (p.working_hours as number) || 0,
        commentCount: commentCountByProject[p.id as string] || 0,
        latestFeedback: latestFeedbackByProject[p.id as string] || null,
    }));

    return { projects: result, userName: name as string };
}

/* ── Revisions inbox ────────────────────────────────────── */

export type EditorRevisionItem = {
    projectId: string;
    projectName: string;
    clientName: string | null;
    progress: string;
    commentCount: number;
    latestComment: { id: string; content: string; authorName: string; createdAt: string } | null;
    allComments: { id: string; content: string; authorName: string; createdAt: string }[];
    isNew: boolean;
};

export async function getEditorRevisionsData(): Promise<{ items: EditorRevisionItem[] }> {
    const { userId } = await ensureAuthenticated();

    const { data: projects } = await supabase
        .from('edit_projects')
        .select('id, name, client_name, progress, updated_at')
        .eq('user_id', userId)
        .in('progress', ['IN_REVISION', 'IN_PROGRESS', 'DOWNLOADING', 'DOWNLOADED', 'ON_HOLD'])
        .order('updated_at', { ascending: false });

    const all = projects || [];
    const projectIds = all.map(p => p.id as string);
    if (projectIds.length === 0) return { items: [] };

    const { data: comments } = await supabase
        .from('project_comments')
        .select('id, project_id, content, author_name, created_at')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false });

    const commentsByProject: Record<string, Array<{ id: string; content: string; authorName: string; createdAt: string }>> = {};
    for (const c of comments || []) {
        const pid = c.project_id as string;
        if (!commentsByProject[pid]) commentsByProject[pid] = [];
        commentsByProject[pid].push({ id: c.id as string, content: c.content as string, authorName: c.author_name as string, createdAt: c.created_at as string });
    }

    const oneHourAgo = Date.now() - 3_600_000;
    const items: EditorRevisionItem[] = all
        .filter(p => (commentsByProject[p.id as string] || []).length > 0)
        .map(p => {
            const pc = commentsByProject[p.id as string] || [];
            const latest = pc[0];
            return {
                projectId: p.id as string,
                projectName: p.name as string,
                clientName: p.client_name as string | null,
                progress: p.progress as string,
                commentCount: pc.length,
                latestComment: latest || null,
                allComments: pc,
                isNew: latest ? new Date(latest.createdAt).getTime() > oneHourAgo : false,
            };
        });

    return { items };
}

/* ── Delivered portfolio ────────────────────────────────── */

export type EditorDeliveredProject = {
    id: string;
    name: string;
    clientName: string | null;
    completionDate: string | null;
    turnaroundDays: number | null;
    revisionCount: number;
    rating: number | null;
    progress: string;
    tags: string[];
};

export async function getEditorDeliveredData(): Promise<{ projects: EditorDeliveredProject[] }> {
    const { userId } = await ensureAuthenticated();

    const { data: projects } = await supabase
        .from('edit_projects')
        .select('id, name, client_name, progress, completion_date, date, rated_by_ch, tags')
        .eq('user_id', userId)
        .in('progress', ['APPROVED', 'DONE'])
        .order('completion_date', { ascending: false, nullsFirst: false })
        .limit(50);

    const all = projects || [];
    const projectIds = all.map(p => p.id as string);
    const commentCountByProject: Record<string, number> = {};

    if (projectIds.length > 0) {
        const { data: comments } = await supabase.from('project_comments').select('project_id').in('project_id', projectIds);
        for (const c of comments || []) {
            const pid = c.project_id as string;
            commentCountByProject[pid] = (commentCountByProject[pid] || 0) + 1;
        }
    }

    return {
        projects: all.map(p => {
            const start = p.date ? new Date(p.date as string) : null;
            const end = p.completion_date ? new Date(p.completion_date as string) : null;
            const turnaround = start && end ? Math.round((end.getTime() - start.getTime()) / 86_400_000) : null;
            return {
                id: p.id as string,
                name: p.name as string,
                clientName: p.client_name as string | null,
                completionDate: p.completion_date as string | null,
                turnaroundDays: turnaround,
                revisionCount: commentCountByProject[p.id as string] || 0,
                rating: p.rated_by_ch as number | null,
                progress: p.progress as string,
                tags: (p.tags as string[]) || [],
            };
        }),
    };
}

export type EditorStats = {
    assigned: number;
    inProgress: number;
    inReview: number;
    done: number;
    deadlines: { id: string; name: string; pseudonym: string; dueDate: string; progress: string }[];
    weeklyCompleted: { week: string; count: number }[];
};

export async function getEditorDashboardStats(): Promise<EditorStats> {
    const { userId } = await ensureAuthenticated();

    const { data: all } = await supabase
        .from('edit_projects')
        .select('id, name, progress, due_date, created_at, completion_date')
        .eq('user_id', userId)
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
