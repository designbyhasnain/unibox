/**
 * Shared helpers for gmail_accounts queries used across email actions.
 *
 * Eliminates the duplicated account-map construction that appeared in
 * getInboxEmailsAction and getSentEmailsAction.
 */

export type AccountInfo = {
    email: string;
    manager_name: string | undefined;
};

/**
 * Fetches gmail accounts by ID and returns a Map keyed by account ID.
 *
 * The Map values contain the account email and the owning user's name,
 * which are used to enrich email rows for the frontend.
 */
export async function buildAccountMap(
    accountIds: string[],
    supabase: any
): Promise<Map<string, AccountInfo>> {
    const { data: accountsData } = await supabase
        .from('gmail_accounts')
        .select('id, email, users(name)')
        .in('id', accountIds);

    return new Map(
        (accountsData || []).map((a: any) => [
            a.id,
            {
                email: a.email,
                manager_name: a.users?.name,
            },
        ])
    );
}
