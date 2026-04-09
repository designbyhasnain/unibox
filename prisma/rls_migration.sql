-- =============================================================================
-- UNIBOX — Row Level Security (RLS) Migration — Defense-in-Depth
-- =============================================================================
--
-- Policy layers:
--   1. service_role  → explicit USING (true) bypass on every table
--   2. authenticated → scoped by auth.uid() = user_id (Supabase Auth readiness)
--   3. anon          → SELECT only on email_messages + gmail_accounts (realtime)
--
-- Run: Supabase Dashboard → SQL Editor → paste & run
-- =============================================================================

BEGIN;

-- =============================================================================
-- HELPER: safe_enable_rls / safe_policy — skip tables that don't exist
-- =============================================================================

CREATE OR REPLACE FUNCTION _temp_enable_rls(tbl text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping RLS enable — table % does not exist', tbl;
END;
$$;

CREATE OR REPLACE FUNCTION _temp_exec(sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE sql;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping — table does not exist: %', sql;
END;
$$;


-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
          AND role IN ('ADMIN')
    );
$$;

CREATE OR REPLACE FUNCTION public.user_gmail_account_ids()
RETURNS uuid[]
LANGUAGE sql SECURITY DEFINER STABLE
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


-- =============================================================================
-- STEP 1: ENABLE RLS ON ALL TABLES
-- =============================================================================

SELECT _temp_enable_rls('users');
SELECT _temp_enable_rls('contacts');
SELECT _temp_enable_rls('gmail_accounts');
SELECT _temp_enable_rls('invitations');
SELECT _temp_enable_rls('user_gmail_assignments');
SELECT _temp_enable_rls('email_threads');
SELECT _temp_enable_rls('email_messages');
SELECT _temp_enable_rls('projects');
SELECT _temp_enable_rls('activity_logs');
SELECT _temp_enable_rls('ignored_senders');
SELECT _temp_enable_rls('campaigns');
SELECT _temp_enable_rls('campaign_steps');
SELECT _temp_enable_rls('campaign_variants');
SELECT _temp_enable_rls('campaign_contacts');
SELECT _temp_enable_rls('campaign_emails');
SELECT _temp_enable_rls('unsubscribes');
SELECT _temp_enable_rls('campaign_analytics');
SELECT _temp_enable_rls('webhook_events');
SELECT _temp_enable_rls('campaign_send_queue');
SELECT _temp_enable_rls('email_templates');
SELECT _temp_enable_rls('edit_projects');
SELECT _temp_enable_rls('project_comments');
SELECT _temp_enable_rls('competitor_mentions');
SELECT _temp_enable_rls('projects_backup_20260329');


-- =============================================================================
-- STEP 2: DROP ALL EXISTING POLICIES (idempotent re-run)
-- =============================================================================

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename
        FROM pg_policies WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;


-- =============================================================================
-- STEP 3: SERVICE_ROLE BYPASS — explicit on every table
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


-- =============================================================================
-- STEP 4: AUTHENTICATED ROLE — scoped by auth.uid()
-- =============================================================================

-- ── users: own record or admin ─────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_users" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_upd_users" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id)');

-- ── contacts: own clients or admin ─────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_contacts" ON public.contacts FOR SELECT TO authenticated USING (public.is_admin() OR account_manager_id = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_ins_contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "auth_upd_contacts" ON public.contacts FOR UPDATE TO authenticated USING (public.is_admin() OR account_manager_id = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_del_contacts" ON public.contacts FOR DELETE TO authenticated USING (public.is_admin())');

-- ── gmail_accounts: own/assigned or admin ──────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_gmail_accounts" ON public.gmail_accounts FOR SELECT TO authenticated USING (public.is_admin() OR user_id = auth.uid() OR id = ANY(public.user_gmail_account_ids()))');
SELECT _temp_exec('CREATE POLICY "auth_upd_gmail_accounts" ON public.gmail_accounts FOR UPDATE TO authenticated USING (public.is_admin() OR user_id = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_del_gmail_accounts" ON public.gmail_accounts FOR DELETE TO authenticated USING (public.is_admin())');

-- ── invitations: admin only (token is sensitive) ───────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_invitations" ON public.invitations FOR SELECT TO authenticated USING (public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_ins_invitations" ON public.invitations FOR INSERT TO authenticated WITH CHECK (public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_upd_invitations" ON public.invitations FOR UPDATE TO authenticated USING (public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_del_invitations" ON public.invitations FOR DELETE TO authenticated USING (public.is_admin())');

-- ── user_gmail_assignments: own or admin ───────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_uga" ON public.user_gmail_assignments FOR SELECT TO authenticated USING (public.is_admin() OR user_id = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_ins_uga" ON public.user_gmail_assignments FOR INSERT TO authenticated WITH CHECK (public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_del_uga" ON public.user_gmail_assignments FOR DELETE TO authenticated USING (public.is_admin())');

-- ── email_threads: via accessible gmail accounts ───────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_email_threads" ON public.email_threads FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.email_messages em WHERE em.thread_id = email_threads.id AND em.gmail_account_id = ANY(public.user_gmail_account_ids())))');

-- ── email_messages: via accessible gmail accounts ──────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_email_messages" ON public.email_messages FOR SELECT TO authenticated USING (public.is_admin() OR gmail_account_id = ANY(public.user_gmail_account_ids()))');
SELECT _temp_exec('CREATE POLICY "auth_upd_email_messages" ON public.email_messages FOR UPDATE TO authenticated USING (public.is_admin() OR gmail_account_id = ANY(public.user_gmail_account_ids()))');
SELECT _temp_exec('CREATE POLICY "auth_del_email_messages" ON public.email_messages FOR DELETE TO authenticated USING (public.is_admin())');

-- ── projects: own or admin ─────────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_projects" ON public.projects FOR SELECT TO authenticated USING (public.is_admin() OR account_manager_id = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_ins_projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "auth_upd_projects" ON public.projects FOR UPDATE TO authenticated USING (public.is_admin() OR account_manager_id = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_del_projects" ON public.projects FOR DELETE TO authenticated USING (public.is_admin())');

-- ── activity_logs: own contacts or admin ───────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_activity_logs" ON public.activity_logs FOR SELECT TO authenticated USING (public.is_admin() OR performed_by = auth.uid() OR EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = activity_logs.contact_id AND c.account_manager_id = auth.uid()))');
SELECT _temp_exec('CREATE POLICY "auth_ins_activity_logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true)');

-- ── ignored_senders: global read, admin modify ─────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_ignored_senders" ON public.ignored_senders FOR SELECT TO authenticated USING (true)');
SELECT _temp_exec('CREATE POLICY "auth_ins_ignored_senders" ON public.ignored_senders FOR INSERT TO authenticated WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "auth_del_ignored_senders" ON public.ignored_senders FOR DELETE TO authenticated USING (public.is_admin())');

-- ── campaigns: own or admin ────────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_campaigns" ON public.campaigns FOR SELECT TO authenticated USING (public.is_admin() OR created_by_id = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_ins_campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "auth_upd_campaigns" ON public.campaigns FOR UPDATE TO authenticated USING (public.is_admin() OR created_by_id = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_del_campaigns" ON public.campaigns FOR DELETE TO authenticated USING (public.is_admin())');

-- ── campaign_steps: via parent campaign ────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_steps" ON public.campaign_steps FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_steps.campaign_id AND c.created_by_id = auth.uid()))');
SELECT _temp_exec('CREATE POLICY "auth_ins_campaign_steps" ON public.campaign_steps FOR INSERT TO authenticated WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "auth_upd_campaign_steps" ON public.campaign_steps FOR UPDATE TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_steps.campaign_id AND c.created_by_id = auth.uid()))');
SELECT _temp_exec('CREATE POLICY "auth_del_campaign_steps" ON public.campaign_steps FOR DELETE TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_steps.campaign_id AND c.created_by_id = auth.uid()))');

-- ── campaign_variants: via parent step → campaign ──────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_variants" ON public.campaign_variants FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.campaign_steps cs JOIN public.campaigns c ON c.id = cs.campaign_id WHERE cs.id = campaign_variants.step_id AND c.created_by_id = auth.uid()))');
SELECT _temp_exec('CREATE POLICY "auth_ins_campaign_variants" ON public.campaign_variants FOR INSERT TO authenticated WITH CHECK (true)');

-- ── campaign_contacts: via parent campaign ─────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_contacts" ON public.campaign_contacts FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_contacts.campaign_id AND c.created_by_id = auth.uid()))');
SELECT _temp_exec('CREATE POLICY "auth_ins_campaign_contacts" ON public.campaign_contacts FOR INSERT TO authenticated WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "auth_upd_campaign_contacts" ON public.campaign_contacts FOR UPDATE TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_contacts.campaign_id AND c.created_by_id = auth.uid()))');

-- ── campaign_emails: via parent campaign ───────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_emails" ON public.campaign_emails FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_emails.campaign_id AND c.created_by_id = auth.uid()))');

-- ── unsubscribes: global read/insert ───────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_unsubscribes" ON public.unsubscribes FOR SELECT TO authenticated USING (true)');
SELECT _temp_exec('CREATE POLICY "auth_ins_unsubscribes" ON public.unsubscribes FOR INSERT TO authenticated WITH CHECK (true)');

-- ── campaign_analytics: via parent campaign ────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_analytics" ON public.campaign_analytics FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_analytics.campaign_id AND c.created_by_id = auth.uid()))');

-- ── webhook_events: admin only ─────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_webhook_events" ON public.webhook_events FOR SELECT TO authenticated USING (public.is_admin())');

-- ── campaign_send_queue: admin only ────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_send_queue" ON public.campaign_send_queue FOR SELECT TO authenticated USING (public.is_admin())');

-- ── email_templates: own + shared or admin ─────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_email_templates" ON public.email_templates FOR SELECT TO authenticated USING (public.is_admin() OR created_by_id = auth.uid() OR is_shared = true)');
SELECT _temp_exec('CREATE POLICY "auth_ins_email_templates" ON public.email_templates FOR INSERT TO authenticated WITH CHECK (created_by_id = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_upd_email_templates" ON public.email_templates FOR UPDATE TO authenticated USING (public.is_admin() OR created_by_id = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_del_email_templates" ON public.email_templates FOR DELETE TO authenticated USING (public.is_admin() OR created_by_id = auth.uid())');

-- ── edit_projects: own or admin ────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_edit_projects" ON public.edit_projects FOR SELECT TO authenticated USING (public.is_admin() OR user_id = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_ins_edit_projects" ON public.edit_projects FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_upd_edit_projects" ON public.edit_projects FOR UPDATE TO authenticated USING (public.is_admin() OR user_id = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_del_edit_projects" ON public.edit_projects FOR DELETE TO authenticated USING (public.is_admin())');

-- ── project_comments: via parent edit_project ──────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_project_comments" ON public.project_comments FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.edit_projects ep WHERE ep.id = project_comments.project_id AND ep.user_id = auth.uid()))');
SELECT _temp_exec('CREATE POLICY "auth_ins_project_comments" ON public.project_comments FOR INSERT TO authenticated WITH CHECK (true)');


-- =============================================================================
-- STEP 5: ANON POLICIES — realtime/polling only
-- =============================================================================

SELECT _temp_exec('CREATE POLICY "anon_sel_email_messages" ON public.email_messages FOR SELECT TO anon USING (true)');
SELECT _temp_exec('CREATE POLICY "anon_sel_gmail_accounts" ON public.gmail_accounts FOR SELECT TO anon USING (true)');


-- =============================================================================
-- STEP 6: CLEANUP temp functions
-- =============================================================================

DROP FUNCTION IF EXISTS _temp_enable_rls(text);
DROP FUNCTION IF EXISTS _temp_exec(text);


-- =============================================================================
-- STEP 7: VERIFICATION
-- =============================================================================

DO $$
DECLARE
    r RECORD;
    total INTEGER := 0;
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
    RAISE NOTICE '  anon:          SELECT on email_messages + gmail_accounts ONLY';
    RAISE NOTICE '  authenticated: Scoped by auth.uid() per table';
    RAISE NOTICE '  service_role:  Explicit bypass on all tables';
END $$;

COMMIT;
