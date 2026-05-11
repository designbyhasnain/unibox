-- Phase-C ambient lead supply: schema additions for lookalike sourcing
-- from Google Places + Instagram filtering.
--
-- All changes are ADDITIVE — no existing rows or columns are altered.
-- Reversible via DROP COLUMN / DROP TABLE / DROP INDEX.
-- Run via Supabase Dashboard → SQL Editor.

-- ── contacts: lookalike provenance ──────────────────────────────────────────
-- New columns capture where a contact came from and the metadata we use
-- to dedupe / filter. NULL for every existing contact; only sourced rows
-- carry values.
ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS place_id TEXT,
    ADD COLUMN IF NOT EXISTS lookalike_score NUMERIC(3,2),
    ADD COLUMN IF NOT EXISTS instagram_username TEXT,
    ADD COLUMN IF NOT EXISTS instagram_followers INT,
    ADD COLUMN IF NOT EXISTS last_instagram_post_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS source_query TEXT;

-- Partial unique index — Google's place_id is stable; we never want two
-- contacts pointing at the same Google business. NULL rows (the vast
-- majority — every contact that came in pre-Phase-C) stay out of the
-- index so it remains cheap to maintain.
CREATE UNIQUE INDEX IF NOT EXISTS contacts_place_id_unique
    ON public.contacts (place_id)
    WHERE place_id IS NOT NULL;

-- ── external_api_usage: daily spend ledger ──────────────────────────────────
-- One row per (api, day). Atomically incremented by the sourcing engine
-- before each external call; if a row hits its cap, the engine bails
-- before spending money. Lets ops set per-day budgets without a
-- redeploy via env vars (LOOKALIKE_DAILY_PLACES_CAP etc.).
CREATE TABLE IF NOT EXISTS public.external_api_usage (
    api TEXT NOT NULL,                           -- 'google_places' | 'rapidapi_instagram'
    day DATE NOT NULL,                           -- UTC day
    calls_used INT NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (api, day)
);

-- PostgREST schema cache reload so the new columns + table are queryable
-- without a backend restart. Harmless if the role lacks the privilege.
NOTIFY pgrst, 'reload schema';
