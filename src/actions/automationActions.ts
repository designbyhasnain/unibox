'use server';

import { ensureAuthenticated } from '../lib/safe-action';
import { requireAdmin } from '../utils/accessControl';
import {
    getContactsNeedingFollowUp,
    detectWarmLeads,
    getReEngagementCandidates,
    getBestSendTimes,
    recalculateLeadScores,
    getTopLeads,
    runAllAutomations,
    type FollowUpCandidate,
} from '../services/salesAutomationService';

/** Get automation dashboard data */
export async function getAutomationDashboardAction() {
    const { role } = await ensureAuthenticated();
    requireAdmin(role);

    const [followUps, topLeads, sendTimes, warmLeads, reEngagement] = await Promise.all([
        getContactsNeedingFollowUp(3, 3),
        getTopLeads(10),
        getBestSendTimes(),
        detectWarmLeads(),
        getReEngagementCandidates(90),
    ]);

    return {
        success: true,
        followUps: followUps.slice(0, 20),
        followUpCount: followUps.length,
        topLeads,
        sendTimes,
        warmLeadsDetected: warmLeads,
        reEngagementCount: reEngagement.length,
        reEngagementCandidates: reEngagement.slice(0, 10),
    };
}

/** Recalculate all lead scores */
export async function recalculateScoresAction() {
    const { role } = await ensureAuthenticated();
    requireAdmin(role);
    const updated = await recalculateLeadScores();
    return { success: true, updated };
}

/** Run all automations manually */
export async function runAutomationsAction() {
    const { role } = await ensureAuthenticated();
    requireAdmin(role);
    const result = await runAllAutomations();
    return { success: true, ...result };
}

/** Get follow-up candidates */
export async function getFollowUpCandidatesAction(days: number = 3, maxFollowups: number = 3) {
    const { role } = await ensureAuthenticated();
    requireAdmin(role);
    const candidates = await getContactsNeedingFollowUp(days, maxFollowups);
    return { success: true, candidates };
}

/** Get best send times */
export async function getBestSendTimesAction() {
    const { role } = await ensureAuthenticated();
    requireAdmin(role);
    const data = await getBestSendTimes();
    return { success: true, ...data };
}
