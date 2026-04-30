-- Dashboard performance migration — apply via Supabase SQL editor.
-- Idempotent: safe to re-run.
--
-- 1. get_pipeline_counts RPC: replaces the 7 head:true count queries
--    that getSalesDashboardAction was firing one-per-stage. Single
--    GROUP BY plan, ~250-400ms saved per dashboard load.
-- 2. Indexes flagged in docs/AUDIT-2026-04-30-GRAND-DISCOVERY.md §4
--    (Schema gaps): pipeline_stage on contacts (covers the GROUP BY
--    above), (account_manager_id, pipeline_stage) for SALES-scoped
--    dashboard, (paid_status, project_date) for finance + intelligence,
--    (contact_id, created_at desc) on activity_logs for ownership-history,
--    (user_id, due_date) on edit_projects for editor briefing.
--
-- The application code falls back to per-stage counts (parallelised via
-- Promise.all) if the RPC isn't deployed yet, so this migration is
-- non-blocking — but the dashboard will be visibly snappier once it lands.

-- ─── 1. get_pipeline_counts RPC ─────────────────────────────────────────────

create or replace function public.get_pipeline_counts(p_user_id uuid default null)
returns table (pipeline_stage text, count bigint)
language sql
stable
security definer
set search_path = public
as $$
    select c.pipeline_stage::text, count(*)::bigint
    from contacts c
    where c.pipeline_stage is not null
      and (p_user_id is null or c.account_manager_id = p_user_id)
    group by c.pipeline_stage;
$$;

-- Allow service-role + anon to call. Tighten later if you adopt RLS.
grant execute on function public.get_pipeline_counts(uuid) to anon, authenticated, service_role;

-- ─── 2. Missing indexes (CONCURRENTLY = no exclusive lock) ──────────────────
-- Note: CREATE INDEX CONCURRENTLY can't run inside a transaction block; if
-- your tool wraps the file in a tx, run these one at a time interactively.

create index concurrently if not exists contacts_pipeline_stage_idx
    on public.contacts (pipeline_stage);

create index concurrently if not exists contacts_am_pipeline_idx
    on public.contacts (account_manager_id, pipeline_stage);

create index concurrently if not exists projects_paid_status_date_idx
    on public.projects (paid_status, project_date desc);

create index concurrently if not exists activity_logs_contact_created_idx
    on public.activity_logs (contact_id, created_at desc);

create index concurrently if not exists edit_projects_user_due_idx
    on public.edit_projects (user_id, due_date);

-- Optional: contacts.last_email_at is already indexed; verify with:
--   select indexname from pg_indexes where tablename = 'contacts';
