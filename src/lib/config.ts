/**
 * Centralized configuration helpers.
 *
 * Consolidates env-var resolution that was previously duplicated across
 * projectActions.ts, clientActions.ts, and app/constants/config.ts.
 */

const DEFAULT_FALLBACK_USER_ID = '1ca1464d-1009-426e-96d5-8c5e8c84faac';

/**
 * Returns the default / admin user ID used when no authenticated user context
 * is available.  Resolution order:
 *   1. `DEFAULT_USER_ID`           (server-side env var)
 *   2. `NEXT_PUBLIC_DEFAULT_USER_ID` (client-safe env var)
 *   3. Hardcoded fallback UUID
 */
export function getDefaultUserId(): string {
    return (
        process.env.DEFAULT_USER_ID ||
        process.env.NEXT_PUBLIC_DEFAULT_USER_ID ||
        DEFAULT_FALLBACK_USER_ID
    );
}
