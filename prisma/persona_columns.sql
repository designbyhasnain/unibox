-- Add persona columns to gmail_accounts. Idempotent.
ALTER TABLE gmail_accounts
    ADD COLUMN IF NOT EXISTS display_name TEXT NULL;

ALTER TABLE gmail_accounts
    ADD COLUMN IF NOT EXISTS profile_image TEXT NULL;
