-- =============================================================================
-- UNIBOX — Row Level Security (RLS) Migration — Defense-in-Depth
-- =============================================================================
-- Table names: snake_case from Prisma @@map() — these are the ACTUAL SQL names.
-- Column types: id columns are uuid, FK columns (user_id etc.) are text.
-- auth.uid() returns uuid, so FK columns need ::uuid cast.
-- =============================================================================

BEGIN;

-- Safe executor: skips if table doesn't exist
CREATE OR REPLACE FUNCTION _temp_exec(sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipped (table missing): %', left(sql, 80);
END; $$;

CREATE OR REPLACE FUNCTION _temp_rls(tbl text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipped RLS enable (table missing): %', tbl;
END; $$;


-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
          AND role IN ('ADMIN')
    );
$$;

-- Returns uuid[] of gmail account IDs the user can access
CREATE OR REPLACE FUNCTION public.user_gmail_account_ids()
RETURNS uuid[] LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT CASE
        WHEN public.is_admin() THEN
            ARRAY(SELECT id FROM public.gmail_accounts)
        ELSE
            ARRAY(
                SELECT gmail_account_id::uuid
                FROM public.user_gmail_assignments
                WHERE user_id::uuid = auth.uid()
            )
    END;
$$;


-- =============================================================================
-- ENABLE RLS ON ALL TABLES
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
-- SERVICE_ROLE BYPASS (explicit on every table)
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
-- AUTHENTICATED POLICIES (scoped by auth.uid())
-- =============================================================================
-- Column type key:
--   id columns      = uuid   → compare directly: id = auth.uid()
--   FK/ref columns  = text   → cast needed: column::uuid = auth.uid()
-- =============================================================================

-- ── users ──────────────────────────────────────────────────────────────────
-- id is uuid
SELECT _temp_exec('CREATE POLICY "auth_sel_users" ON public.users FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_upd_users" ON public.users FOR UPDATE TO authenticated
    USING (id = auth.uid()) WITH CHECK (id = auth.uid())');

-- ── contacts ───────────────────────────────────────────────────────────────
-- account_manager_id is text
SELECT _temp_exec('CREATE POLICY "auth_sel_contacts" ON public.contacts FOR SELECT TO authenticated
    USING (public.is_admin() OR account_manager_id::uuid = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_ins_contacts" ON public.contacts FOR INSERT TO authenticated
    WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "auth_upd_contacts" ON public.contacts FOR UPDATE TO authenticated
    USING (public.is_admin() OR account_manager_id::uuid = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_del_contacts" ON public.contacts FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── gmail_accounts ─────────────────────────────────────────────────────────
-- user_id is text, id is uuid
SELECT _temp_exec('CREATE POLICY "auth_sel_gmail_accounts" ON public.gmail_accounts FOR SELECT TO authenticated
    USING (public.is_admin() OR user_id::uuid = auth.uid() OR id = ANY(public.user_gmail_account_ids()))');
SELECT _temp_exec('CREATE POLICY "auth_upd_gmail_accounts" ON public.gmail_accounts FOR UPDATE TO authenticated
    USING (public.is_admin() OR user_id::uuid = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_del_gmail_accounts" ON public.gmail_accounts FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── invitations ────────────────────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_invitations" ON public.invitations FOR SELECT TO authenticated
    USING (public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_ins_invitations" ON public.invitations FOR INSERT TO authenticated
    WITH CHECK (public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_upd_invitations" ON public.invitations FOR UPDATE TO authenticated
    USING (public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_del_invitations" ON public.invitations FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── user_gmail_assignments ─────────────────────────────────────────────────
-- user_id is text
SELECT _temp_exec('CREATE POLICY "auth_sel_uga" ON public.user_gmail_assignments FOR SELECT TO authenticated
    USING (public.is_admin() OR user_id::uuid = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_ins_uga" ON public.user_gmail_assignments FOR INSERT TO authenticated
    WITH CHECK (public.is_admin())');
SELECT _temp_exec('CREATE POLICY "auth_del_uga" ON public.user_gmail_assignments FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── email_threads ──────────────────────────────────────────────────────────
-- thread_id in email_messages is text, gmail_account_id is text
SELECT _temp_exec('CREATE POLICY "auth_sel_email_threads" ON public.email_threads FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.email_messages em
        WHERE em.thread_id = email_threads.id
          AND em.gmail_account_id::uuid = ANY(public.user_gmail_account_ids())
    ))');

-- ── email_messages ─────────────────────────────────────────────────────────
-- gmail_account_id is text
SELECT _temp_exec('CREATE POLICY "auth_sel_email_messages" ON public.email_messages FOR SELECT TO authenticated
    USING (public.is_admin() OR gmail_account_id::uuid = ANY(public.user_gmail_account_ids()))');
SELECT _temp_exec('CREATE POLICY "auth_upd_email_messages" ON public.email_messages FOR UPDATE TO authenticated
    USING (public.is_admin() OR gmail_account_id::uuid = ANY(public.user_gmail_account_ids()))');
SELECT _temp_exec('CREATE POLICY "auth_del_email_messages" ON public.email_messages FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── projects ───────────────────────────────────────────────────────────────
-- account_manager_id is text
SELECT _temp_exec('CREATE POLICY "auth_sel_projects" ON public.projects FOR SELECT TO authenticated
    USING (public.is_admin() OR account_manager_id::uuid = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_ins_projects" ON public.projects FOR INSERT TO authenticated
    WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "auth_upd_projects" ON public.projects FOR UPDATE TO authenticated
    USING (public.is_admin() OR account_manager_id::uuid = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_del_projects" ON public.projects FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── activity_logs ──────────────────────────────────────────────────────────
-- performed_by is text, contact_id is text
SELECT _temp_exec('CREATE POLICY "auth_sel_activity_logs" ON public.activity_logs FOR SELECT TO authenticated
    USING (public.is_admin() OR performed_by::uuid = auth.uid() OR EXISTS (
        SELECT 1 FROM public.contacts c
        WHERE c.id = activity_logs.contact_id::uuid
          AND c.account_manager_id::uuid = auth.uid()
    ))');
SELECT _temp_exec('CREATE POLICY "auth_ins_activity_logs" ON public.activity_logs FOR INSERT TO authenticated
    WITH CHECK (true)');

-- ── ignored_senders ────────────────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_ignored_senders" ON public.ignored_senders FOR SELECT TO authenticated
    USING (true)');
SELECT _temp_exec('CREATE POLICY "auth_ins_ignored_senders" ON public.ignored_senders FOR INSERT TO authenticated
    WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "auth_del_ignored_senders" ON public.ignored_senders FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── campaigns ──────────────────────────────────────────────────────────────
-- created_by_id is text
SELECT _temp_exec('CREATE POLICY "auth_sel_campaigns" ON public.campaigns FOR SELECT TO authenticated
    USING (public.is_admin() OR created_by_id::uuid = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_ins_campaigns" ON public.campaigns FOR INSERT TO authenticated
    WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "auth_upd_campaigns" ON public.campaigns FOR UPDATE TO authenticated
    USING (public.is_admin() OR created_by_id::uuid = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_del_campaigns" ON public.campaigns FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── campaign_steps ─────────────────────────────────────────────────────────
-- campaign_id is text, created_by_id on campaigns is text
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_steps" ON public.campaign_steps FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = campaign_steps.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()
    ))');
SELECT _temp_exec('CREATE POLICY "auth_ins_campaign_steps" ON public.campaign_steps FOR INSERT TO authenticated
    WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "auth_upd_campaign_steps" ON public.campaign_steps FOR UPDATE TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = campaign_steps.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()
    ))');
SELECT _temp_exec('CREATE POLICY "auth_del_campaign_steps" ON public.campaign_steps FOR DELETE TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = campaign_steps.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()
    ))');

-- ── campaign_variants ──────────────────────────────────────────────────────
-- step_id is text
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_variants" ON public.campaign_variants FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaign_steps cs
        JOIN public.campaigns c ON c.id = cs.campaign_id::uuid
        WHERE cs.id = campaign_variants.step_id::uuid
          AND c.created_by_id::uuid = auth.uid()
    ))');
SELECT _temp_exec('CREATE POLICY "auth_ins_campaign_variants" ON public.campaign_variants FOR INSERT TO authenticated
    WITH CHECK (true)');

-- ── campaign_contacts ──────────────────────────────────────────────────────
-- campaign_id is text
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_contacts" ON public.campaign_contacts FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = campaign_contacts.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()
    ))');
SELECT _temp_exec('CREATE POLICY "auth_ins_campaign_contacts" ON public.campaign_contacts FOR INSERT TO authenticated
    WITH CHECK (true)');
SELECT _temp_exec('CREATE POLICY "auth_upd_campaign_contacts" ON public.campaign_contacts FOR UPDATE TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = campaign_contacts.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()
    ))');

-- ── campaign_emails ────────────────────────────────────────────────────────
-- campaign_id is text
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_emails" ON public.campaign_emails FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = campaign_emails.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()
    ))');

-- ── unsubscribes ───────────────────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_unsubscribes" ON public.unsubscribes FOR SELECT TO authenticated
    USING (true)');
SELECT _temp_exec('CREATE POLICY "auth_ins_unsubscribes" ON public.unsubscribes FOR INSERT TO authenticated
    WITH CHECK (true)');

-- ── campaign_analytics ─────────────────────────────────────────────────────
-- campaign_id is text
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_analytics" ON public.campaign_analytics FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = campaign_analytics.campaign_id::uuid
          AND c.created_by_id::uuid = auth.uid()
    ))');

-- ── webhook_events: admin only ─────────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_webhook_events" ON public.webhook_events FOR SELECT TO authenticated
    USING (public.is_admin())');

-- ── campaign_send_queue: admin only ────────────────────────────────────────
SELECT _temp_exec('CREATE POLICY "auth_sel_campaign_send_queue" ON public.campaign_send_queue FOR SELECT TO authenticated
    USING (public.is_admin())');

-- ── email_templates ────────────────────────────────────────────────────────
-- created_by_id is text
SELECT _temp_exec('CREATE POLICY "auth_sel_email_templates" ON public.email_templates FOR SELECT TO authenticated
    USING (public.is_admin() OR created_by_id::uuid = auth.uid() OR is_shared = true)');
SELECT _temp_exec('CREATE POLICY "auth_ins_email_templates" ON public.email_templates FOR INSERT TO authenticated
    WITH CHECK (created_by_id::uuid = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_upd_email_templates" ON public.email_templates FOR UPDATE TO authenticated
    USING (public.is_admin() OR created_by_id::uuid = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_del_email_templates" ON public.email_templates FOR DELETE TO authenticated
    USING (public.is_admin() OR created_by_id::uuid = auth.uid())');

-- ── edit_projects ──────────────────────────────────────────────────────────
-- user_id is text
SELECT _temp_exec('CREATE POLICY "auth_sel_edit_projects" ON public.edit_projects FOR SELECT TO authenticated
    USING (public.is_admin() OR user_id::uuid = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_ins_edit_projects" ON public.edit_projects FOR INSERT TO authenticated
    WITH CHECK (user_id::uuid = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_upd_edit_projects" ON public.edit_projects FOR UPDATE TO authenticated
    USING (public.is_admin() OR user_id::uuid = auth.uid())');
SELECT _temp_exec('CREATE POLICY "auth_del_edit_projects" ON public.edit_projects FOR DELETE TO authenticated
    USING (public.is_admin())');

-- ── project_comments ───────────────────────────────────────────────────────
-- project_id is text, user_id on edit_projects is text
SELECT _temp_exec('CREATE POLICY "auth_sel_project_comments" ON public.project_comments FOR SELECT TO authenticated
    USING (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.edit_projects ep
        WHERE ep.id = project_comments.project_id::uuid
          AND ep.user_id::uuid = auth.uid()
    ))');
SELECT _temp_exec('CREATE POLICY "auth_ins_project_comments" ON public.project_comments FOR INSERT TO authenticated
    WITH CHECK (true)');


-- =============================================================================
-- ANON POLICIES — realtime/polling only
-- =============================================================================

SELECT _temp_exec('CREATE POLICY "anon_sel_email_messages" ON public.email_messages FOR SELECT TO anon USING (true)');
SELECT _temp_exec('CREATE POLICY "anon_sel_gmail_accounts" ON public.gmail_accounts FOR SELECT TO anon USING (true)');


-- =============================================================================
-- CLEANUP
-- =============================================================================

DROP FUNCTION IF EXISTS _temp_exec(text);
DROP FUNCTION IF EXISTS _temp_rls(text);


-- =============================================================================
-- VERIFICATION
-- =============================================================================

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
    RAISE NOTICE '';
    RAISE NOTICE '  TOTAL: % policies', total;
    RAISE NOTICE '';
    RAISE NOTICE '  anon:          SELECT on email_messages + gmail_accounts ONLY';
    RAISE NOTICE '  authenticated: Scoped — FK columns cast with ::uuid';
    RAISE NOTICE '  service_role:  Explicit bypass on all tables';
END $$;

COMMIT;
