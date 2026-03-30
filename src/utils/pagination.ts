/**
 * Shared pagination utilities.
 *
 * Eliminates the duplicated `Math.min(Math.max(1, pageSize), 100)` pattern
 * that appeared in getInboxEmailsAction, getSentEmailsAction, and
 * searchEmailsAction.
 */

import { PAGINATION } from '../constants/limits';

/**
 * Clamp a page-size value to a safe range [1, max].
 *
 * @param size - Requested page size (may be user-supplied)
 * @param max  - Upper bound (defaults to PAGINATION.MAX_PAGE_SIZE = 100)
 */
export function clampPageSize(
    size: number,
    max: number = PAGINATION.MAX_PAGE_SIZE
): number {
    return Math.min(Math.max(1, size), max);
}
