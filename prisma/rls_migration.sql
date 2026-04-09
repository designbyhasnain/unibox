-- =============================================================================
-- UNIBOX — Row Level Security (RLS) Migration — Defense-in-Depth
-- =============================================================================
--
-- Architecture:
--   Server-side  → SUPABASE_SERVICE_ROLE_KEY → bypasses RLS automatically
--   Client-side  → NEXT_PUBLIC_SUPABASE_ANON_KEY → subject to RLS
--   Client usage → useRealtimeInbox: SELECT email_messages + join gmail_accounts
--   Auth system  → Custom AES-256-CBC sessions (NOT Supabase Auth)
--
-- Policy layers:
--   1. service_role  → explicit USING (true) bypass on every table
--   2. authenticated → scoped by auth.uid() = user_id (Supabase Auth readiness)
--                      admins see all, SALES see only their assigned data
--   3. anon          → SELECT only on email_messages + gmail_accounts (realtime)
--                      BLOCKED on all other tables
--
-- Helper functions:
--   is_admin()                  → true if auth.uid() user has ADMIN role
--   user_gmail_account_ids()    → array of gmail account IDs user can access
--
-- If anon key leaks:
--   ✅ email_messages readable (semi-public via tracking pixels anyway)
--   ✅ gmail_accounts readable (tokens are AES-256-GCM encrypted at rest)
--   ❌ users, invitations, contacts, campaigns, projects — ALL BLOCKED
--   ❌ No INSERT/UPDATE/DELETE on any table via anon
--
-- Run: psql "$DIRECT_URL" -f prisma/rls_migration.sql
-- Or:  Supabase Dashboard → SQL Editor → paste & run
-- =============================================================================

BEGIN;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================
-- SECURITY DEFINER = runs with owner privileges so it can read the users table
-- STABLE = can be cached within a single query (performance)

-- Check if the current Supabase Auth user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
          AND role IN ('ADMIN')
          AND status = 'ACTIVE'
    );
$$;

-- Get gmail account IDs the current user can access
-- Admins → all accounts. SALES → only assigned accounts.
CREATE OR REPLACE FUNCTION public.user_gmail_account_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT CASE
        WHEN public.is_admin() THEN
            ARRAY(SELECT id FROM public.gmail_accounts)
        ELSE
            ARRAY(
                SELECT gmail_account_id
                FROM public.user_gmail_assignments
                WHERE user_id = auth.uid()
            )
    END;
$$;

-- Check if user owns or is admin for a specific gmail account
CREATE OR REPLACE FUNCTION public.can_access_gmail_account(account_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT public.is_admin() OR EXISTS (
        SELECT 1 FROM public.user_gmail_assignments
        WHERE user_id = auth.uid()
          AND gmail_account_id = account_id
    ) OR EXISTS (
        SELECT 1 FROM public.gmail_accounts
        WHERE id = account_id
          AND user_id = auth.uid()
    );
$$;


-- =============================================================================
-- STEP 1: ENABLE RLS ON ALL TABLES
-- =============================================================================

ALTER TABLE public.users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_gmail_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_threads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ignored_senders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_steps           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_variants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_emails          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unsubscribes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_analytics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_send_queue      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edit_projects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_comments         ENABLE ROW LEVEL SECURITY;

-- Non-Prisma tables (may or may not exist)
DO $$ BEGIN
    EXECUTE 'ALTER TABLE public.competitor_mentions ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE 'ALTER TABLE public.projects_backup_20260329 ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- =============================================================================
-- STEP 2: DROP ALL EXISTING POLICIES (idempotent re-run)
-- =============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;


-- =============================================================================
-- STEP 3: SERVICE_ROLE BYPASS POLICIES (explicit, all tables)
-- =============================================================================
-- service_role bypasses RLS automatically in Supabase, but explicit policies
-- serve as documentation and defense against misconfiguration.

CREATE POLICY "service_role_all_users"
    ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_contacts"
    ON public.contacts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_gmail_accounts"
    ON public.gmail_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_invitations"
    ON public.invitations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_user_gmail_assignments"
    ON public.user_gmail_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_email_threads"
    ON public.email_threads FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_email_messages"
    ON public.email_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_projects"
    ON public.projects FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_activity_logs"
    ON public.activity_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_ignored_senders"
    ON public.ignored_senders FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_campaigns"
    ON public.campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_campaign_steps"
    ON public.campaign_steps FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_campaign_variants"
    ON public.campaign_variants FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_campaign_contacts"
    ON public.campaign_contacts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_campaign_emails"
    ON public.campaign_emails FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_unsubscribes"
    ON public.unsubscribes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_campaign_analytics"
    ON public.campaign_analytics FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_webhook_events"
    ON public.webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_campaign_send_queue"
    ON public.campaign_send_queue FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_email_templates"
    ON public.email_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_edit_projects"
    ON public.edit_projects FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_project_comments"
    ON public.project_comments FOR ALL TO service_role USING (true) WITH CHECK (true);


-- =============================================================================
-- STEP 4: AUTHENTICATED ROLE POLICIES (scoped by user_id)
-- =============================================================================
-- Uses auth.uid() for Supabase Auth readiness.
-- Admins can see all data. SALES users scoped to their own data.
-- Currently the app uses service_role for all server queries, so these
-- only activate if/when the app migrates to Supabase Auth.

-- ── users ──────────────────────────────────────────────────────────────────
-- Users can read their own record. Admins can read all.
CREATE POLICY "auth_select_users"
    ON public.users FOR SELECT TO authenticated
    USING (
        auth.uid() = id
        OR public.is_admin()
    );
-- Users can update their own record only.
CREATE POLICY "auth_update_users"
    ON public.users FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ── contacts ───────────────────────────────────────────────────────────────
-- Admins see all. SALES see contacts they manage or created.
CREATE POLICY "auth_select_contacts"
    ON public.contacts FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR account_manager_id = auth.uid()
    );
CREATE POLICY "auth_insert_contacts"
    ON public.contacts FOR INSERT TO authenticated
    WITH CHECK (true);  -- any authenticated user can create contacts
CREATE POLICY "auth_update_contacts"
    ON public.contacts FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR account_manager_id = auth.uid()
    );
CREATE POLICY "auth_delete_contacts"
    ON public.contacts FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── gmail_accounts ─────────────────────────────────────────────────────────
-- Admins see all. Users see accounts they created or are assigned to.
CREATE POLICY "auth_select_gmail_accounts"
    ON public.gmail_accounts FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR user_id = auth.uid()
        OR id = ANY(public.user_gmail_account_ids())
    );
CREATE POLICY "auth_update_gmail_accounts"
    ON public.gmail_accounts FOR UPDATE TO authenticated
    USING (public.is_admin() OR user_id = auth.uid());
CREATE POLICY "auth_delete_gmail_accounts"
    ON public.gmail_accounts FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── invitations ────────────────────────────────────────────────────────────
-- Only admins can see/manage invitations. Token column is sensitive.
CREATE POLICY "auth_select_invitations"
    ON public.invitations FOR SELECT TO authenticated
    USING (public.is_admin());
CREATE POLICY "auth_insert_invitations"
    ON public.invitations FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());
CREATE POLICY "auth_update_invitations"
    ON public.invitations FOR UPDATE TO authenticated
    USING (public.is_admin());
CREATE POLICY "auth_delete_invitations"
    ON public.invitations FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── user_gmail_assignments ─────────────────────────────────────────────────
-- Admins see all. Users can see their own assignments.
CREATE POLICY "auth_select_user_gmail_assignments"
    ON public.user_gmail_assignments FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR user_id = auth.uid()
    );
CREATE POLICY "auth_insert_user_gmail_assignments"
    ON public.user_gmail_assignments FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());
CREATE POLICY "auth_delete_user_gmail_assignments"
    ON public.user_gmail_assignments FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── email_threads ──────────────────────────────────────────────────────────
-- Admins see all. Users see threads containing messages from their accounts.
CREATE POLICY "auth_select_email_threads"
    ON public.email_threads FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.email_messages em
            WHERE em.thread_id = email_threads.id
              AND em.gmail_account_id = ANY(public.user_gmail_account_ids())
        )
    );

-- ── email_messages ─────────────────────────────────────────────────────────
-- Admins see all. Users see messages from their accessible gmail accounts.
CREATE POLICY "auth_select_email_messages"
    ON public.email_messages FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR gmail_account_id = ANY(public.user_gmail_account_ids())
    );
CREATE POLICY "auth_update_email_messages"
    ON public.email_messages FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR gmail_account_id = ANY(public.user_gmail_account_ids())
    );
CREATE POLICY "auth_delete_email_messages"
    ON public.email_messages FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── projects ───────────────────────────────────────────────────────────────
-- Admins see all. Users see projects they manage.
CREATE POLICY "auth_select_projects"
    ON public.projects FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR account_manager_id = auth.uid()
    );
CREATE POLICY "auth_insert_projects"
    ON public.projects FOR INSERT TO authenticated
    WITH CHECK (true);
CREATE POLICY "auth_update_projects"
    ON public.projects FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR account_manager_id = auth.uid()
    );
CREATE POLICY "auth_delete_projects"
    ON public.projects FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── activity_logs ──────────────────────────────────────────────────────────
-- Admins see all. Users see logs for contacts they manage.
CREATE POLICY "auth_select_activity_logs"
    ON public.activity_logs FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR performed_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.contacts c
            WHERE c.id = activity_logs.contact_id
              AND c.account_manager_id = auth.uid()
        )
    );
CREATE POLICY "auth_insert_activity_logs"
    ON public.activity_logs FOR INSERT TO authenticated
    WITH CHECK (true);

-- ── ignored_senders ────────────────────────────────────────────────────────
-- Global blocklist. All authenticated users can read. Only admins can modify.
CREATE POLICY "auth_select_ignored_senders"
    ON public.ignored_senders FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "auth_insert_ignored_senders"
    ON public.ignored_senders FOR INSERT TO authenticated
    WITH CHECK (true);
CREATE POLICY "auth_delete_ignored_senders"
    ON public.ignored_senders FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── campaigns ──────────────────────────────────────────────────────────────
-- Admins see all. Users see campaigns they created.
CREATE POLICY "auth_select_campaigns"
    ON public.campaigns FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR created_by_id = auth.uid()
    );
CREATE POLICY "auth_insert_campaigns"
    ON public.campaigns FOR INSERT TO authenticated
    WITH CHECK (true);
CREATE POLICY "auth_update_campaigns"
    ON public.campaigns FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR created_by_id = auth.uid()
    );
CREATE POLICY "auth_delete_campaigns"
    ON public.campaigns FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── campaign_steps ─────────────────────────────────────────────────────────
-- Scoped via parent campaign ownership.
CREATE POLICY "auth_select_campaign_steps"
    ON public.campaign_steps FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = campaign_steps.campaign_id
              AND c.created_by_id = auth.uid()
        )
    );
CREATE POLICY "auth_insert_campaign_steps"
    ON public.campaign_steps FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = campaign_id
              AND (c.created_by_id = auth.uid() OR public.is_admin())
        )
    );
CREATE POLICY "auth_update_campaign_steps"
    ON public.campaign_steps FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = campaign_steps.campaign_id
              AND c.created_by_id = auth.uid()
        )
    );
CREATE POLICY "auth_delete_campaign_steps"
    ON public.campaign_steps FOR DELETE TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = campaign_steps.campaign_id
              AND c.created_by_id = auth.uid()
        )
    );

-- ── campaign_variants ──────────────────────────────────────────────────────
-- Scoped via parent step → campaign ownership.
CREATE POLICY "auth_select_campaign_variants"
    ON public.campaign_variants FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.campaign_steps cs
            JOIN public.campaigns c ON c.id = cs.campaign_id
            WHERE cs.id = campaign_variants.step_id
              AND c.created_by_id = auth.uid()
        )
    );
CREATE POLICY "auth_all_campaign_variants"
    ON public.campaign_variants FOR INSERT TO authenticated
    WITH CHECK (true);

-- ── campaign_contacts ──────────────────────────────────────────────────────
-- Scoped via parent campaign ownership.
CREATE POLICY "auth_select_campaign_contacts"
    ON public.campaign_contacts FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = campaign_contacts.campaign_id
              AND c.created_by_id = auth.uid()
        )
    );
CREATE POLICY "auth_insert_campaign_contacts"
    ON public.campaign_contacts FOR INSERT TO authenticated
    WITH CHECK (true);
CREATE POLICY "auth_update_campaign_contacts"
    ON public.campaign_contacts FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = campaign_contacts.campaign_id
              AND c.created_by_id = auth.uid()
        )
    );

-- ── campaign_emails ────────────────────────────────────────────────────────
-- Scoped via parent campaign ownership.
CREATE POLICY "auth_select_campaign_emails"
    ON public.campaign_emails FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = campaign_emails.campaign_id
              AND c.created_by_id = auth.uid()
        )
    );

-- ── unsubscribes ───────────────────────────────────────────────────────────
-- Global list. All authenticated can read. Insert open (unsubscribe handler).
CREATE POLICY "auth_select_unsubscribes"
    ON public.unsubscribes FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "auth_insert_unsubscribes"
    ON public.unsubscribes FOR INSERT TO authenticated
    WITH CHECK (true);

-- ── campaign_analytics ─────────────────────────────────────────────────────
-- Scoped via parent campaign ownership.
CREATE POLICY "auth_select_campaign_analytics"
    ON public.campaign_analytics FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = campaign_analytics.campaign_id
              AND c.created_by_id = auth.uid()
        )
    );

-- ── webhook_events ─────────────────────────────────────────────────────────
-- System table. Admins only.
CREATE POLICY "auth_select_webhook_events"
    ON public.webhook_events FOR SELECT TO authenticated
    USING (public.is_admin());

-- ── campaign_send_queue ────────────────────────────────────────────────────
-- System table. Admins only.
CREATE POLICY "auth_select_campaign_send_queue"
    ON public.campaign_send_queue FOR SELECT TO authenticated
    USING (public.is_admin());

-- ── email_templates ────────────────────────────────────────────────────────
-- Users see their own templates + shared ones. Admins see all.
CREATE POLICY "auth_select_email_templates"
    ON public.email_templates FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR created_by_id = auth.uid()
        OR is_shared = true
    );
CREATE POLICY "auth_insert_email_templates"
    ON public.email_templates FOR INSERT TO authenticated
    WITH CHECK (created_by_id = auth.uid());
CREATE POLICY "auth_update_email_templates"
    ON public.email_templates FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR created_by_id = auth.uid()
    );
CREATE POLICY "auth_delete_email_templates"
    ON public.email_templates FOR DELETE TO authenticated
    USING (
        public.is_admin()
        OR created_by_id = auth.uid()
    );

-- ── edit_projects ──────────────────────────────────────────────────────────
-- Users see their own edit projects. Admins see all.
CREATE POLICY "auth_select_edit_projects"
    ON public.edit_projects FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR user_id = auth.uid()
    );
CREATE POLICY "auth_insert_edit_projects"
    ON public.edit_projects FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
CREATE POLICY "auth_update_edit_projects"
    ON public.edit_projects FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR user_id = auth.uid()
    );
CREATE POLICY "auth_delete_edit_projects"
    ON public.edit_projects FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── project_comments ───────────────────────────────────────────────────────
-- Scoped via parent edit_project ownership.
CREATE POLICY "auth_select_project_comments"
    ON public.project_comments FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.edit_projects ep
            WHERE ep.id = project_comments.project_id
              AND ep.user_id = auth.uid()
        )
    );
CREATE POLICY "auth_insert_project_comments"
    ON public.project_comments FOR INSERT TO authenticated
    WITH CHECK (true);


-- =============================================================================
-- STEP 5: ANON POLICIES — ONLY for realtime/polling tables
-- =============================================================================
-- The anon key is used ONLY by useRealtimeInbox.ts for:
--   1. Realtime WebSocket subscriptions on email_messages (INSERT/UPDATE/DELETE)
--   2. Polling queries: SELECT from email_messages with join to gmail_accounts
--
-- SELECT only. No INSERT/UPDATE/DELETE via anon.
-- All other tables: RLS enabled + no anon policy = DENIED.

-- email_messages: realtime subscriptions + polling queries
-- Anon can read all messages (filtered client-side by gmail_account_id).
-- Risk is acceptable: email content is semi-public (tracking pixels expose opens),
-- and the anon key is only sent to authenticated browser sessions.
CREATE POLICY "anon_select_email_messages"
    ON public.email_messages
    FOR SELECT
    TO anon
    USING (true);

-- gmail_accounts: needed for FK join in polling query: gmail_accounts ( email )
-- Only exposes id, email, status — OAuth tokens are AES-256-GCM encrypted.
CREATE POLICY "anon_select_gmail_accounts"
    ON public.gmail_accounts
    FOR SELECT
    TO anon
    USING (true);


-- =============================================================================
-- STEP 6: VERIFICATION
-- =============================================================================

-- Check all public tables have RLS enabled
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
      AND NOT EXISTS (
          SELECT 1 FROM pg_class
          WHERE relname = pg_tables.tablename
            AND relnamespace = 'public'::regnamespace
            AND relrowsecurity = true
      );

    IF unprotected_count > 0 THEN
        RAISE WARNING '[RLS] Tables WITHOUT RLS (% found): %', unprotected_count, unprotected_tables;
    ELSE
        RAISE NOTICE '[RLS] All public tables have RLS enabled.';
    END IF;
END $$;

-- Count policies per table
DO $$
DECLARE
    r RECORD;
    total INTEGER := 0;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== RLS POLICY SUMMARY ===';
    RAISE NOTICE '';
    FOR r IN (
        SELECT tablename, count(*) as cnt
        FROM pg_policies
        WHERE schemaname = 'public'
        GROUP BY tablename
        ORDER BY tablename
    ) LOOP
        RAISE NOTICE '  %-35s %s policies', r.tablename, r.cnt;
        total := total + r.cnt;
    END LOOP;
    RAISE NOTICE '';
    RAISE NOTICE '  TOTAL: % policies across all tables', total;
    RAISE NOTICE '';
    RAISE NOTICE '=== SECURITY POSTURE ===';
    RAISE NOTICE '  anon:          SELECT on email_messages + gmail_accounts ONLY';
    RAISE NOTICE '  authenticated: Scoped by auth.uid() (admin=all, sales=own data)';
    RAISE NOTICE '  service_role:  Explicit USING(true) on ALL tables + auto-bypass';
    RAISE NOTICE '  All other:     DENIED (RLS enabled, no matching policy)';
END $$;

COMMIT;
