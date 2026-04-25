import 'server-only';
import type { ActiveProject, ClientAlert, ClientIntelligenceProfile, InboxSignals, TimelineEvent } from '../types/clientIntelligence';

// ─── Inbox Signal Extraction ────────────────────────────────────────────────
export function extractInboxSignals(emails: Array<{
    direction: string;
    subject: string | null;
    snippet: string | null;
    sent_at: string;
}>): InboxSignals {
    const received = emails.filter(e => e.direction === 'RECEIVED');
    const sent     = emails.filter(e => e.direction === 'SENT');

    const lastReceived = received[0]?.sent_at ?? null;
    const lastSent     = sent[0]?.sent_at ?? null;

    const awaitingOurReply   = !!(lastReceived && (!lastSent || lastReceived > lastSent));
    const awaitingTheirReply = !!(lastSent && (!lastReceived || lastSent > lastReceived));

    const recentText = emails.slice(0, 10)
        .map(e => ((e.snippet || '') + ' ' + (e.subject || '')).toLowerCase())
        .join(' ');

    const daysSinceLastReceived = lastReceived
        ? Math.floor((Date.now() - new Date(lastReceived).getTime()) / 86400000)
        : null;
    const daysSinceLastSent = lastSent
        ? Math.floor((Date.now() - new Date(lastSent).getTime()) / 86400000)
        : null;

    return {
        awaitingOurReply,
        awaitingTheirReply,
        clientMentionedPayment:    /\b(paid|wire|transfer|sent payment|invoice|payment sent|receipt)\b/.test(recentText),
        clientAskingAboutDeadline: /\b(when|deadline|eta|ready|how long|update|progress|status)\b/.test(recentText),
        clientMentionedFiles:      /\b(files|dropbox|drive|download|footage|link|access|folder)\b/.test(recentText),
        clientExpressedFrustration:/\b(still waiting|no response|follow up|haven't heard|urgent|please)\b/.test(recentText),
        daysSinceLastReceived,
        daysSinceLastSent,
        recentSubjects:            emails.slice(0, 5).map(e => e.subject || ''),
    };
}

// ─── Urgency Scoring ──────────────────────────────────────────────────────────
export function computeUrgencyScore(
    project: { am_review: string; due_date: string | null; progress: string },
    inboxSignals: InboxSignals
): number {
    let score = 0;

    if (project.am_review === 'HAS_ISSUE') score += 10;

    if (project.due_date) {
        const daysUntilDue = Math.floor((new Date(project.due_date).getTime() - Date.now()) / 86400000);
        if (daysUntilDue < 0)   score += 8 * Math.abs(daysUntilDue); // overdue: +8 per day past deadline
        else if (daysUntilDue < 3)  score += 6;
        else if (daysUntilDue < 7)  score += 3;
    }

    if (inboxSignals.clientMentionedFiles)        score += 5;
    if (inboxSignals.clientAskingAboutDeadline)   score += 4;
    if (project.progress === 'IN_REVISION')       score += 3;
    if (project.progress === 'IN_PROGRESS')       score += 1;
    if (project.progress === 'ON_HOLD')           score -= 2;

    return score;
}

// ─── Alert Generation ─────────────────────────────────────────────────────────
export function buildAlerts(
    contact: {
        alerts?: Array<{ type: string; message: string; severity: string }> | null;
        unpaid_amount?: number | null;
        next_followup_at?: string | null;
        pipeline_stage?: string;
    },
    productionProjects: Array<{ name: string; dueDate?: string | null; amReview?: string }>,
    inboxSignals: InboxSignals
): ClientAlert[] {
    const alerts: ClientAlert[] = [];

    // Carry over DB pre-computed alerts, but validate them
    for (const dbAlert of (contact.alerts ?? [])) {
        if (
            dbAlert.type === 'waiting_for_reply' &&
            inboxSignals.daysSinceLastSent !== null &&
            inboxSignals.daysSinceLastSent < 3
        ) {
            // Downgrade — we replied recently
            alerts.push({
                type: dbAlert.type,
                message: 'Alert may be stale — you replied recently',
                severity: 'info',
            });
        } else {
            alerts.push({
                type: dbAlert.type,
                message: dbAlert.message,
                severity: dbAlert.severity as ClientAlert['severity'],
            });
        }
    }

    // Inbox-derived: reply needed
    if (inboxSignals.awaitingOurReply && (inboxSignals.daysSinceLastReceived ?? 0) > 1) {
        const existing = alerts.find(a => a.type === 'waiting_for_reply' || a.type === 'reply_needed');
        if (!existing) {
            const days = inboxSignals.daysSinceLastReceived ?? 0;
            alerts.push({
                type: 'reply_needed',
                message: `Reply needed — client wrote ${days} day${days === 1 ? '' : 's'} ago`,
                severity: days > 3 ? 'critical' : 'warning',
            });
        }
    }

    // Unpaid balance
    const unpaid = contact.unpaid_amount ?? 0;
    if (unpaid > 0) {
        if (inboxSignals.clientMentionedPayment) {
            alerts.push({
                type: 'payment_conflict',
                message: `Client says paid — verify $${unpaid.toLocaleString()} balance`,
                severity: 'warning',
            });
        } else {
            const alreadyHasUnpaid = alerts.find(a => a.type === 'unpaid_balance');
            if (!alreadyHasUnpaid) {
                alerts.push({
                    type: 'unpaid_balance',
                    message: `$${unpaid.toLocaleString()} outstanding`,
                    severity: 'info',
                });
            }
        }
    }

    // Follow-up overdue
    if (contact.next_followup_at && new Date(contact.next_followup_at) < new Date()) {
        const overdueDays = Math.floor((Date.now() - new Date(contact.next_followup_at).getTime()) / 86400000);
        const alreadyHas = alerts.find(a => a.type === 'followup_overdue');
        if (!alreadyHas) {
            alerts.push({
                type: 'followup_overdue',
                message: `Follow-up overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`,
                severity: 'critical',
            });
        }
    }

    // Production: overdue projects
    productionProjects.forEach(p => {
        if (p.dueDate && new Date(p.dueDate) < new Date()) {
            alerts.push({
                type: 'production_overdue',
                message: `${p.name} — delivery overdue`,
                severity: 'critical',
            });
        }
    });

    // Production: AM review flag
    if (productionProjects.some(p => p.amReview === 'HAS_ISSUE')) {
        alerts.push({ type: 'am_review_issue', message: 'Production flag — AM review issue', severity: 'warning' });
    }

    // Files inquiry
    if (productionProjects.length > 0 && inboxSignals.clientMentionedFiles) {
        alerts.push({ type: 'files_inquiry', message: 'Client asking about files / delivery', severity: 'warning' });
    }

    // Returning client
    if (
        contact.pipeline_stage === 'CLOSED' &&
        inboxSignals.daysSinceLastReceived !== null &&
        inboxSignals.daysSinceLastReceived < 14
    ) {
        alerts.push({ type: 'returning_client', message: 'Returning client — re-engaged recently', severity: 'success' });
    }

    // Deduplicate by type, keep highest severity
    const severityRank: Record<string, number> = { critical: 4, warning: 3, info: 2, success: 1 };
    const byType = new Map<string, ClientAlert>();
    for (const a of alerts) {
        const existing = byType.get(a.type);
        if (!existing || (severityRank[a.severity] ?? 0) > (severityRank[existing.severity] ?? 0)) {
            byType.set(a.type, a);
        }
    }

    // Sort: critical first, success last
    return [...byType.values()].sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0));
}

// ─── Timeline Builder ─────────────────────────────────────────────────────────
export function buildTimeline(
    activityLogs: Array<{ action: string; created_at: string }>,
    recentEmails: Array<{ direction: string; subject: string | null; sent_at: string }>,
    paymentRecords: Array<{ received_date_1?: string | null; received_1?: number | null; received_date_2?: string | null; received_2?: number | null; created_at: string; paid_status?: string }>
): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    // ── Source 1: Activity logs (pipeline story) ──────────────────────────────
    const actionMap: Record<string, string> = {
        'auto-promoted to offer accepted': 'Offer accepted',
        'stage suggestion: lead':          'Showed interest',
        'auto-created as client':          'Became a client',
        'lead promoted':                   'Re-engaged',
        'replied to outreach':             'Replied to campaign',
        'stage moved to closed':           'Project closed',
        'became a client':                 'Became a client',
        'promoted to lead':                'Promoted to lead',
        'offer accepted':                  'Offer accepted',
        'stage changed to':                'Stage updated',
    };

    for (const log of activityLogs.slice(0, 20)) {
        const actionLower = (log.action || '').toLowerCase();
        if (actionLower.includes('not_interested')) continue; // suppress

        let label: string | null = null;
        for (const [key, value] of Object.entries(actionMap)) {
            if (actionLower.includes(key)) { label = value; break; }
        }
        if (!label) {
            // Generic: clean up the action string
            label = log.action.replace(/^auto-/i, '').replace(/_/g, ' ');
            label = label.charAt(0).toUpperCase() + label.slice(1);
            if (label.length > 50) label = label.substring(0, 50) + '…';
        }

        events.push({ date: log.created_at, label, type: 'pipeline' });
    }

    // ── Source 2: Email subject intelligence ─────────────────────────────────
    const subjectPatterns: Array<{ pattern: RegExp; label: string; requireDir?: string }> = [
        { pattern: /contract/i,                                 label: 'Contract signed / discussed' },
        { pattern: /invoice/i, requireDir: 'SENT',             label: 'Invoice sent' },
        { pattern: /\b(paid|wire|payment|receipt)\b/i,         label: 'Payment mentioned' },
        { pattern: /\b(footage|dropbox|files|drive|access)\b/i,label: 'Files / footage shared' },
        { pattern: /\b(revision|changes|edit)\b/i,             label: 'Revision requested' },
        { pattern: /\bfinal\b/i, requireDir: 'SENT',           label: 'Final delivery sent' },
        { pattern: /\b(delivery|delivered)\b/i,                label: 'Delivery event' },
        { pattern: /\b(brief|questionnaire)\b/i,               label: 'Brief submitted' },
    ];

    for (const email of recentEmails) {
        const subject = email.subject || '';
        for (const { pattern, label, requireDir } of subjectPatterns) {
            if (requireDir && email.direction !== requireDir) continue;
            if (pattern.test(subject)) {
                events.push({ date: email.sent_at, label, type: 'email' });
                break;
            }
        }
    }

    // ── Source 3: Payment records ─────────────────────────────────────────────
    for (const p of paymentRecords) {
        if (p.received_1 && p.received_1 > 0) {
            events.push({
                date: p.received_date_1 ?? p.created_at,
                label: `Payment received`,
                type: 'payment',
                amount: p.received_1,
                isPayment: true,
            });
        }
        if (p.received_2 && p.received_2 > 0) {
            events.push({
                date: p.received_date_2 ?? p.created_at,
                label: `Payment received`,
                type: 'payment',
                amount: p.received_2,
                isPayment: true,
            });
        }
    }

    // ── Merge, sort newest first, dedup, cap at 15 ───────────────────────────
    const seen = new Set<string>();
    return events
        .filter(e => {
            const key = `${e.date?.substring(0, 10)}_${e.label}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => {
            if (!a.date && !b.date) return 0;
            if (!a.date) return 1;
            if (!b.date) return -1;
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        })
        .slice(0, 15);
}

// ─── Profile Builder (full synthesis) ────────────────────────────────────────
export function buildClientProfile(
    contact: Record<string, any>,
    rawProjects: Record<string, any>[],
    recentEmails: Array<{ direction: string; subject: string | null; snippet: string | null; sent_at: string }>,
    activityLogs: Array<{ action: string; created_at: string }>,
    salesProjects: Array<{ received_date_1?: string | null; received_1?: number | null; received_date_2?: string | null; received_2?: number | null; created_at: string; paid_status?: string }>,
    matchMethod: 'EMAIL' | 'NAME' | 'NONE'
): ClientIntelligenceProfile {
    const inboxSignals = extractInboxSignals(recentEmails);

    const activeProjects: ActiveProject[] = rawProjects.map(p => {
        const urg = computeUrgencyScore(
            { am_review: p.am_review ?? 'NO_ISSUE', due_date: p.due_date ?? null, progress: p.progress ?? 'IN_PROGRESS' },
            inboxSignals
        );
        return {
            id:            p.id,
            name:          p.name || 'Untitled Project',
            progress:      p.progress || 'IN_PROGRESS',
            percentComplete: typeof p.formula_percent === 'number' ? p.formula_percent : 0,
            dueDate:       p.due_date ?? null,
            editor:        p.editor ?? null,
            accountManager:p.account_manager ?? null,
            sizeInGbs:     p.size_in_gbs ?? null,
            amReview:      p.am_review || 'NO_ISSUE',
            tags:          Array.isArray(p.tags) ? p.tags : [],
            notes:         p.notes ?? null,
            totalAmount:   typeof p.total_amount === 'number' ? p.total_amount : null,
            paid:          p.paid ?? null,
            urgencyScore:  urg,
        };
    }).sort((a, b) => b.urgencyScore - a.urgencyScore);

    const alerts = buildAlerts(contact, activeProjects, inboxSignals);
    const timeline = buildTimeline(activityLogs, recentEmails, salesProjects);

    // Tier: DB stores NEW | STANDARD | STARTER — PREMIUM is live in DB with 7 clients
    // Use DB value directly; if missing, fallback to NEW
    const dbTier = (contact.client_tier as string) || 'NEW';
    const tier = (['NEW', 'STARTER', 'STANDARD', 'PREMIUM'].includes(dbTier) ? dbTier : 'NEW') as
        'NEW' | 'STARTER' | 'STANDARD' | 'PREMIUM';

    const totalRevenue    = typeof contact.total_revenue    === 'number' ? contact.total_revenue    : 0;
    const paidRevenue     = typeof contact.paid_revenue     === 'number' ? contact.paid_revenue     : 0;
    const unpaidAmount    = typeof contact.unpaid_amount    === 'number' ? contact.unpaid_amount    : 0;
    const totalProjects   = typeof contact.total_projects   === 'number' ? contact.total_projects   : 0;
    const avgProjectValue = typeof contact.avg_project_value === 'number' ? contact.avg_project_value : 0;

    return {
        contactId:    contact.id,
        name:         contact.name || 'Unknown',
        email:        contact.email || '',
        company:      contact.company ?? null,
        phone:        contact.phone ?? null,
        location:     contact.location ?? null,
        stage:        contact.pipeline_stage || 'COLD_LEAD',
        isClient:     !!contact.is_client,
        contactType:  contact.contact_type || 'LEAD',
        leadScore:    typeof contact.lead_score === 'number' ? contact.lead_score : 0,
        accountManager: contact.account_manager
            ? { name: contact.account_manager.name, email: contact.account_manager.email }
            : null,
        tier,
        finance: {
            totalRevenue,
            paidRevenue,
            unpaidAmount,
            totalProjects,
            avgProjectValue,
            clientSince:  contact.client_since ?? null,
            hasUnpaid:    unpaidAmount > 0,
        },
        relationship: {
            health:                 contact.relationship_health || 'neutral',
            daysSinceLastContact:   typeof contact.days_since_last_contact === 'number'
                ? contact.days_since_last_contact : null,
            lastMessageDirection:   (contact.last_message_direction as 'SENT' | 'RECEIVED' | null) ?? null,
            totalEmailsSent:        typeof contact.total_emails_sent     === 'number' ? contact.total_emails_sent     : 0,
            totalEmailsReceived:    typeof contact.total_emails_received === 'number' ? contact.total_emails_received : 0,
            nextFollowupAt:         contact.next_followup_at ?? null,
        },
        production: {
            matchMethod,
            activeProjects,
            primaryProject: activeProjects[0] ?? null,
        },
        inboxSignals,
        alerts,
        timeline,
    };
}
