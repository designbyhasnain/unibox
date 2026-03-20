/**
 * Shared helpers for email thread operations.
 *
 * Eliminates the duplicated has_reply lookup that appeared in
 * getInboxEmailsAction and getSentEmailsAction.
 */

/**
 * Given a list of thread IDs, queries the denormalized `email_threads` table
 * and returns a Set of thread IDs that have `has_reply = true`.
 */
export async function buildThreadRepliesMap(
    threadIds: string[],
    supabase: any
): Promise<Set<string>> {
    if (threadIds.length === 0) {
        return new Set<string>();
    }

    const { data: replyData } = await supabase
        .from('email_threads')
        .select('id, has_reply')
        .in('id', threadIds);

    return new Set(
        (replyData || [])
            .filter((r: any) => r.has_reply)
            .map((r: any) => r.id)
    );
}
