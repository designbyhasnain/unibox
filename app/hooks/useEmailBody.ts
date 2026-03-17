'use client';

import { useState, useEffect, useRef } from 'react';
import { getCachedBodies, setCachedBodies } from '../utils/bodyCache';

interface AttachmentMeta {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
}

interface UseEmailBodyResult {
    bodies: Map<string, string>;
    attachments: Map<string, AttachmentMeta[]>;
    isLoading: boolean;
    error: string | null;
    isFallback: boolean;
    authError: boolean;
    accountEmail: string | null;
}

export function useEmailBody(
    threadId: string | null,
    accountId: string | null,
    messageIds: string[]
): UseEmailBodyResult {
    const [bodies, setBodies] = useState<Map<string, string>>(new Map());
    const [attachments, setAttachments] = useState<Map<string, AttachmentMeta[]>>(new Map());
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isFallback, setIsFallback] = useState(false);
    const [authError, setAuthError] = useState(false);
    const [accountEmail, setAccountEmail] = useState<string | null>(null);

    // Stable ref for AbortController so cleanup is correct across renders
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        // Nothing to do if missing required params or no message IDs
        if (!threadId || !accountId || !messageIds.length) {
            setBodies(new Map());
            setAttachments(new Map());
            setIsLoading(false);
            setError(null);
            setIsFallback(false);
            setAuthError(false);
            setAccountEmail(null);
            return;
        }

        // Abort any in-flight request for the previous thread
        if (abortRef.current) {
            abortRef.current.abort();
        }
        const controller = new AbortController();
        abortRef.current = controller;

        let cancelled = false;

        async function fetchBodies() {
            setIsLoading(true);
            setError(null);
            setIsFallback(false);
            setAuthError(false);
            setAccountEmail(null);

            try {
                // 1. Check IndexedDB cache for all messageIds
                const cached = await getCachedBodies(messageIds);

                if (cancelled) return;

                const missingIds = messageIds.filter((id) => !cached.has(id));

                if (missingIds.length === 0) {
                    // All found in cache — no API call needed
                    const bodyMap = new Map<string, string>();
                    const attMap = new Map<string, AttachmentMeta[]>();
                    for (const [id, entry] of cached) {
                        bodyMap.set(id, entry.html);
                        if (entry.attachments?.length) attMap.set(id, entry.attachments);
                    }
                    setBodies(bodyMap);
                    setAttachments(attMap);
                    setIsLoading(false);
                    return;
                }

                // 2. Fetch missing bodies from API
                const url = `/api/email/body?threadId=${encodeURIComponent(threadId!)}&accountId=${encodeURIComponent(accountId!)}`;
                const res = await fetch(url, { signal: controller.signal });

                if (cancelled) return;

                if (!res.ok) {
                    if (res.status === 401) {
                        const errJson = await res.json().catch(() => ({}));
                        if (errJson.error === 'auth_required') {
                            setError('auth_required');
                            setAuthError(true);
                            setAccountEmail(errJson.accountEmail ?? null);
                            setIsFallback(true);
                            setIsLoading(false);
                            return;
                        }
                    }
                    throw new Error(`API error: ${res.status}`);
                }

                const json = await res.json();
                // API returns: { bodies: { [messageId]: string }, attachments: { [messageId]: AttachmentMeta[] } }
                const apiBodies: Record<string, string> = json.bodies || {};
                const apiAttachments: Record<string, AttachmentMeta[]> = json.attachments || {};

                if (cancelled) return;

                // 3. Store new results in IndexedDB (transform to cache format)
                const toCache: Record<string, { html: string; attachments: AttachmentMeta[] }> = {};
                for (const id of Object.keys(apiBodies)) {
                    toCache[id] = { html: apiBodies[id] || '', attachments: apiAttachments[id] || [] };
                }
                if (Object.keys(toCache).length > 0) {
                    setCachedBodies(toCache).catch(() => { /* best-effort */ });
                }

                // 4. Merge cached + fresh results
                const bodyMap = new Map<string, string>();
                const attMap = new Map<string, AttachmentMeta[]>();

                // First apply cached entries
                for (const [id, entry] of cached) {
                    bodyMap.set(id, entry.html);
                    if (entry.attachments?.length) attMap.set(id, entry.attachments);
                }

                // Then apply freshly fetched entries
                for (const [id, html] of Object.entries(apiBodies)) {
                    bodyMap.set(id, html || '');
                    if (apiAttachments[id]?.length) attMap.set(id, apiAttachments[id]);
                }

                setBodies(bodyMap);
                setAttachments(attMap);
            } catch (err: any) {
                if (err?.name === 'AbortError' || cancelled) return;
                console.error('[useEmailBody] fetch failed:', err);
                setError(err?.message || 'Failed to load email body');
                setIsFallback(true);
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        fetchBodies();

        return () => {
            cancelled = true;
            controller.abort();
        };
        // messageIds identity changes with every render if built inline — join to a stable string
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId, accountId, messageIds.join(',')]);

    return { bodies, attachments, isLoading, error, isFallback, authError, accountEmail };
}
