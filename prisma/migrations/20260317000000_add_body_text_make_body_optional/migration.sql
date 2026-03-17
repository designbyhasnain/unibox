-- Migration: add_body_text_make_body_optional
-- Makes body nullable and adds body_text column to email_messages

-- AlterTable: make body nullable
ALTER TABLE "email_messages" ALTER COLUMN "body" DROP NOT NULL;

-- AlterTable: add body_text column (plain text excerpt for search)
ALTER TABLE "email_messages" ADD COLUMN "body_text" TEXT;

-- Trigram indexes for fast ILIKE search on key text fields
CREATE INDEX IF NOT EXISTS idx_email_messages_subject_trgm ON email_messages USING gin (subject gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_email_messages_snippet_trgm ON email_messages USING gin (snippet gin_trgm_ops);

-- Drop redundant indexes covered by broader composites
DROP INDEX IF EXISTS idx_email_messages_tracking_id;
DROP INDEX IF EXISTS idx_email_messages_thread;
DROP INDEX IF EXISTS idx_email_messages_gmail_account;
DROP INDEX IF EXISTS idx_email_messages_is_unread;
