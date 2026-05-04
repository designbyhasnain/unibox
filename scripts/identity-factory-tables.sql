-- Identity Factory tracking columns
-- Idempotent — safe to re-run. Paste into Supabase SQL editor.
--
-- Adds two timestamp columns to gmail_accounts so the /identity-factory
-- dashboard can persistently track which accounts have had:
--   1. A Google account registered for them (via Turbo Register magic URL)
--   2. A Gravatar profile linked to their image
--
-- Stored as TIMESTAMPTZ (NULL = not done yet, value = when admin marked done)
-- instead of plain BOOLEAN — gives a free audit trail.

ALTER TABLE gmail_accounts
    ADD COLUMN IF NOT EXISTS identity_google_registered_at TIMESTAMPTZ NULL;

ALTER TABLE gmail_accounts
    ADD COLUMN IF NOT EXISTS identity_gravatar_claimed_at TIMESTAMPTZ NULL;

-- Optional index for filtering "pending" accounts on the dashboard.
CREATE INDEX IF NOT EXISTS idx_gmail_accounts_identity_pending
    ON gmail_accounts (identity_google_registered_at, identity_gravatar_claimed_at);
