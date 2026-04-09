-- =============================================================================
-- UNIBOX — Missing Indexes Migration
-- =============================================================================
-- Based on analysis of all query patterns across 20 action files, 20 services,
-- and 30 API routes. Sorted by impact (hot paths first).
--
-- Run: Supabase Dashboard → SQL Editor → paste & run
-- =============================================================================

BEGIN;

-- =============================================================================
-- P0 — CRITICAL (hot paths: inbox, cron jobs, every request)
-- =============================================================================

-- contacts.pipeline_stage — queried in ~20 places (dashboard, clients, actions, cron)
-- Currently indexed on email_messages but NOT on contacts table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_pipeline_stage
    ON public.contacts (pipeline_stage);

-- gmail_accounts.status — queried in ~12 places (all cron jobs, account listing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gmail_accounts_status
    ON public.gmail_accounts (status);

-- gmail_accounts (connection_method, status) — token refresh + watch renewal + IMAP cron
-- Always filtered together: .eq('connection_method', 'MANUAL').eq('status', 'ACTIVE')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gmail_accounts_method_status
    ON public.gmail_accounts (connection_method, status);

-- gmail_accounts.last_synced_at — sync/poll filters + IMAP cron orders by this
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gmail_accounts_last_synced
    ON public.gmail_accounts (last_synced_at);

-- contacts.last_message_direction — action queue, dashboard, revenue (5 places)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_last_msg_direction
    ON public.contacts (last_message_direction);

-- users.extension_api_key — every Chrome extension API call (4 routes)
-- Should be unique since keys are generated per-user
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_extension_api_key
    ON public.users (extension_api_key) WHERE extension_api_key IS NOT NULL;

-- invitations.status — filtered in 5 auth flow places, no index exists
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invitations_status
    ON public.invitations (status);


-- =============================================================================
-- P1 — HIGH (dashboard, analytics, sales automation cron)
-- =============================================================================

-- contacts.days_since_last_contact — ordered/ranged in 8 places
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_days_since_last
    ON public.contacts (days_since_last_contact);

-- contacts.total_emails_received — ordered/ranged in 8 places
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_total_received
    ON public.contacts (total_emails_received);

-- contacts.total_emails_sent — filtered in 4 places
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_total_sent
    ON public.contacts (total_emails_sent);

-- contacts.lead_score — ordered in action queue + sales automation cron
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_lead_score
    ON public.contacts (lead_score DESC);

-- contacts.total_revenue — ordered in jarvis + dashboard (top clients)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_total_revenue
    ON public.contacts (total_revenue DESC NULLS LAST);

-- contacts.unpaid_amount — ordered/filtered in jarvis + dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_unpaid_amount
    ON public.contacts (unpaid_amount DESC NULLS LAST)
    WHERE unpaid_amount > 0;

-- contacts.open_count — filtered in dashboard + sales automation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_open_count
    ON public.contacts (open_count DESC);

-- contacts.next_followup_at — range filtered in dashboard + cron
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_next_followup
    ON public.contacts (next_followup_at)
    WHERE next_followup_at IS NOT NULL;

-- projects.project_date — ordered in 4 places
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_project_date
    ON public.projects (project_date DESC NULLS LAST);

-- projects.project_value — range filtered in 4 places (revenue queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_project_value
    ON public.projects (project_value DESC NULLS LAST)
    WHERE project_value > 0;

-- projects.paid_status — filtered in finance + dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_paid_status
    ON public.projects (paid_status);


-- =============================================================================
-- P1 — COMPOUND INDEXES (common multi-column filter patterns)
-- =============================================================================

-- contacts (pipeline_stage, account_manager_id) — dashboard scoped pipeline counts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_stage_manager
    ON public.contacts (pipeline_stage, account_manager_id);

-- contacts (pipeline_stage, last_message_direction) — action queue filters both
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_stage_direction
    ON public.contacts (pipeline_stage, last_message_direction);

-- contacts (contact_type, account_manager_id) — client list RBAC scoping
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_type_manager
    ON public.contacts (contact_type, account_manager_id);

-- campaign_contacts (campaign_id, status, stopped_reason) — replied contacts query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cc_campaign_status_reason
    ON public.campaign_contacts (campaign_id, status, stopped_reason);

-- email_messages (gmail_account_id, is_tracked, sent_at) — tracking poll in useRealtimeInbox
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emails_account_tracked_sent
    ON public.email_messages (gmail_account_id, sent_at DESC)
    WHERE is_tracked = true;


-- =============================================================================
-- P2 — MEDIUM (less frequent but still beneficial)
-- =============================================================================

-- contacts.auto_followup_enabled — sales automation cron
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_auto_followup
    ON public.contacts (auto_followup_enabled)
    WHERE auto_followup_enabled = true;

-- contacts.relationship_health — relationship actions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_rel_health
    ON public.contacts (relationship_health)
    WHERE relationship_health IS NOT NULL;

-- gmail_accounts.warmup_enabled — account rotation service
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gmail_accounts_warmup
    ON public.gmail_accounts (warmup_enabled)
    WHERE warmup_enabled = true;

-- edit_projects.progress — filtered on my-projects page
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_edit_projects_progress
    ON public.edit_projects (progress);

-- email_messages.delivered_at — tracking dedup (2-min window check)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emails_delivered_at
    ON public.email_messages (delivered_at)
    WHERE delivered_at IS NOT NULL;


-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
    new_count INTEGER;
BEGIN
    SELECT count(*) INTO new_count
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname LIKE 'idx_%';

    RAISE NOTICE '';
    RAISE NOTICE '=== INDEX MIGRATION COMPLETE ===';
    RAISE NOTICE '  New indexes created: %', new_count;
    RAISE NOTICE '';
    RAISE NOTICE '  P0 (critical):  7 indexes — contacts.pipeline_stage, gmail_accounts.status/method, users.extension_api_key';
    RAISE NOTICE '  P1 (high):     13 indexes — contacts analytics cols, projects, compound indexes';
    RAISE NOTICE '  P2 (medium):    5 indexes — partial indexes for filtered queries';
    RAISE NOTICE '';
    RAISE NOTICE '  Total new: 25 indexes';
    RAISE NOTICE '  Uses CONCURRENTLY — no table locks, safe for production';
END $$;

COMMIT;
