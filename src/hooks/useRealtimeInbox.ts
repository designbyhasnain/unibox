'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { supabaseClient } from '../lib/supabase-client'; // ✅ browser-safe — uses NEXT_PUBLIC_ anon key only

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
    pollingIntervalMs = 300_000,
}: RealtimeInboxOptions) {
    const channelRef = useRef<ReturnType<typeof supabaseClient.channel> | null>(null);
    const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const latestTimestampRef = useRef<string>(new Date().toISOString());

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

        try {
            const { data: newEmails } = await supabaseClient
                .from('email_messages')
                .select(`
                    id, thread_id, from_email, to_email, subject, snippet,
                    direction, sent_at, is_unread, pipeline_stage,
                    gmail_account_id,
                    gmail_accounts ( email )
                `)
                .in('gmail_account_id', accountIds)
                .eq('direction', 'RECEIVED')
                .gt('sent_at', latestTimestampRef.current) // Only NEW emails
                .order('sent_at', { ascending: true });

            if (newEmails && newEmails.length > 0) {
                // Update the timestamp watermark to the newest email we just found
                const newestTimestamp = newEmails[newEmails.length - 1]?.sent_at;
                if (newestTimestamp) {
                    latestTimestampRef.current = newestTimestamp;
                }

                // Fire callback for each new email
                for (const email of newEmails) {
                    console.log('[Polling] New email found:', email.subject);
                    onNewEmailRef.current(email);
                }
            }
        } catch (err) {
            console.warn('[Polling] Error checking for new emails:', err);
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

        const channel = supabaseClient
            .channel('realtime:email_messages:inbox')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'email_messages' },
                (payload) => {
                    const newEmail = payload.new as any;
                    if (accountIds.includes(newEmail.gmail_account_id)) {
                        console.log('[Realtime] INSERT:', newEmail.subject);
                        // Update watermark so polling doesn't re-fire this email
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
                console.log('[Realtime] Status:', status);
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

    // ───── Polling fallback ──────────────────────────────────────────────────
    useEffect(() => {
        if (!pollingIntervalMs || pollingIntervalMs <= 0) return;
        if (!accountIds || accountIds.length === 0) return;

        // First poll after 5s so we catch anything loaded while page was initialising
        const initialTimer = setTimeout(pollForNewEmails, 5_000);

        // Then poll on the interval
        pollingTimerRef.current = setInterval(pollForNewEmails, pollingIntervalMs);

        return () => {
            clearTimeout(initialTimer);
            if (pollingTimerRef.current) {
                clearInterval(pollingTimerRef.current);
                pollingTimerRef.current = null;
            }
        };
    }, [pollForNewEmails, pollingIntervalMs, accountIdsKey]);
}
