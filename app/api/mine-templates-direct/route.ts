import { getSession } from '../../../src/lib/auth';
import { supabase } from '../../../src/lib/supabase';

const CRON_SECRET = process.env.CRON_SECRET;

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function templatize(body: string, contact: { name?: string; company?: string; location?: string; email?: string } | null): { text: string; variables: string[] } {
    let text = stripHtml(body);
    const vars: string[] = [];

    if (contact?.name) {
        const firstName = contact.name.split(' ')[0]!;
        const lastName = contact.name.split(' ').slice(1).join(' ');
        if (firstName && text.includes(firstName)) {
            text = text.replace(new RegExp(firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '{{first_name}}');
            vars.push('first_name');
        }
        if (lastName && text.includes(lastName)) {
            text = text.replace(new RegExp(lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '{{last_name}}');
            vars.push('last_name');
        }
    }
    if (contact?.company && contact.company.length > 2) {
        text = text.replace(new RegExp(contact.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '{{company}}');
        vars.push('company');
    }
    if (contact?.location && contact.location.length > 2) {
        text = text.replace(new RegExp(contact.location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '{{location}}');
        vars.push('location');
    }

    // Replace common patterns
    text = text.replace(/\$[\d,]+(\.\d{2})?/g, (match) => { vars.push('quote_amount'); return '{{quote_amount}}'; });
    text = text.replace(/https?:\/\/[^\s<>"]+/g, (match) => {
        if (match.includes('unsubscribe') || match.includes('track')) return match;
        vars.push('sample_link');
        return '{{sample_link}}';
    });

    return { text, variables: [...new Set(vars)] };
}

function categorizeByType(emailType: string | null, subject: string): string {
    if (emailType === 'OUTREACH_FIRST') return 'COLD_OUTREACH';
    if (emailType === 'FOLLOW_UP') return 'FOLLOW_UP';
    const s = (subject || '').toLowerCase();
    if (s.includes('follow') || s.includes('bump') || s.includes('check in')) return 'FOLLOW_UP';
    if (s.includes('intro') || s.includes('reaching out') || s.includes('saw your')) return 'COLD_OUTREACH';
    if (s.includes('project') || s.includes('update') || s.includes('delivery')) return 'PROJECT_UPDATE';
    if (s.includes('price') || s.includes('quote') || s.includes('rate')) return 'GENERAL';
    return 'GENERAL';
}

function generateTemplateName(subject: string, category: string): string {
    let clean = subject.replace(/^(Re:|Fwd:|FW:)\s*/gi, '').trim();
    if (clean.length > 50) clean = clean.substring(0, 47) + '...';
    return clean || `${category.replace(/_/g, ' ')} template`;
}

export async function GET(request: Request) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${CRON_SECRET}`) {
        const session = await getSession();
        if (!session || (session.role !== 'ADMIN' && session.role !== 'ACCOUNT_MANAGER')) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        // 1. Fetch sent emails
        const { data: sentEmails, error } = await supabase
            .from('email_messages')
            .select('id, subject, body, email_type, from_email, to_email, contact_id, opened_at, thread_id, sent_at')
            .eq('direction', 'SENT')
            .not('body', 'is', null)
            .not('subject', 'ilike', '%delivery status%')
            .not('subject', 'ilike', '%undeliverable%')
            .not('subject', 'ilike', '%out of office%')
            .not('subject', 'ilike', '%auto-reply%')
            .not('from_email', 'ilike', '%noreply%')
            .order('sent_at', { ascending: false })
            .limit(500);

        if (error || !sentEmails?.length) {
            return Response.json({ success: false, error: 'No sent emails found', detail: error?.message });
        }

        // 2. Filter for quality
        const seenSubjects = new Set<string>();
        const qualified = sentEmails.filter(e => {
            const clean = stripHtml(e.body || '');
            if (clean.length < 100) return false;
            if (clean.length > 5000) return false;
            const subKey = (e.subject || '').toLowerCase().replace(/^(re:|fwd:)\s*/gi, '').trim();
            if (!subKey || subKey.length < 5) return false;
            if (seenSubjects.has(subKey)) return false;
            seenSubjects.add(subKey);
            return true;
        });

        // 3. Find which threads got replies
        const threadIds = [...new Set(qualified.map(e => e.thread_id).filter(Boolean))];
        const repliedThreads = new Set<string>();
        if (threadIds.length > 0) {
            for (let i = 0; i < threadIds.length; i += 500) {
                const batch = threadIds.slice(i, i + 500);
                const { data: replies } = await supabase
                    .from('email_messages')
                    .select('thread_id')
                    .eq('direction', 'RECEIVED')
                    .in('thread_id', batch)
                    .limit(5000);
                (replies || []).forEach(r => repliedThreads.add(r.thread_id));
            }
        }

        // 4. Score and rank
        const scored = qualified.map(e => ({
            ...e,
            score: (repliedThreads.has(e.thread_id) ? 10 : 0) + (e.opened_at ? 3 : 0) + (e.email_type === 'OUTREACH_FIRST' ? 2 : 0),
            gotReply: repliedThreads.has(e.thread_id),
        })).sort((a, b) => b.score - a.score);

        // 5. Pick top emails per category (max 2 per category, max 12 total)
        const categoryBuckets: Record<string, typeof scored> = {};
        for (const email of scored) {
            const cat = categorizeByType(email.email_type, email.subject);
            if (!categoryBuckets[cat]) categoryBuckets[cat] = [];
            if (categoryBuckets[cat]!.length < 2) {
                categoryBuckets[cat]!.push(email);
            }
        }

        const selected = Object.values(categoryBuckets).flat().slice(0, 12);

        // 6. Check existing templates to avoid dupes
        const { data: existing } = await supabase.from('email_templates').select('name, subject').limit(200);
        const existingNames = new Set((existing || []).map((t: any) => t.name.toLowerCase()));
        const existingSubjects = new Set((existing || []).map((t: any) => (t.subject || '').toLowerCase().substring(0, 30)));

        // 7. Fetch contacts for placeholder replacement
        const contactIds = [...new Set(selected.map(e => e.contact_id).filter(Boolean))];
        const contactMap: Record<string, any> = {};
        if (contactIds.length > 0) {
            const { data: contacts } = await supabase
                .from('contacts')
                .select('id, name, email, company, location')
                .in('id', contactIds);
            (contacts || []).forEach(c => { contactMap[c.id] = c; });
        }

        const session = await getSession();
        let userId = session?.userId || '';
        if (!userId) {
            const { data: admin } = await supabase.from('users').select('id').eq('role', 'ADMIN').limit(1).single();
            userId = admin?.id || '';
        }

        // 8. Create templates
        let created = 0;
        const results: Array<{ name: string; category: string; variables: string[]; gotReply: boolean; wasOpened: boolean }> = [];

        for (const email of selected) {
            const category = categorizeByType(email.email_type, email.subject);
            const name = generateTemplateName(email.subject, category);

            if (existingNames.has(name.toLowerCase())) continue;
            const subCheck = (email.subject || '').toLowerCase().substring(0, 30);
            if (existingSubjects.has(subCheck)) continue;

            const contact = email.contact_id ? contactMap[email.contact_id] : null;

            // Templatize subject
            let tSubject = email.subject || '';
            if (contact?.name) {
                const firstName = contact.name.split(' ')[0];
                if (firstName) tSubject = tSubject.replace(new RegExp(firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '{{first_name}}');
            }
            if (contact?.company) {
                tSubject = tSubject.replace(new RegExp(contact.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '{{company}}');
            }

            // Templatize body
            const { text: tBody, variables } = templatize(email.body, contact);

            const { error: insertError } = await supabase.from('email_templates').insert({
                name,
                subject: tSubject,
                body: tBody,
                category,
                is_shared: true,
                created_by_id: userId,
                usage_count: 0,
                updated_at: new Date().toISOString(),
            });

            if (!insertError) {
                created++;
                existingNames.add(name.toLowerCase());
                existingSubjects.add(subCheck);
                results.push({ name, category, variables, gotReply: email.gotReply, wasOpened: !!email.opened_at });
            }
        }

        return Response.json({
            success: true,
            analyzed: sentEmails.length,
            qualified: qualified.length,
            withReplies: scored.filter(e => e.gotReply).length,
            selected: selected.length,
            created,
            templates: results,
        });
    } catch (e: any) {
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}
