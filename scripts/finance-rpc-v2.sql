-- Phase 7 Speed Sprint — /finance RPC v2.
-- Replaces get_finance_summary which was scanning `projects` 5+ separate
-- times and timing out at 120s. v2 reads the table once into a CTE,
-- derives all aggregates from it, and caps the `outstanding` list at
-- the 50 oldest unpaid (the UI doesn't need 839+).
--
-- Idempotent: CREATE OR REPLACE. Apply via Supabase SQL editor or
-- node scripts/apply-rpc.mjs (which we'll add for Phase 7).

create or replace function public.get_finance_summary(
    p_start timestamptz,
    p_end timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with
    -- Single scan of projects in the date range. Subsequent CTEs derive
    -- everything from this — no further scans of the projects table.
    in_range as (
        select id, project_name, project_value, paid_status, account_manager_id,
               client_id, created_at, due_date
        from projects
        where created_at >= p_start and created_at <= p_end
    ),
    by_month as (
        select to_char(created_at, 'YYYY-MM') as m,
               sum(project_value) as r,
               sum(case when paid_status = 'PAID' then project_value else 0 end) as p
        from in_range group by 1
    ),
    by_agent as (
        select coalesce(u.name, 'Unassigned') as n,
               sum(p.project_value) as r,
               count(*) as c
        from in_range p left join users u on u.id = p.account_manager_id
        group by u.name
    ),
    -- Top 50 oldest-unpaid in the date range. The full list of 839+ was
    -- never useful in the UI; the table only renders the recent ones.
    outstanding_50 as (
        select p.project_name, c.name as client_name, p.project_value,
               p.due_date,
               greatest(0, extract(day from now() - p.due_date)::int) as days_overdue
        from in_range p left join contacts c on c.id = p.client_id
        where p.paid_status <> 'PAID'
        order by p.due_date asc nulls last
        limit 50
    ),
    -- Aging is computed against ALL projects regardless of date range
    -- (matches v1 behavior — the cards show absolute counts).
    aging as (
        select
            count(*) filter (where paid_status <> 'PAID' and due_date >= now() - interval '7 days') as current,
            count(*) filter (where paid_status <> 'PAID' and due_date <  now() - interval '7 days' and due_date >= now() - interval '30 days') as days8to30,
            count(*) filter (where paid_status <> 'PAID' and due_date <  now() - interval '30 days') as days30plus
        from projects
    ),
    totals as (
        select
            coalesce(sum(project_value), 0) as total_revenue,
            coalesce(sum(case when paid_status = 'PAID' then project_value else 0 end), 0) as paid_revenue,
            coalesce(sum(case when paid_status = 'UNPAID' then project_value else 0 end), 0) as unpaid_revenue,
            coalesce(sum(case when paid_status = 'PARTIALLY_PAID' then project_value else 0 end), 0) as partial_revenue,
            count(*) as total_projects,
            sum(case when paid_status = 'PAID' then 1 else 0 end) as paid_count,
            sum(case when paid_status = 'UNPAID' then 1 else 0 end) as unpaid_count,
            sum(case when paid_status = 'PARTIALLY_PAID' then 1 else 0 end) as partial_count,
            case when count(*) > 0 then round(avg(coalesce(project_value, 0))::numeric, 2) else 0 end as avg_deal_size
        from in_range
    )
    select jsonb_build_object(
        'totalRevenue', t.total_revenue,
        'paidRevenue', t.paid_revenue,
        'unpaidRevenue', t.unpaid_revenue,
        'partialRevenue', t.partial_revenue,
        'totalProjects', t.total_projects,
        'paidCount', t.paid_count,
        'unpaidCount', t.unpaid_count,
        'partialCount', t.partial_count,
        'avgDealSize', t.avg_deal_size,
        'revenueByMonth', coalesce(
            (select jsonb_agg(jsonb_build_object('month', m, 'revenue', r, 'paid', p) order by m) from by_month),
            '[]'::jsonb
        ),
        'revenueByAgent', coalesce(
            (select jsonb_agg(jsonb_build_object('name', n, 'revenue', r, 'projects', c) order by r desc) from by_agent),
            '[]'::jsonb
        ),
        'outstanding', coalesce(
            (select jsonb_agg(jsonb_build_object(
                'projectName', project_name,
                'clientName', client_name,
                'value', project_value,
                'dueDate', due_date,
                'daysOverdue', days_overdue
            ) order by due_date) from outstanding_50),
            '[]'::jsonb
        ),
        'aging', (select jsonb_build_object(
            'current', current,
            'days8to30', days8to30,
            'days30plus', days30plus
        ) from aging)
    )
    from totals t;
$$;

grant execute on function public.get_finance_summary(timestamptz, timestamptz)
    to anon, authenticated, service_role;
