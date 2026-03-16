'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { supabaseClient } from '../lib/supabase-client';

interface RealtimeInboxOptions {
    /** The gmail_account IDs to watch for new messages */
    accountIds: string[];
    /** Called when a new email is inserted */
    onNewEmail: (email: any) => void;
    /** Called when an email is updated (e.g. is_unread or pipeline_stage changed) */
    onEmailUpdated?: (email: any) => void;
    /** Called when an email is deleted */
    onEmailDeleted?: (messageId: string) => void;
    /**
     * Polling interval in ms. Used as a fallback when Pub/Sub webhook is not reachable
     * (i.e. local dev without ngrok). Defaults to 30 000 (30s). Set to 0 to disable.
     */
    pollingIntervalMs?: number;
}

/**
 * Provides two mechanisms for inbox live updates:
 *
 * 1. **Supabase Realtime** (WebSocket) — fires instantly whenever a row is
 *    inserted into email_messages. Works in production where Pub/Sub can push
 *    to the webhook. Also works locally if emails are inserted any other way.
 *
 * 2. **Polling fallback** — every `pollingIntervalMs` ms (default 30s) it
 *    checks for messages newer than the latest seen timestamp. Works in any
 *    environment including local dev with no webhook setup needed.
 */
export function useRealtimeInbox({
    accountIds,
    onNewEmail,
    onEmailUpdated,
    onEmailDeleted,
    pollingIntervalMs = 15_000, // Reduced from 30s to 15s for "instant" feel
}: RealtimeInboxOptions) {
    const channelRef = useRef<ReturnType<typeof supabaseClient.channel> | null>(null);
    const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const latestTimestampRef = useRef<string>(new Date().toISOString());
    const inFlightRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Stable key — only changes when the set of accountIds actually changes
    const accountIdsKey = useMemo(
        () => [...accountIds].sort().join(','),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [accountIds.length, accountIds.join(',')]
    );

    // Keep callbacks fresh so closures never go stale
    const onNewEmailRef = useRef(onNewEmail);
    const onEmailUpdatedRef = useRef(onEmailUpdated);
    const onEmailDeletedRef = useRef(onEmailDeleted);
    useEffect(() => { onNewEmailRef.current = onNewEmail; }, [onNewEmail]);
    useEffect(() => { onEmailUpdatedRef.current = onEmailUpdated; }, [onEmailUpdated]);
    useEffect(() => { onEmailDeletedRef.current = onEmailDeleted; }, [onEmailDeleted]);

    // ───── Polling: fetch emails newer than latest seen ─────────────────────
    const pollForNewEmails = useCallback(async () => {
        if (!accountIds || accountIds.length === 0) return;
        if (inFlightRef.current) return; // Skip if previous poll still running

        inFlightRef.current = true;
        try {
            // Priority 1: New Received Emails
            const { data: newEmails } = await supabaseClient
                .from('email_messages')
                .select(`
                    id, thread_id, from_email, to_email, subject, snippet,
                    direction, sent_at, is_unread, pipeline_stage,
                    gmail_account_id, is_tracked, opens_count, clicks_count,
                    gmail_accounts ( email )
                `)
                .in('gmail_account_id', accountIds)
                .eq('direction', 'RECEIVED')
                .gt('sent_at', latestTimestampRef.current)
                .order('sent_at', { ascending: true });

            if (newEmails && newEmails.length > 0) {
                const newestTimestamp = newEmails[newEmails.length - 1]?.sent_at;
                if (newestTimestamp) latestTimestampRef.current = newestTimestamp;

                for (const email of newEmails) {
                    onNewEmailRef.current(email);
                }
            }

            // Priority 2: Check for tracking updates on RECENTLY sent emails
            // Increase to 50 items and check last 12 hours for higher frequency
            const halfDayAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
            const { data: updatedSent } = await supabaseClient
                .from('email_messages')
                .select('id, thread_id, is_tracked, opens_count, clicks_count, last_opened_at, gmail_account_id')
                .in('gmail_account_id', accountIds)
                .eq('direction', 'SENT')
                .gt('sent_at', halfDayAgo)
                .gt('opens_count', 0)
                .order('sent_at', { ascending: false })
                .limit(50);

            if (updatedSent) {
                updatedSent.forEach(msg => onEmailUpdatedRef.current?.(msg));
            }

        } catch (err) {
            console.warn('[Polling] Error:', err);
        } finally {
            inFlightRef.current = false;
        }
    }, [accountIds]);

    // ───── Supabase Realtime subscription ───────────────────────────────────
    useEffect(() => {
        if (!accountIds || accountIds.length === 0) return;

        // Clean up previous subscription
        if (channelRef.current) {
            supabaseClient.removeChannel(channelRef.current);
            channelRef.current = null;
        }

        const channelName = `realtime:email_messages:${accountIdsKey.slice(0, 16)}`;
        const channel = supabaseClient
            .channel(channelName)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'email_messages' },
                (payload) => {
                    const newEmail = payload.new as any;
                    if (accountIds.includes(newEmail.gmail_account_id)) {
                        if (newEmail.sent_at && newEmail.sent_at > latestTimestampRef.current) {
                            latestTimestampRef.current = newEmail.sent_at;
                        }
                        onNewEmailRef.current(newEmail);
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'email_messages' },
                (payload) => {
                    const updatedEmail = payload.new as any;
                    if (accountIds.includes(updatedEmail.gmail_account_id)) {
                        onEmailUpdatedRef.current?.(updatedEmail);
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'email_messages' },
                (payload) => {
                    const oldEmail = payload.old as any;
                    if (oldEmail.id) {
                        onEmailDeletedRef.current?.(oldEmail.id);
                    }
                }
            )
            .subscribe((status) => {
                console.log(`[Realtime] Tracking status for ${accountIdsKey.slice(0,8)}...: ${status}`);
                if (status === 'SUBSCRIBED') {
                    console.log('[Realtime] Successfully connected to email_messages');
                }
            });

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabaseClient.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountIdsKey]);

    // ───── Polling fallback & Tab Focus ──────────────────────────────────────
    useEffect(() => {
        if (!pollingIntervalMs || pollingIntervalMs <= 0) return;
        if (!accountIds || accountIds.length === 0) return;

        const initialTimer = setTimeout(pollForNewEmails, 1_500);
        pollingTimerRef.current = setInterval(pollForNewEmails, pollingIntervalMs);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                pollForNewEmails();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearTimeout(initialTimer);
            if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // Cancel any in-flight request
            inFlightRef.current = false;
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
        };
    }, [pollForNewEmails, pollingIntervalMs, accountIdsKey]);
}
