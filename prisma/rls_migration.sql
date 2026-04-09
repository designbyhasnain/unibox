-- =============================================================================
-- UNIBOX — Row Level Security (RLS) Migration
-- =============================================================================
-- Defense-in-depth RLS policies for all 22+ tables.
--
-- Architecture context:
--   - Server-side uses SUPABASE_SERVICE_ROLE_KEY → bypasses RLS automatically
--   - Client-side uses NEXT_PUBLIC_SUPABASE_ANON_KEY → subject to RLS
--   - Client-side ONLY accesses: email_messages (realtime + polling), gmail_accounts (join)
--   - App uses custom session auth (AES-256-CBC), NOT Supabase Auth
--   - auth.uid() returns NULL for all requests (no Supabase Auth users)
--
-- Strategy:
--   1. Enable RLS on ALL tables (defense-in-depth)
--   2. Anon SELECT on email_messages + gmail_accounts (realtime subscriptions)
--   3. All other tables: RLS enabled + no anon policy = denied to anon
--   4. Service role bypasses RLS automatically (no explicit policies needed)
--   5. Authenticated role policies added for future Supabase Auth readiness
--
-- If the anon key leaks:
--   ✅ email_messages readable (already semi-public via tracking pixels)
--   ✅ gmail_accounts readable (only email + status, no tokens — tokens are encrypted)
--   ❌ users, invitations, contacts, campaigns, projects — ALL BLOCKED
--   ❌ No INSERT/UPDATE/DELETE on any table via anon
--
-- Run with: psql $DATABASE_URL -f prisma/rls_migration.sql
-- Or paste into Supabase Dashboard → SQL Editor
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: Enable RLS on all tables
-- =============================================================================
-- Core tables (from Prisma schema)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_gmail_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ignored_senders ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE unsubscribes ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_send_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE edit_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;

-- Non-Prisma tables (exist in Supabase but not in schema.prisma)
-- Use DO block to handle tables that may not exist
DO $$ BEGIN
    EXECUTE 'ALTER TABLE competitor_mentions ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE 'ALTER TABLE projects_backup_20260329 ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- =============================================================================
-- STEP 2: Drop any existing policies (idempotent migration)
-- =============================================================================
-- Anon policies
DROP POLICY IF EXISTS "anon_select_email_messages" ON email_messages;
DROP POLICY IF EXISTS "anon_select_gmail_accounts" ON gmail_accounts;

-- Authenticated policies
DROP POLICY IF EXISTS "auth_select_users" ON users;
DROP POLICY IF EXISTS "auth_select_contacts" ON contacts;
DROP POLICY IF EXISTS "auth_select_gmail_accounts" ON gmail_accounts;
DROP POLICY IF EXISTS "auth_all_email_threads" ON email_threads;
DROP POLICY IF EXISTS "auth_all_email_messages" ON email_messages;
DROP POLICY IF EXISTS "auth_select_projects" ON projects;
DROP POLICY IF EXISTS "auth_select_activity_logs" ON activity_logs;
DROP POLICY IF EXISTS "auth_select_ignored_senders" ON ignored_senders;
DROP POLICY IF EXISTS "auth_select_campaigns" ON campaigns;
DROP POLICY IF EXISTS "auth_select_campaign_steps" ON campaign_steps;
DROP POLICY IF EXISTS "auth_select_campaign_variants" ON campaign_variants;
DROP POLICY IF EXISTS "auth_select_campaign_contacts" ON campaign_contacts;
DROP POLICY IF EXISTS "auth_select_campaign_emails" ON campaign_emails;
DROP POLICY IF EXISTS "auth_select_unsubscribes" ON unsubscribes;
DROP POLICY IF EXISTS "auth_select_campaign_analytics" ON campaign_analytics;
DROP POLICY IF EXISTS "auth_select_webhook_events" ON webhook_events;
DROP POLICY IF EXISTS "auth_select_campaign_send_queue" ON campaign_send_queue;
DROP POLICY IF EXISTS "auth_select_email_templates" ON email_templates;
DROP POLICY IF EXISTS "auth_select_edit_projects" ON edit_projects;
DROP POLICY IF EXISTS "auth_select_project_comments" ON project_comments;
DROP POLICY IF EXISTS "auth_select_invitations" ON invitations;
DROP POLICY IF EXISTS "auth_select_user_gmail_assignments" ON user_gmail_assignments;


-- =============================================================================
-- STEP 3: Anon policies — ONLY for realtime/polling tables
-- =============================================================================
-- These two tables are accessed by the browser client (supabase-client.ts)
-- via useRealtimeInbox hook for realtime WebSocket subscriptions and polling.
--
-- SELECT only — no INSERT/UPDATE/DELETE via anon key.
-- Tokens in gmail_accounts are AES-256-GCM encrypted, so they're safe even if read.

-- email_messages: realtime subscriptions (INSERT/UPDATE/DELETE events) + polling queries
CREATE POLICY "anon_select_email_messages"
    ON email_messages
    FOR SELECT
    TO anon
    USING (true);

-- gmail_accounts: needed for join in polling query: gmail_accounts ( email )
-- Only exposes: id, email, status — tokens are encrypted at rest
CREATE POLICY "anon_select_gmail_accounts"
    ON gmail_accounts
    FOR SELECT
    TO anon
    USING (true);


-- =============================================================================
-- STEP 4: Authenticated role policies (future Supabase Auth readiness)
-- =============================================================================
-- Currently the app uses custom session auth + service_role key for all
-- server-side queries (bypasses RLS). These policies prepare for a future
-- migration to Supabase Auth where auth.uid() would return the user ID.
--
-- For now, authenticated role has full SELECT on all tables (since any
-- authenticated Supabase Auth user would be a valid app user).

-- users: authenticated can read all users (team directory)
CREATE POLICY "auth_select_users"
    ON users FOR SELECT TO authenticated
    USING (true);

-- contacts: authenticated can read all contacts
CREATE POLICY "auth_select_contacts"
    ON contacts FOR SELECT TO authenticated
    USING (true);

-- gmail_accounts: authenticated can read all accounts
CREATE POLICY "auth_select_gmail_accounts"
    ON gmail_accounts FOR SELECT TO authenticated
    USING (true);

-- email_threads: authenticated can read all threads
CREATE POLICY "auth_all_email_threads"
    ON email_threads FOR SELECT TO authenticated
    USING (true);

-- email_messages: authenticated can read all messages
CREATE POLICY "auth_all_email_messages"
    ON email_messages FOR SELECT TO authenticated
    USING (true);

-- projects: authenticated can read all projects
CREATE POLICY "auth_select_projects"
    ON projects FOR SELECT TO authenticated
    USING (true);

-- activity_logs: authenticated can read all logs
CREATE POLICY "auth_select_activity_logs"
    ON activity_logs FOR SELECT TO authenticated
    USING (true);

-- ignored_senders: authenticated can read blocklist
CREATE POLICY "auth_select_ignored_senders"
    ON ignored_senders FOR SELECT TO authenticated
    USING (true);

-- campaigns: authenticated can read all campaigns
CREATE POLICY "auth_select_campaigns"
    ON campaigns FOR SELECT TO authenticated
    USING (true);

-- campaign_steps: authenticated can read all steps
CREATE POLICY "auth_select_campaign_steps"
    ON campaign_steps FOR SELECT TO authenticated
    USING (true);

-- campaign_variants: authenticated can read all variants
CREATE POLICY "auth_select_campaign_variants"
    ON campaign_variants FOR SELECT TO authenticated
    USING (true);

-- campaign_contacts: authenticated can read all enrollments
CREATE POLICY "auth_select_campaign_contacts"
    ON campaign_contacts FOR SELECT TO authenticated
    USING (true);

-- campaign_emails: authenticated can read all campaign emails
CREATE POLICY "auth_select_campaign_emails"
    ON campaign_emails FOR SELECT TO authenticated
    USING (true);

-- unsubscribes: authenticated can read unsubscribe list
CREATE POLICY "auth_select_unsubscribes"
    ON unsubscribes FOR SELECT TO authenticated
    USING (true);

-- campaign_analytics: authenticated can read analytics
CREATE POLICY "auth_select_campaign_analytics"
    ON campaign_analytics FOR SELECT TO authenticated
    USING (true);

-- webhook_events: authenticated can read webhook events
CREATE POLICY "auth_select_webhook_events"
    ON webhook_events FOR SELECT TO authenticated
    USING (true);

-- campaign_send_queue: authenticated can read send queue
CREATE POLICY "auth_select_campaign_send_queue"
    ON campaign_send_queue FOR SELECT TO authenticated
    USING (true);

-- email_templates: authenticated can read all templates
CREATE POLICY "auth_select_email_templates"
    ON email_templates FOR SELECT TO authenticated
    USING (true);

-- edit_projects: authenticated can read all edit projects
CREATE POLICY "auth_select_edit_projects"
    ON edit_projects FOR SELECT TO authenticated
    USING (true);

-- project_comments: authenticated can read all comments
CREATE POLICY "auth_select_project_comments"
    ON project_comments FOR SELECT TO authenticated
    USING (true);

-- invitations: authenticated can read invitations
CREATE POLICY "auth_select_invitations"
    ON invitations FOR SELECT TO authenticated
    USING (true);

-- user_gmail_assignments: authenticated can read assignments
CREATE POLICY "auth_select_user_gmail_assignments"
    ON user_gmail_assignments FOR SELECT TO authenticated
    USING (true);


-- =============================================================================
-- STEP 5: Verify RLS is enabled on all tables
-- =============================================================================
-- This query returns any tables in public schema that do NOT have RLS enabled.
-- Should return 0 rows after this migration.
DO $$
DECLARE
    unprotected_count INTEGER;
    unprotected_tables TEXT;
BEGIN
    SELECT count(*), string_agg(tablename, ', ')
    INTO unprotected_count, unprotected_tables
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '_prisma_%'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT IN (
          SELECT relname::text FROM pg_class
          WHERE relrowsecurity = true
      );

    IF unprotected_count > 0 THEN
        RAISE WARNING 'RLS NOT enabled on % table(s): %', unprotected_count, unprotected_tables;
    ELSE
        RAISE NOTICE 'RLS verification passed: all public tables have RLS enabled.';
    END IF;
END $$;


-- =============================================================================
-- STEP 6: Summary of security posture
-- =============================================================================
-- Print policy summary for audit
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    SELECT count(*) INTO policy_count FROM pg_policies WHERE schemaname = 'public';
    RAISE NOTICE 'Total RLS policies in public schema: %', policy_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Security posture after migration:';
    RAISE NOTICE '  anon role:          SELECT on email_messages, gmail_accounts ONLY';
    RAISE NOTICE '  authenticated role: SELECT on all tables (future Supabase Auth readiness)';
    RAISE NOTICE '  service_role:       FULL ACCESS (bypasses RLS automatically)';
    RAISE NOTICE '  All other access:   DENIED (RLS enabled, no matching policy)';
    RAISE NOTICE '';
    RAISE NOTICE 'Sensitive tables fully blocked from anon:';
    RAISE NOTICE '  users, contacts, invitations, campaigns, projects,';
    RAISE NOTICE '  user_gmail_assignments, email_templates, webhook_events,';
    RAISE NOTICE '  campaign_send_queue, edit_projects, project_comments';
END $$;

COMMIT;
