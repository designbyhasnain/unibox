-- Phase-B goal persistence: `goals` table + campaign linkage.
--
-- Today the Goal Planner returns a computed plan with no persistence layer —
-- close the tab and the $10K target is gone. This migration persists the goal
-- at "Fire" time (set in `fireGoalPlanAction`) and stamps every materialised
-- campaign with `goal_id` so a single goal owns its fired campaigns. The
-- dashboard `<GoalProgressCard />` reads from these tables.
--
-- Idempotent — safe to re-run. Reversible via DROP TABLE + ALTER DROP COLUMN.
--
-- Run via Supabase Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS public.goals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    target_amount   NUMERIC(10, 2) NOT NULL CHECK (target_amount > 0),
    deadline        DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'ACHIEVED', 'EXPIRED', 'CANCELLED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    achieved_at     TIMESTAMPTZ NULL
);

-- One active goal per user — close the previous before opening a new one.
-- The partial unique index is the cheap enforcement: ACHIEVED / EXPIRED /
-- CANCELLED rows are excluded from the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS uq_goals_one_active_per_user
    ON public.goals (user_id)
    WHERE status = 'ACTIVE';

-- Used by the expire-goals cron to sweep ACTIVE goals whose deadline passed.
CREATE INDEX IF NOT EXISTS idx_goals_active_deadline
    ON public.goals (deadline)
    WHERE status = 'ACTIVE';

-- Link campaigns to the goal that materialised them. Nullable because
-- campaigns can be created manually (outside the Goal Planner) and those
-- should keep working with goal_id NULL.
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS goal_id UUID NULL REFERENCES public.goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_goal_id
    ON public.campaigns (goal_id)
    WHERE goal_id IS NOT NULL;

-- PostgREST schema cache reload so the new column / table are queryable
-- without a restart. Harmless if the role doesn't have this notify privilege.
NOTIFY pgrst, 'reload schema';
