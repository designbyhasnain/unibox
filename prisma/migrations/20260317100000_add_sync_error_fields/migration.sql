ALTER TABLE "gmail_accounts" ADD COLUMN IF NOT EXISTS "last_error_message" TEXT;
ALTER TABLE "gmail_accounts" ADD COLUMN IF NOT EXISTS "last_error_at" TIMESTAMPTZ;
ALTER TABLE "gmail_accounts" ADD COLUMN IF NOT EXISTS "sync_fail_count" INTEGER NOT NULL DEFAULT 0;
