import 'server-only';
import * as crypto from 'crypto';
import { supabase } from './supabase';
import { getAccessibleGmailAccountIds } from '../utils/accessControl';

/**
 * Extension API auth + RBAC helpers.
 *
 * Phase 5 hardening — replaces the previous inline auth that compared the
 * caller's plaintext key directly against `users.extension_api_key`. We now:
 *   1. Hash the incoming key (SHA-256) and look up by `extension_api_key_hash`.
 *   2. Fall back to the plaintext column for one transition cycle so existing
 *      installs keep working until they regenerate.
 *   3. Return RBAC-scoped account IDs so callers can filter the contact set.
 *
 * Audit ref: docs/UNIBOX-ULTIMATE-AUDIT.md SEC-1, SEC-2.
 */

export interface ExtensionAuthResult {
    user: { id: string; name: string; email: string; role: string };
    /** RBAC scope. 'ALL' for ADMIN/ACCOUNT_MANAGER. Empty array for editors
     *  or SALES users with no assigned inboxes (treat as zero access). */
    accessibleAccountIds: 'ALL' | string[];
}

export function hashApiKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Authenticate an extension request via the `Authorization: Bearer ...` header.
 * Returns the user + their RBAC-scoped account IDs, or null on auth failure.
 */
export async function authenticateExtension(
    request: { headers: { get(name: string): string | null } }
): Promise<ExtensionAuthResult | null> {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) return null;
    const apiKey = auth.slice(7).trim();
    if (!apiKey || !apiKey.startsWith('unibox_ext_')) return null;

    const hash = hashApiKey(apiKey);

    // Primary: hash lookup
    let { data: user } = await supabase
        .from('users')
        .select('id, name, email, role')
        .eq('extension_api_key_hash', hash)
        .maybeSingle();

    // Legacy fallback: plaintext lookup (pre-Phase-5 keys still work for one
    // transition window). When found, opportunistically backfill the hash
    // column so the next request hits the fast index path.
    if (!user) {
        const legacy = await supabase
            .from('users')
            .select('id, name, email, role')
            .eq('extension_api_key', apiKey)
            .maybeSingle();
        if (legacy.data) {
            user = legacy.data;
            await supabase
                .from('users')
                .update({ extension_api_key_hash: hash })
                .eq('id', legacy.data.id);
        }
    }

    if (!user) return null;

    const accessibleAccountIds = await getAccessibleGmailAccountIds(user.id, user.role);
    return { user, accessibleAccountIds };
}

/**
 * Build a Supabase query filter that scopes a `contacts` query to the caller's
 * RBAC-accessible set. Admins see everything. Sales users see contacts that
 * either: (a) they own (`account_manager_id`) OR (b) live on a Gmail account
 * they're assigned to (`last_gmail_account_id` IN their accounts). Editors and
 * SALES users with zero assigned inboxes get an empty result.
 *
 * Returns the original query (admin path) or the same query narrowed by
 * `.or()` / `.eq()`. We type as `any` because supabase-js's `PostgrestFilterBuilder`
 * generics are too narrow to round-trip through a generic helper.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyContactScope(query: any, auth: ExtensionAuthResult): any {
    if (auth.accessibleAccountIds === 'ALL') return query;
    if (auth.accessibleAccountIds.length === 0) {
        // SALES with no assigned accounts: show only contacts they own.
        return query.eq('account_manager_id', auth.user.id);
    }
    // SALES with assigned accounts: own + accounts'.
    const list = auth.accessibleAccountIds.map(id => `"${id}"`).join(',');
    return query.or(`account_manager_id.eq.${auth.user.id},last_gmail_account_id.in.(${list})`);
}
