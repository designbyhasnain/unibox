'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { isAdmin, blockEditorAccess } from '../utils/accessControl';
import { markContactClosed } from '../services/pipelineLogic';

/**
 * Pipeline reconciliation — enforce the rule:
 *   "If a contact has any project linked to them, they're a CLOSED client."
 *
 * Most of these contacts have an active project but were never moved past
 * LEAD/CONTACTED in the UI (humans don't reliably maintain pipeline_stage).
 * The data already proves the truth; we just need to write it.
 *
 * Both actions below are admin-only (and ACCOUNT_MANAGER, who functions as
 * an admin in this codebase). SALES users don't have permission to mass-
 * update other reps' books.
 */

export type MisclassifiedContact = {
    id: string;
    name: string | null;
    email: string;
    pipeline_stage: string | null;
    project_count: number;
    total_project_value: number;
    earliest_project_at: string | null;
};

export type PipelineReconcilePreview = {
    success: true;
    misclassified: MisclassifiedContact[];
    summary: {
        contactsWithProjects: number;
        misclassifiedCount: number;
        totalProjectValue: number;
        byStage: Record<string, number>;
    };
} | { success: false; error: string };

/**
 * Read-only preview of what the apply action would do. Powers /pipeline-cleanup.
 */
export async function previewMisclassifiedClientsAction(): Promise<PipelineReconcilePreview> {
    try {
        const { role } = await ensureAuthenticated();
        blockEditorAccess(role);
        if (!isAdmin(role)) {
            return { success: false, error: 'Admin access required' };
        }

        // 1. Pull every project (paginated to avoid the 1000-row Supabase cap).
        const projectByClient: Record<string, { count: number; sumValue: number; earliestCreatedAt: string }> = {};
        let off = 0;
        while (true) {
            const { data, error } = await supabase
                .from('projects')
                .select('client_id, project_value, created_at')
                .not('client_id', 'is', null)
                .range(off, off + 999);
            if (error) {
                return { success: false, error: `projects query: ${error.message}` };
            }
            if (!data || data.length === 0) break;
            for (const p of data) {
                const id = p.client_id as string | null;
                if (!id) continue;
                const cur = projectByClient[id] || { count: 0, sumValue: 0, earliestCreatedAt: p.created_at };
                cur.count++;
                if (typeof p.project_value === 'number' && Number.isFinite(p.project_value)) {
                    cur.sumValue += p.project_value;
                }
                if (p.created_at && p.created_at < cur.earliestCreatedAt) {
                    cur.earliestCreatedAt = p.created_at;
                }
                projectByClient[id] = cur;
            }
            if (data.length < 1000) break;
            off += 1000;
        }
        const clientIds = Object.keys(projectByClient);
        if (clientIds.length === 0) {
            return {
                success: true,
                misclassified: [],
                summary: { contactsWithProjects: 0, misclassifiedCount: 0, totalProjectValue: 0, byStage: {} },
            };
        }

        // 2. Fetch the corresponding contacts (in chunks — `.in()` may have a soft limit).
        const contacts: { id: string; name: string | null; email: string; pipeline_stage: string | null; is_client: boolean | null }[] = [];
        for (let i = 0; i < clientIds.length; i += 200) {
            const batch = clientIds.slice(i, i + 200);
            const { data, error } = await supabase
                .from('contacts')
                .select('id, name, email, pipeline_stage, is_client')
                .in('id', batch);
            if (error) {
                return { success: false, error: `contacts query: ${error.message}` };
            }
            if (data) contacts.push(...(data as any));
        }

        const misclassified: MisclassifiedContact[] = [];
        const byStage: Record<string, number> = {};
        let totalProjectValue = 0;

        for (const c of contacts) {
            const proj = projectByClient[c.id];
            if (!proj) continue;
            totalProjectValue += proj.sumValue;
            const isClosedAlready = c.pipeline_stage === 'CLOSED' && c.is_client === true;
            if (isClosedAlready) continue;
            const stageKey = c.pipeline_stage || 'NULL';
            byStage[stageKey] = (byStage[stageKey] ?? 0) + 1;
            misclassified.push({
                id: c.id,
                name: c.name,
                email: c.email,
                pipeline_stage: c.pipeline_stage,
                project_count: proj.count,
                total_project_value: proj.sumValue,
                earliest_project_at: proj.earliestCreatedAt,
            });
        }

        // Largest-deal-first reads more usefully on screen than ordering by id.
        misclassified.sort((a, b) => b.total_project_value - a.total_project_value);

        return {
            success: true,
            misclassified,
            summary: {
                contactsWithProjects: clientIds.length,
                misclassifiedCount: misclassified.length,
                totalProjectValue,
                byStage,
            },
        };
    } catch (err: any) {
        console.error('[previewMisclassifiedClientsAction]', err);
        return { success: false, error: err?.message || 'Failed to compute preview.' };
    }
}

export type PipelineReconcileApply = {
    success: true;
    scanned: number;
    flipped: number;
    failed: number;
    sample: { id: string; name: string | null; previousStage: string | null }[];
} | { success: false; error: string };

/**
 * The bulk apply. Walks every contact with at least one project and ensures
 * pipeline_stage = CLOSED + is_client = true. Idempotent.
 *
 * Production-write — admin-only. The /pipeline-cleanup UI gates the button
 * behind a confirm step.
 */
export async function reconcileClientStatusAction(): Promise<PipelineReconcileApply> {
    try {
        const { role } = await ensureAuthenticated();
        blockEditorAccess(role);
        if (!isAdmin(role)) {
            return { success: false, error: 'Admin access required' };
        }

        const preview = await previewMisclassifiedClientsAction();
        if (!preview.success) return { success: false, error: preview.error };

        const scanned = preview.misclassified.length;
        let flipped = 0;
        let failed = 0;
        const sample: { id: string; name: string | null; previousStage: string | null }[] = [];

        for (const c of preview.misclassified) {
            const res = await markContactClosed(c.id, c.earliest_project_at ?? undefined);
            if (res.error) {
                failed++;
                continue;
            }
            if (res.flipped) {
                flipped++;
                if (sample.length < 10) {
                    sample.push({ id: c.id, name: c.name, previousStage: res.previousStage });
                }
            }
        }

        revalidatePath('/');
        revalidatePath('/clients');
        revalidatePath('/opportunities');
        revalidatePath('/pipeline-cleanup');

        return { success: true, scanned, flipped, failed, sample };
    } catch (err: any) {
        console.error('[reconcileClientStatusAction]', err);
        return { success: false, error: err?.message || 'Reconciliation failed.' };
    }
}
