import 'server-only';
import { supabase } from '../lib/supabase';
import { generateDailyBriefing } from './dailyBriefingService';

/**
 * Phase 10 — pre-compute Jarvis daily briefings for every active user
 * on a schedule so the dashboard never waits for Groq at request time.
 *
 * Hourly cron at /api/cron/precompute-briefings calls this. For each
 * ACTIVE user we generate a briefing scoped to their role and upsert
 * into user_briefings. Errors per-user are logged but don't fail the
 * whole batch.
 *
 * Cost: ~30 users × 1 Groq call/hr ≈ 720 calls/day. Llama 3.1 8B free
 * tier easily covers this.
 */

interface BatchResult {
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    perUser: Array<{ userId: string; status: 'ok' | 'fail' | 'skip'; ms: number; error?: string }>;
}

export async function precomputeAllBriefings(): Promise<BatchResult> {
    const result: BatchResult = { processed: 0, succeeded: 0, failed: 0, skipped: 0, perUser: [] };

    // ACTIVE non-editor users only. Editors don't see the briefing
    // (their dashboard surface is EditorTodayView), so don't burn quota.
    const { data: users, error } = await supabase
        .from('users')
        .select('id, role, crm_status')
        .neq('role', 'VIDEO_EDITOR')
        .eq('crm_status', 'ACTIVE');

    if (error) {
        console.error('[precompute] failed to load users:', error.message);
        return result;
    }

    for (const u of users || []) {
        result.processed++;
        const start = Date.now();
        try {
            const briefing = await generateDailyBriefing(u.id, u.role);
            const { error: upsertErr } = await supabase
                .from('user_briefings')
                .upsert({
                    user_id: u.id,
                    role: u.role,
                    briefing: briefing as unknown as Record<string, unknown>,
                    generated_at: new Date().toISOString(),
                }, { onConflict: 'user_id' });

            if (upsertErr) {
                result.failed++;
                result.perUser.push({ userId: u.id, status: 'fail', ms: Date.now() - start, error: upsertErr.message });
            } else {
                result.succeeded++;
                result.perUser.push({ userId: u.id, status: 'ok', ms: Date.now() - start });
            }
        } catch (err: unknown) {
            result.failed++;
            const msg = err instanceof Error ? err.message : 'unknown';
            result.perUser.push({ userId: u.id, status: 'fail', ms: Date.now() - start, error: msg });
            console.error(`[precompute] user ${u.id} failed:`, msg);
        }
    }

    return result;
}
