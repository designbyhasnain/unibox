'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getOwnerFilter, blockEditorAccess } from '../utils/accessControl';

export type ContactSummary = {
    contactName: string;
    contactEmail: string;
    company: string | null;
    pipelineStage: string;
    health: string;
    firstContact: string | null;
    lastContact: string | null;
    totalSent: number;
    totalReceived: number;
    totalThreads: number;
    daysInPipeline: number;
    daysSinceContact: number;
    theirWaiting: boolean;
    milestones: { date: string; event: string; type: string }[];
    nextSteps: { priority: string; action: string }[];
    interactions: {
        date: string;
        sent: number;
        received: number;
        snippets: { dir: string; text: string; time: string }[];
    }[];
};

export async function generateContactSummaryAction(contactId: string): Promise<ContactSummary | null> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!contactId) return null;

    const ownerFilter = getOwnerFilter(userId, role);
    if (ownerFilter) {
        const { data: owned } = await supabase
            .from('contacts').select('id')
            .eq('id', contactId).eq('account_manager_id', ownerFilter)
            .maybeSingle();
        if (!owned) return null;
    }

    const { data, error } = await supabase.rpc('generate_contact_summary', {
        p_contact_id: contactId,
    });

    if (error || !data) {
        console.error('Summary RPC error:', error);
        return null;
    }

    return {
        contactName: data.contactName || '',
        contactEmail: data.contactEmail || '',
        company: data.company || null,
        pipelineStage: data.pipelineStage || '',
        health: data.health || 'unknown',
        firstContact: data.firstContact || null,
        lastContact: data.lastContact || null,
        totalSent: data.totalSent || 0,
        totalReceived: data.totalReceived || 0,
        totalThreads: data.totalThreads || 0,
        daysInPipeline: data.daysInPipeline || 0,
        daysSinceContact: data.daysSinceContact || 0,
        theirWaiting: data.theirWaiting || false,
        nextSteps: (data.nextSteps || []).map((s: any) => ({
            priority: s.priority || 'low',
            action: s.action || '',
        })),
        milestones: (data.milestones || []).map((m: any) => ({
            date: m.date?.substring(0, 10) || '',
            event: m.event || '',
            type: m.type || 'info',
        })),
        interactions: (data.interactions || []).map((i: any) => ({
            date: i.date || '',
            sent: i.sent || 0,
            received: i.received || 0,
            opened: i.opened || false,
            snippets: (i.snippets || []).map((s: any) => ({
                dir: s.dir || '',
                text: (s.text || '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
                time: s.time || '',
            })),
        })),
    };
}

/** Generate AI-powered relationship audit (Gemini) */
export async function generateAISummaryAction(contactId: string): Promise<string> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!contactId) return 'No contact ID provided.';
    const ownerFilter = getOwnerFilter(userId, role);

    let contactQuery = supabase
        .from('contacts')
        .select('name, email, pipeline_stage, account_manager_id')
        .eq('id', contactId);
    if (ownerFilter) contactQuery = contactQuery.eq('account_manager_id', ownerFilter);
    const { data: contact } = await contactQuery.maybeSingle();

    if (!contact) return 'Contact not found.';

    // Get FULL email bodies (not just snippets) for proper AI analysis
    const email = contact.email.toLowerCase();
    const { data: emails } = await supabase
        .from('email_messages')
        .select('direction, subject, body, snippet, sent_at, from_email, to_email')
        .or(`contact_id.eq.${contactId},from_email.ilike.%${email.replace(/[%_\\]/g, '\\$&')}%,to_email.ilike.%${email.replace(/[%_\\]/g, '\\$&')}%`)
        .order('sent_at', { ascending: true })
        .limit(100);

    if (!emails || emails.length === 0) return 'No email history found for this contact.';

    const { generateAIRelationshipSummary } = await import('../services/aiSummaryService');

    const snippets = emails.map((e: any) => {
        // Strip HTML from body to get clean text
        let bodyText = (e.body || e.snippet || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();

        // Remove quoted/forwarded content (keep only the new message)
        const quoteMarkers = ['On ', 'wrote:', '------', 'From:', 'Sent from'];
        for (const marker of quoteMarkers) {
            const idx = bodyText.indexOf(marker);
            if (idx > 50) { // Only cut if there's enough content before the quote
                bodyText = bodyText.substring(0, idx).trim();
                break;
            }
        }

        // Cap at 1000 chars per email for deep context while staying within token limits
        if (bodyText.length > 1000) bodyText = bodyText.substring(0, 1000) + '...';

        return {
            date: e.sent_at?.substring(0, 10) || '',
            direction: e.direction as 'SENT' | 'RECEIVED',
            subject: e.subject || '',
            snippet: bodyText,
        };
    });

    return generateAIRelationshipSummary(
        contact.name || email,
        email,
        snippets,
        contact.pipeline_stage || 'UNKNOWN',
    );
}
