'use server';

import { ensureAuthenticated } from '../lib/safe-action';
import { blockEditorAccess } from '../utils/accessControl';
import {
    deriveLookalikeQueries,
    sourceLeads,
    type LookalikeQuery,
    type SourceLeadsResult,
} from '../services/leadSupplyService';

/**
 * Phase-C ambient lead supply — server actions consumed by the
 * SourceLeadsModal inside Goal Planner.
 */

/**
 * Build the auto-suggested lookalike queries for the modal's first
 * render. The rep edits/adds/removes before calling sourceLeadsAction.
 */
export async function previewQueriesAction(limit = 8): Promise<{
    success: boolean;
    queries: LookalikeQuery[];
    error?: string;
}> {
    const { role } = await ensureAuthenticated();
    blockEditorAccess(role);
    try {
        const queries = await deriveLookalikeQueries(limit);
        return { success: true, queries };
    } catch (err: any) {
        console.error('[leadSupply] previewQueriesAction error:', err);
        return { success: false, queries: [], error: err?.message || 'Failed to derive queries' };
    }
}

/**
 * Run a batch of queries through the lookalike engine. Returns the
 * full SourceLeadsResult (placesFound, contactsAdded, errors, etc.)
 * so the modal can render live status.
 */
export async function sourceLeadsAction(queries: LookalikeQuery[]): Promise<{
    success: boolean;
    result?: SourceLeadsResult;
    error?: string;
}> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);

    if (!Array.isArray(queries) || queries.length === 0) {
        return { success: false, error: 'No queries supplied' };
    }
    // Sanity caps — the modal shouldn't be firing more than 20 queries
    // in a single click; if it tries, clip + warn rather than refuse.
    const trimmed = queries.slice(0, 20);

    try {
        const result = await sourceLeads(trimmed, {
            ownerUserId: userId,
            sourceTag: 'lookalike_google',
        });
        return { success: result.status === 'ok' || result.status === 'cap_reached', result };
    } catch (err: any) {
        console.error('[leadSupply] sourceLeadsAction error:', err);
        return { success: false, error: err?.message || 'Sourcing failed' };
    }
}
