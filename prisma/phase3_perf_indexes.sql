-- =============================================================================
-- UNIBOX — Phase 3.1 perf indexes (Gmail-fast plan)
-- =============================================================================
-- Adds the per-thread and per-contact composite indexes that the inbox /
-- client-detail / Goal Planner hot paths rely on. The big inbox index
-- `(gmail_account_id, sent_at DESC)` already exists from the previous
-- `missing_indexes_migration.sql` — these fill the remaining gaps.
--
-- All statements use CONCURRENTLY so they don't block writes on the
-- production `email_messages` (100k+ rows) and `contacts` (13k+ rows)
-- tables. CONCURRENTLY cannot run inside a transaction, so this file is
-- intentionally NOT wrapped in BEGIN/COMMIT.
--
-- Run: Supabase Dashboard → SQL Editor → paste & run. Each statement is
-- independent — if one fails (e.g. already exists, expected), the rest
-- still run.
-- =============================================================================

-- email_messages (thread_id, sent_at DESC) — thread expand on click + the
-- thread-detail server action. Covered partially by per-thread foreign key
-- but the DESC ordering matters for the "latest message first" view.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_messages_thread_sent
    ON public.email_messages (thread_id, sent_at DESC);

-- email_messages (contact_id, sent_at DESC) — client-detail panel + Goal
-- Planner historical funnel computation. Without this, computing
-- "messages sent to contact X in date range" does a sequential scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_messages_contact_sent
    ON public.email_messages (contact_id, sent_at DESC)
    WHERE contact_id IS NOT NULL;

-- email_messages (gmail_account_id, direction, sent_at DESC) — the inbox
-- list query filters direction='RECEIVED' before ordering. The two-column
-- index above gets close, but the three-column form lets PG do an
-- index-only scan for the inbox hot path.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_messages_account_direction_sent
    ON public.email_messages (gmail_account_id, direction, sent_at DESC);

-- contacts (account_manager_id, pipeline_stage) — Goal Planner + opportunities
-- filter both columns together for the per-AM book view.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_manager_stage
    ON public.contacts (account_manager_id, pipeline_stage)
    WHERE account_manager_id IS NOT NULL;

-- campaign_contacts (gmail_account_id, status) — campaigns processor scans
-- "what's IN_PROGRESS for this mailbox" every cycle.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaign_contacts_account_status
    ON public.campaign_contacts (gmail_account_id, status);

-- =============================================================================
-- After running, verify with:
--   SELECT indexname FROM pg_indexes WHERE tablename IN
--     ('email_messages','contacts','campaign_contacts')
--     AND indexname LIKE 'idx_%' ORDER BY indexname;
-- And run EXPLAIN (ANALYZE, BUFFERS) on the inbox query to confirm
-- index-only scans replaced the previous sequential scans.
-- =============================================================================
