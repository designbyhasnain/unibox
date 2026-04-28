-- Adds `last_cut_url` to edit_projects for the Upload Cut flow.
-- Idempotent — safe to re-run.
--
-- HOW TO APPLY: paste into the Supabase SQL editor (Project → SQL → New query).
-- The Prisma CLI cannot apply this directly while the .env DB password is stale
-- (see CLAUDE.md "Build 2026-04-25" note about scripts/create-jarvis-tables.mjs).

ALTER TABLE edit_projects
    ADD COLUMN IF NOT EXISTS last_cut_url TEXT;

-- Optional: backfill from an older free-form column if you were stuffing cut
-- URLs into raw_data_url. Uncomment if you want to sweep them over.
-- UPDATE edit_projects
--    SET last_cut_url = raw_data_url
--  WHERE last_cut_url IS NULL
--    AND raw_data_url ILIKE 'http%';
