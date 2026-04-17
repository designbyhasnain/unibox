'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getOwnerFilter, blockEditorAccess } from '../utils/accessControl';

export type RelationshipAlert = {
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
};

export type RelationshipInsight = {
    health: string;
    lastDirection: string;
    daysSince: number;
    sent: number;
    received: number;
    threads: number;
    firstEmail: string | null;
    lastEmail: string | null;
    alerts: RelationshipAlert[];
    theirWaiting: boolean;
};

/** Analyze a single contact's relationship */
export async function getRelationshipInsightAction(contactId: string): Promise<RelationshipInsight | null> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!contactId) return null;

    // For SALES, confirm the contact belongs to them before running analysis
    const ownerFilter = getOwnerFilter(userId, role);
    if (ownerFilter) {
        const { data: owned } = await supabase
            .from('contacts')
            .select('id')
            .eq('id', contactId)
            .eq('account_manager_id', ownerFilter)
            .maybeSingle();
        if (!owned) return null;
    }

    const { data, error } = await supabase.rpc('analyze_contact_relationship', {
        p_contact_id: contactId,
    });

    if (error || !data) return null;
    return {
        health: data.health || 'unknown',
        lastDirection: data.lastDirection || 'unknown',
        daysSince: data.daysSince || 0,
        sent: data.sent || 0,
        received: data.received || 0,
        threads: data.threads || 0,
        firstEmail: data.firstEmail || null,
        lastEmail: data.lastEmail || null,
        alerts: (data.alerts || []).map((a: any) => ({
            type: a.type,
            severity: a.severity,
            message: a.message,
        })),
        theirWaiting: data.theirWaiting || false,
    };
}

/** Get all contacts with critical/high alerts */
export async function getCriticalRelationshipsAction(): Promise<any[]> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);

    let q = supabase
        .from('contacts')
        .select('id, name, email, relationship_health, alerts, total_emails_received, days_since_last_contact, pipeline_stage')
        .in('relationship_health', ['critical'])
        .gt('total_emails_received', 0);
    if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
    const { data } = await q.order('total_emails_received', { ascending: false }).limit(20);

    return (data || []).filter(c => !c.email?.includes('rafay') && !c.email?.includes('mailer-daemon'));
}

/** Get lost engagement opportunities */
export async function getLostEngagementAction(): Promise<any[]> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);

    let q = supabase
        .from('contacts')
        .select('id, name, email, total_emails_received, days_since_last_contact, pipeline_stage')
        .eq('relationship_health', 'dead')
        .gt('total_emails_received', 2);
    if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
    const { data } = await q.order('total_emails_received', { ascending: false }).limit(20);

    return data || [];
}

/** Run batch analysis for all contacts */
export async function runRelationshipAnalysisAction(): Promise<{ analyzed: number }> {
    await ensureAuthenticated();
    const { data } = await supabase.rpc('analyze_all_relationships');
    return { analyzed: data || 0 };
}
