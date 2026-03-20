/**
 * Shared email row transformation helpers.
 *
 * Eliminates the duplicated row-to-object mapping that appeared across
 * getInboxEmailsAction, getSentEmailsAction, searchEmailsAction, and
 * getClientEmailsAction.
 */

import type { AccountInfo } from './accountHelpers';

/**
 * Transforms a raw email row (from RPC or query) into the shape the
 * frontend expects.  Used by inbox, sent, search, and client email lists.
 *
 * @param row            - Raw database / RPC row
 * @param accountMap     - Map<accountId, { email, manager_name }> built by buildAccountMap()
 * @param threadRepliesMap - Optional Set<threadId> of threads with replies
 * @param overrides      - Optional field overrides (e.g. { pipeline_stage: 'SPAM' })
 */
export function transformEmailRow(
    row: any,
    accountMap: Map<string, AccountInfo>,
    threadRepliesMap?: Set<string>,
    overrides?: Record<string, any>
) {
    const accInfo = accountMap.get(row.gmail_account_id);
    const hasActualReply = threadRepliesMap
        ? row.has_reply || threadRepliesMap.has(row.thread_id)
        : row.has_reply ?? false;

    return {
        id: row.id,
        thread_id: row.thread_id,
        from_email: row.from_email,
        to_email: row.to_email,
        subject: row.subject,
        snippet: row.snippet,
        body: row.body,
        direction: row.direction,
        sent_at: row.sent_at,
        is_unread: row.is_unread,
        pipeline_stage: row.pipeline_stage,
        gmail_account_id: row.gmail_account_id,
        contact_id: row.contact_id,
        is_tracked: row.is_tracked,
        delivered_at: row.delivered_at || null,
        opened_at: row.opened_at || null,
        has_reply: hasActualReply,
        gmail_accounts: {
            email: accInfo?.email || row.account_email,
            user: { name: accInfo?.manager_name || row.manager_name || 'System' },
        },
        ...overrides,
    };
}

/**
 * Transforms a Supabase join-style email row (used by searchEmailsAction and
 * getClientEmailsAction where gmail_accounts is a nested join rather than a
 * separate Map lookup).
 */
export function transformJoinedEmailRow(row: any) {
    const acc = Array.isArray(row.gmail_accounts)
        ? row.gmail_accounts[0]
        : row.gmail_accounts;
    const user = acc
        ? Array.isArray(acc.users)
            ? acc.users[0]
            : acc.users
        : null;

    return {
        ...row,
        gmail_accounts: {
            email: acc?.email,
            user: { name: user?.name || 'System' },
        },
    };
}
