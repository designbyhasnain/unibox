-- Phase-2 ambient coach: split the contact stage into AI-owned (pipeline_stage)
-- and human-owned (pipeline_stage_override) columns. The UI prefers the
-- override when set, falls back to the AI-inferred stage from the
-- `contact_insights` table, and finally falls back to `pipeline_stage` for
-- contacts the AI hasn't seen yet. Idempotent — safe to re-run.
--
-- Run via Supabase Dashboard → SQL Editor.

ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS pipeline_stage_override TEXT NULL;

-- Partial index — covers the small set of rows where a human has actually
-- expressed an opinion. NULL rows (the vast majority) stay out of the index
-- so it stays cheap to maintain.
CREATE INDEX IF NOT EXISTS idx_contacts_stage_override
    ON public.contacts (pipeline_stage_override)
    WHERE pipeline_stage_override IS NOT NULL;

-- PostgREST schema cache reload so the new column is queryable without a
-- restart. Harmless if the role already has this notify privilege.
NOTIFY pgrst, 'reload schema';
