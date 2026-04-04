import { NextResponse } from 'next/server';
import { getSession } from '../../../src/lib/auth';
import { supabase } from '../../../src/lib/supabase';
import { classifyEmailInThread } from '../../../src/services/emailClassificationService';

/**
 * POST /api/backfill-email-types
 *
 * Backfills email_type for all existing emails and sets first_reply_received on threads.
 * Protected: requires authenticated session.
 */
export async function POST() {
    const session = await getSession();
    if (!session || (session.role !== 'ADMIN' && session.role !== 'ACCOUNT_MANAGER')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Fetch all threads with their messages ordered by sent_at
        let allMessages: any[] = [];
        let page = 0;
        const pageSize = 1000;

        while (true) {
            const from = page * pageSize;
            const to = from + pageSize - 1;
            const { data, error } = await supabase
                .from('email_messages')
                .select('id, thread_id, direction, sent_at')
                .order('sent_at', { ascending: true })
                .range(from, to);

            if (error) throw error;
            if (!data || data.length === 0) break;
            allMessages.push(...data);
            if (data.length < pageSize) break;
            page++;
        }

        // Group by thread
        const threads: Record<string, typeof allMessages> = {};
        for (const msg of allMessages) {
            if (!threads[msg.thread_id]) threads[msg.thread_id] = [];
            threads[msg.thread_id]!.push(msg);
        }

        let classified = 0;
        let threadsWithFirstReply = 0;
        const batchSize = 50;
        const updates: Array<{ id: string; email_type: string }> = [];
        const threadFirstReplyIds: string[] = [];

        for (const [threadId, messages] of Object.entries(threads)) {
            let firstReplySet = false;

            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                const priorMessages = messages.slice(0, i);

                const { emailType, setsFirstReply } = classifyEmailInThread(
                    { direction: msg.direction, sent_at: msg.sent_at },
                    priorMessages.map((m: any) => ({ direction: m.direction, sent_at: m.sent_at })),
                    firstReplySet
                );

                if (setsFirstReply) {
                    firstReplySet = true;
                }

                updates.push({ id: msg.id, email_type: emailType });
                classified++;
            }

            if (firstReplySet) {
                threadFirstReplyIds.push(threadId);
                threadsWithFirstReply++;
            }
        }

        // Batch update email_type on messages
        for (let i = 0; i < updates.length; i += batchSize) {
            const batch = updates.slice(i, i + batchSize);
            await Promise.all(
                batch.map(u =>
                    supabase.from('email_messages')
                        .update({ email_type: u.email_type })
                        .eq('id', u.id)
                )
            );
        }

        // Batch update first_reply_received on threads
        for (let i = 0; i < threadFirstReplyIds.length; i += batchSize) {
            const batch = threadFirstReplyIds.slice(i, i + batchSize);
            await supabase.from('email_threads')
                .update({ first_reply_received: true })
                .in('id', batch);
        }

        return NextResponse.json({
            success: true,
            classified,
            totalThreads: Object.keys(threads).length,
            threadsWithFirstReply,
        });
    } catch (error: any) {
        console.error('[backfill-email-types] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
