/**
 * Centralised magic numbers for tracking, pagination, and email sync.
 *
 * Replaces scattered numeric literals across tracking routes, email actions,
 * and sync services.
 */

export const TRACKING = {
    /** Max tracking events allowed per minute per tracking ID */
    RATE_LIMIT_PER_MINUTE: 20,
    /** Window (hours) for de-duplicating identical open events */
    DEDUP_WINDOW_HOURS: 1,
    /** Window (hours) for owner-session cookie validity */
    OWNER_SESSION_WINDOW_HOURS: 24,
} as const;

export const PAGINATION = {
    /** Default number of emails per page in list views */
    DEFAULT_PAGE_SIZE: 50,
    /** Absolute maximum page size to prevent unbounded queries */
    MAX_PAGE_SIZE: 100,
    /** Max results returned by search */
    SEARCH_MAX: 50,
} as const;

export const EMAIL_SYNC = {
    /** Hard cap on total messages synced per account */
    MAX_MESSAGES: 100000,
    /** Page size for large batch sync operations */
    PAGE_SIZE_LARGE: 5000,
    /** Page size for medium batch operations */
    PAGE_SIZE_MEDIUM: 500,
} as const;
