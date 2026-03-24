'use client';

import { useEffect, useRef } from 'react';
import { saveToLocalCache } from '../utils/localCache';
import { getClientsAction } from '../../src/actions/clientActions';
import { getManagersAction, getAllProjectsAction } from '../../src/actions/projectActions';
import { listUsersAction, } from '../../src/actions/userManagementActions';
import { listInvitesAction } from '../../src/actions/inviteActions';

/**
 * Prefetches data for all pages in the background on app load.
 * This warms up caches so navigation between pages is instant.
 */
export function usePrefetch(selectedAccountId: string) {
    const hasPrefetched = useRef(false);

    useEffect(() => {
        if (hasPrefetched.current) return;
        hasPrefetched.current = true;

        // Wait for initial page to finish loading, then prefetch others
        const timer = setTimeout(async () => {
            try {
                // Prefetch in parallel — low priority background work
                const [clients, managers, projects] = await Promise.all([
                    getClientsAction(selectedAccountId).catch(() => null),
                    getManagersAction().catch(() => null),
                    getAllProjectsAction(selectedAccountId).catch(() => null),
                ]);

                // Warm up caches
                if (clients && managers) {
                    saveToLocalCache('clients_data', { clients, managers });
                }
                if (projects) {
                    saveToLocalCache('projects_data', { projects, managers });
                }
            } catch {
                // Silent fail — prefetch is best-effort
            }
        }, 2000); // 2 second delay to not compete with current page load

        return () => clearTimeout(timer);
    }, [selectedAccountId]);
}
