-- =============================================================================
-- UNIBOX — Row Level Security (RLS) Migration — Defense-in-Depth
-- =============================================================================
-- Fixes: search_path on all functions, pg_trgm schema, tightened INSERT policies
-- ALL comparisons use ::uuid on BOTH sides.
-- =============================================================================

BEGIN;

-- =============================================================================
-- FIX: Move pg_trgm extension out of public schema
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- =============================================================================
-- TEMP HELPERS (with search_path set)
-- =============================================================================

CREATE OR REPLACE FUNCTION _temp_exec(sql text)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN EXECUTE sql;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipped (table missing): %', left(sql, 80);
END; $$;

CREATE OR REPLACE FUNCTION _temp_rls(tbl text)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipped RLS enable (table missing): %', tbl;
END; $$;

-- =============================================================================
-- HELPER FUNCTIONS (with search_path set)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id::uuid = auth.uid()::uuid
          AND role IN ('ADMIN')
    );
$$;

CREATE OR REPLACE FUNCTION public.user_gmail_account_ids()
RETURNS uuid[] LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
    SELECT CASE
        WHEN public.is_admin() THEN
            ARRAY(SELECT id::uuid FROM public.gmail_accounts)
        ELSE
            ARRAY(
                SELECT gmail_account_id::uuid
                FROM public.user_gmail_assignments
                WHERE user_id::uuid = auth.uid()::uuid
            )
    END;
$$;

-- =============================================================================
-- ENABLE RLS
-- =============================================================================

SELECT _temp_rls('users');
SELECT _temp_rls('contacts');
SELECT _temp_rls('gmail_accounts');
SELECT _temp_rls('invitations');
SELECT _temp_rls('user_gmail_assignments');
SELECT _temp_rls('email_threads');
SELECT _temp_rls('email_messages');
SELECT _temp_rls('projects');
SELECT _temp_rls('activity_logs');
SELECT _temp_rls('ignored_senders');
SELECT _temp_rls('campaigns');
SELECT _temp_rls('campaign_steps');
SELECT _temp_rls('campaign_variants');
SELECT _temp_rls('campaign_contacts');
SELECT _temp_rls('campaign_emails');
SELECT _temp_rls('unsubscribes');
SELECT _temp_rls('campaign_analytics');
SELECT _temp_rls('webhook_events');
SELECT _temp_rls('campaign_send_queue');
SELECT _temp_rls('email_templates');
SELECT _temp_rls('edit_projects');
SELECT _temp_rls('project_comments');
SELECT _temp_rls('competitor_mentions');
SELECT _temp_rls('scrape_jobs');
SELECT _temp_rls('scrape_results');

-- =============================================================================
-- DROP ALL EXISTING POLICIES
-- =============================================================================

DO $$ DECLARE r RECORD;
BEGIN
    FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public')
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- =============================================================================
-- SERVICE_ROLE BYPASS
-- =============================================================================

SELECT _temp_exec('CREATE POLICY "sr_users" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_contacts" ON public.contacts FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_gmail_accounts" ON public.gmail_accounts FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_invitations" ON public.invitations FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_user_gmail_assignments" ON public.user_gmail_assignments FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_email_threads" ON public.email_threads FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_email_messages" ON public.email_messages FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_projects" ON public.projects FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_activity_logs" ON public.activity_logs FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_ignored_senders" ON public.ignored_senders FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_campaigns" ON public.campaigns FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_campaign_steps" ON public.campaign_steps FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_campaign_variants" ON public.campaign_variants FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_campaign_contacts" ON public.campaign_contacts FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_campaign_emails" ON public.campaign_emails FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_unsubscribes" ON public.unsubscribes FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_campaign_analytics" ON public.campaign_analytics FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_webhook_events" ON public.webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_campaign_send_queue" ON public.campaign_send_queue FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_email_templates" ON public.email_templates FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_edit_projects" ON public.edit_projects FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_project_comments" ON public.project_comments FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_competitor_mentions" ON public.competitor_mentions FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_scrape_jobs" ON public.scrape_jobs FOR ALL TO service_role USING (true) WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "sr_scrape_results" ON public.scrape_results FOR ALL TO service_role USING (true) WITH CHECK (true)');

-- =============================================================================
-- AUTHENTICATED POLICIES
-- All INSERT policies tightened with owner column checks.
-- =============================================================================

-- ── users ──────────────────────────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_users" ON public.users FOR SELECT TO authenticated
    USING (id::uuid = auth.uid()::uuid OR public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_upd_users" ON public.users FOR UPDATE TO authenticated
    USING (id::uuid = auth.uid()::uuid) WITH CHECK (id::uuid = auth.uid()::uuid)');

-- ── contacts ───────────────────────────────────────────────────────────────
-- owner: account_manager_id
SELECT _temp_exec('CREATE POLICY "auth_sel_contacts" ON public.contacts FOR SELECT TO authenticated
    USING (public.is_admin() OR account_manager_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_ins_contacts" ON public.contacts FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR account_manager_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_upd_contacts" ON public.contacts FOR UPDATE TO authenticated
    USING (public.is_admin() OR account_manager_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_del_contacts" ON public.contacts FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── gmail_accounts ─────────────────────────────────────────────────────────
-- owner: user_id (createdById)
SELECT _temp_exec('CREATE POLICY "auth_sel_gmail_accounts" ON public.gmail_accounts FOR SELECT TO authenticated
    USING (public.is_admin() OR user_id::uuid = auth.uid()::uuid OR id::uuid = ANY(public.user_gmail_account_ids()))');
SELECT _temp_exec('CREATE POLICY "auth_upd_gmail_accounts" ON public.gmail_accounts FOR UPDATE TO authenticated
    USING (public.is_admin() OR user_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_del_gmail_accounts" ON public.gmail_accounts FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── invitations ────────────────────────────────────────────────────────────
-- admin only
SELECT _temp_exec('CREATE POLICY "auth_sel_invitations" ON public.invitations FOR SELECT TO authenticated
    USING (public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_ins_invitations" ON public.invitations FOR INSERT TO authenticated
    WITH CHECK (public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_upd_invitations" ON public.invitations FOR UPDATE TO authenticated
    USING (public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_del_invitations" ON public.invitations FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── user_gmail_assignments ─────────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_uga" ON public.user_gmail_assignments FOR SELECT TO authenticated
    USING (public.is_admin() OR user_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_ins_uga" ON public.user_gmail_assignments FOR INSERT TO authenticated
    WITH CHECK (public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_del_uga" ON public.user_gmail_assignments FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── email_threads ──────────────────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_email_threads" ON public.email_threads FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.email_messages em
        WHERE em.thread_id::uuid = email_threads.id::uuid
          AND em.gmail_account_id::uuid = ANY(public.user_gmail_account_ids())
    ))');

-- ── email_messages ─────────────────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_email_messages" ON public.email_messages FOR SELECT TO authenticated
    USING (public.is_admin() OR gmail_account_id::uuid = ANY(public.user_gmail_account_ids()))');
SELECT _temp_exec('CREATE POLICY "auth_upd_email_messages" ON public.email_messages FOR UPDATE TO authenticated
    USING (public.is_admin() OR gmail_account_id::uuid = ANY(public.user_gmail_account_ids()))');
SELECT _temp_exec('CREATE POLICY "auth_del_email_messages" ON public.email_messages FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── projects ───────────────────────────────────────────────────────────────
-- owner: account_manager_id
SELECT _temp_exec('CREATE POLICY "auth_sel_projects" ON public.projects FOR SELECT TO authenticated
    USING (public.is_admin() OR account_manager_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_ins_projects" ON public.projects FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR account_manager_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_upd_projects" ON public.projects FOR UPDATE TO authenticated
    USING (public.is_admin() OR account_manager_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_del_projects" ON public.projects FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── activity_logs ──────────────────────────────────────────────────────────
-- owner: performed_by
SELECT _temp_exec('CREATE POLICY "auth_sel_activity_logs" ON public.activity_logs FOR SELECT TO authenticated
    USING (public.is_admin() OR performed_by::uuid = auth.uid()::uuid OR EXISTS (
        SELECT 1 FROM public.contacts c
        WHERE c.id::uuid = activity_logs.contact_id::uuid
          AND c.account_manager_id::uuid = auth.uid()::uuid
    ))');
SELECT _temp_exec('CREATE POLICY "auth_ins_activity_logs" ON public.activity_logs FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR performed_by::uuid = auth.uid()::uuid)');

-- ── ignored_senders ────────────────────────────────────────────────────────
-- global table, admin can insert/delete, all can read
SELECT _temp_exec('CREATE POLICY "auth_sel_ignored_senders" ON public.ignored_senders FOR SELECT TO authenticated
    USING (true)');
SELECT _temp_exec('CREATE POLICY "auth_ins_ignored_senders" ON public.ignored_senders FOR INSERT TO authenticated
    WITH CHECK (public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_del_ignored_senders" ON public.ignored_senders FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── campaigns ──────────────────────────────────────────────────────────────
-- owner: created_by_id
SELECT _temp_exec('CREATE POLICY "auth_sel_campaigns" ON public.campaigns FOR SELECT TO authenticated
    USING (public.is_admin() OR created_by_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_ins_campaigns" ON public.campaigns FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR created_by_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_upd_campaigns" ON public.campaigns FOR UPDATE TO authenticated
    USING (public.is_admin() OR created_by_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_del_campaigns" ON public.campaigns FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── campaign_steps ─────────────────────────────────────────────────────────
-- owner: via campaign.created_by_id
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_steps" ON public.campaign_steps FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id::uuid = campaign_steps.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()::uuid
    ))');
SELECT _temp_exec('CREATE POLICY "auth_ins_campaign_steps" ON public.campaign_steps FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id::uuid = campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()::uuid
    ))');
SELECT _temp_exec('CREATE POLICY "auth_upd_campaign_steps" ON public.campaign_steps FOR UPDATE TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id::uuid = campaign_steps.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()::uuid
    ))');
SELECT _temp_exec('CREATE POLICY "auth_del_campaign_steps" ON public.campaign_steps FOR DELETE TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id::uuid = campaign_steps.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()::uuid
    ))');

-- ── campaign_variants ──────────────────────────────────────────────────────
-- owner: via step → campaign.created_by_id
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_variants" ON public.campaign_variants FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaign_steps cs
        JOIN public.campaigns c ON c.id::uuid = cs.campaign_id::uuid
        WHERE cs.id::uuid = campaign_variants.step_id::uuid
          AND c.created_by_id::uuid = auth.uid()::uuid
    ))');
SELECT _temp_exec('CREATE POLICY "auth_ins_campaign_variants" ON public.campaign_variants FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaign_steps cs
        JOIN public.campaigns c ON c.id::uuid = cs.campaign_id::uuid
        WHERE cs.id::uuid = step_id::uuid
          AND c.created_by_id::uuid = auth.uid()::uuid
    ))');

-- ── campaign_contacts ──────────────────────────────────────────────────────
-- owner: via campaign.created_by_id
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_contacts" ON public.campaign_contacts FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id::uuid = campaign_contacts.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()::uuid
    ))');
SELECT _temp_exec('CREATE POLICY "auth_ins_campaign_contacts" ON public.campaign_contacts FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id::uuid = campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()::uuid
    ))');
SELECT _temp_exec('CREATE POLICY "auth_upd_campaign_contacts" ON public.campaign_contacts FOR UPDATE TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id::uuid = campaign_contacts.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()::uuid
    ))');

-- ── campaign_emails ────────────────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_emails" ON public.campaign_emails FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id::uuid = campaign_emails.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()::uuid
    ))');

-- ── unsubscribes ───────────────────────────────────────────────────────────
-- global: anyone can read, only service_role inserts (via unsubscribe handler)
SELECT _temp_exec('CREATE POLICY "auth_sel_unsubscribes" ON public.unsubscribes FOR SELECT TO authenticated
    USING (true)');
SELECT _temp_exec('CREATE POLICY "auth_ins_unsubscribes" ON public.unsubscribes FOR INSERT TO authenticated
    WITH CHECK (public.is_admin())');

-- ── campaign_analytics ─────────────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_analytics" ON public.campaign_analytics FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id::uuid = campaign_analytics.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()::uuid
    ))');

-- ── webhook_events ─────────────────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_webhook_events" ON public.webhook_events FOR SELECT TO authenticated
    USING (public.is_admin())');

-- ── campaign_send_queue ────────────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_send_queue" ON public.campaign_send_queue FOR SELECT TO authenticated
    USING (public.is_admin())');

-- ── email_templates ────────────────────────────────────────────────────────
-- owner: created_by_id
SELECT _temp_exec('CREATE POLICY "auth_sel_email_templates" ON public.email_templates FOR SELECT TO authenticated
    USING (public.is_admin() OR created_by_id::uuid = auth.uid()::uuid OR is_shared = true)');
SELECT _temp_exec('CREATE POLICY "auth_ins_email_templates" ON public.email_templates FOR INSERT TO authenticated
    WITH CHECK (created_by_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_upd_email_templates" ON public.email_templates FOR UPDATE TO authenticated
    USING (public.is_admin() OR created_by_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_del_email_templates" ON public.email_templates FOR DELETE TO authenticated
    USING (public.is_admin() OR created_by_id::uuid = auth.uid()::uuid)');

-- ── edit_projects ──────────────────────────────────────────────────────────
-- owner: user_id
SELECT _temp_exec('CREATE POLICY "auth_sel_edit_projects" ON public.edit_projects FOR SELECT TO authenticated
    USING (public.is_admin() OR user_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_ins_edit_projects" ON public.edit_projects FOR INSERT TO authenticated
    WITH CHECK (user_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_upd_edit_projects" ON public.edit_projects FOR UPDATE TO authenticated
    USING (public.is_admin() OR user_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_del_edit_projects" ON public.edit_projects FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── project_comments ───────────────────────────────────────────────────────
-- owner: author_id
SELECT _temp_exec('CREATE POLICY "auth_sel_project_comments" ON public.project_comments FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.edit_projects ep
        WHERE ep.id::uuid = project_comments.project_id::uuid
          AND ep.user_id::uuid = auth.uid()::uuid
    ))');
SELECT _temp_exec('CREATE POLICY "auth_ins_project_comments" ON public.project_comments FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR author_id::uuid = auth.uid()::uuid)');

-- ── scrape_jobs ───────────────────────────────────────────────────────────
-- owner: user_id
SELECT _temp_exec('CREATE POLICY "auth_sel_scrape_jobs" ON public.scrape_jobs FOR SELECT TO authenticated
    USING (public.is_admin() OR user_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_ins_scrape_jobs" ON public.scrape_jobs FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR user_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_upd_scrape_jobs" ON public.scrape_jobs FOR UPDATE TO authenticated
    USING (public.is_admin() OR user_id::uuid = auth.uid()::uuid)');
SELECT _temp_exec('CREATE POLICY "auth_del_scrape_jobs" ON public.scrape_jobs FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── scrape_results ────────────────────────────────────────────────────────
-- owner: via scrape_jobs.user_id (JOIN pattern)
SELECT _temp_exec('CREATE POLICY "auth_sel_scrape_results" ON public.scrape_results FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.scrape_jobs sj
        WHERE sj.id::uuid = scrape_results.job_id::uuid
          AND sj.user_id::uuid = auth.uid()::uuid
    ))');
SELECT _temp_exec('CREATE POLICY "auth_ins_scrape_results" ON public.scrape_results FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.scrape_jobs sj
        WHERE sj.id::uuid = job_id::uuid
          AND sj.user_id::uuid = auth.uid()::uuid
    ))');
SELECT _temp_exec('CREATE POLICY "auth_upd_scrape_results" ON public.scrape_results FOR UPDATE TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.scrape_jobs sj
        WHERE sj.id::uuid = scrape_results.job_id::uuid
          AND sj.user_id::uuid = auth.uid()::uuid
    ))');
SELECT _temp_exec('CREATE POLICY "auth_del_scrape_results" ON public.scrape_results FOR DELETE TO authenticated
    USING (public.is_admin())');

-- =============================================================================
-- ANON POLICIES — realtime/polling only
-- =============================================================================

SELECT _temp_exec('CREATE POLICY "anon_sel_email_messages" ON public.email_messages FOR SELECT TO anon USING (true)');
SELECT _temp_exec('CREATE POLICY "anon_sel_gmail_accounts" ON public.gmail_accounts FOR SELECT TO anon USING (true)');

-- =============================================================================
-- CLEANUP & VERIFY
-- =============================================================================

DROP FUNCTION IF EXISTS _temp_exec(text);
DROP FUNCTION IF EXISTS _temp_rls(text);

DO $$ DECLARE r RECORD; total INTEGER := 0;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== RLS POLICY SUMMARY ===';
    FOR r IN (
        SELECT tablename, count(*) as cnt
        FROM pg_policies WHERE schemaname = 'public'
        GROUP BY tablename ORDER BY tablename
    ) LOOP
        RAISE NOTICE '  %-35s %s policies', r.tablename, r.cnt;
        total := total + r.cnt;
    END LOOP;
    RAISE NOTICE '  TOTAL: % policies', total;
    RAISE NOTICE '';
    RAISE NOTICE '  All functions have SET search_path = public';
    RAISE NOTICE '  pg_trgm moved to extensions schema';
    RAISE NOTICE '  All INSERT policies scoped by owner column';
END $$;

COMMIT;
