-- =============================================================================
-- UNIBOX — Email Intelligence Layer (contact_insights)
-- =============================================================================
-- See docs/INSIGHTS_LAYER_PLAN.md for the full design.
--
-- One row per (contact, fact_type). Lets us:
--   - Re-extract a single fact when prompts improve, without rewriting others.
--   - Show provenance: which source email this fact came from.
--   - Track confidence — analytics ignore <0.6 by default.
--
-- All statements are idempotent (IF NOT EXISTS). The CONCURRENTLY indexes
-- can't run in a transaction, so this file is intentionally NOT wrapped in
-- BEGIN/COMMIT.
--
-- Run: Supabase Dashboard → SQL Editor → paste & run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.contact_insights (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id      UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    fact_type       TEXT NOT NULL,
    -- value shape varies per fact_type; the TS service-side Zod registry types it.
    -- Examples:
    --   wedding_date  → {"iso":"2026-06-14"}
    --   couple_names  → {"names":["Alex","Sam"]}
    --   location      → {"city":"Austin","region":"TX","country":"US"}
    --   project_type  → {"value":"HIGHLIGHT"}
    --   price_quoted  → {"usd":850,"per":"package"}
    --   source_channel→ {"value":"UPWORK"}
    --   delivery_date → {"iso":"2026-07-02"}
    --   outcome       → {"value":"WON"}
    value           JSONB NOT NULL,
    confidence      REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    source_email_id TEXT REFERENCES public.email_messages(id) ON DELETE SET NULL,
    extracted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    model_version   TEXT NOT NULL DEFAULT 'groq-llama-3.1-8b@v1',

    -- One fact_type per contact. New extractions UPSERT (and the service prefers
    -- higher-confidence + newer-model results when conflicting).
    UNIQUE (contact_id, fact_type)
);

-- Hot-path indexes: every dashboard / inbox query filters by fact_type and
-- joins back via contact_id. Confidence-floor queries are common enough to
-- earn a partial index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_insights_fact_contact
    ON public.contact_insights (fact_type, contact_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_insights_high_confidence
    ON public.contact_insights (fact_type, contact_id)
    WHERE confidence >= 0.6;

-- Lets the extractor find "what's the latest extraction we've done for this
-- contact" without scanning all of contact_insights.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_insights_contact_extracted_at
    ON public.contact_insights (contact_id, extracted_at DESC);

-- Track per-contact extraction state so the cron knows what's stale.
ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS insights_extracted_at TIMESTAMPTZ;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_insights_extracted_at
    ON public.contacts (insights_extracted_at NULLS FIRST);

-- =============================================================================
-- Verify after running:
--   SELECT count(*) FROM contact_insights;       -- expect 0 right after migration
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'contact_insights' ORDER BY ordinal_position;
-- =============================================================================
