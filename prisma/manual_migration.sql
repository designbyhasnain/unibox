-- Manual SQL migration for Gmail Account Management feature
-- Run this against your PostgreSQL database (template1)
-- if Prisma's local proxy (ports 51213/51214) is not running.

-- 1. Create the ConnectionMethod enum type
DO $$ BEGIN
    CREATE TYPE "ConnectionMethod" AS ENUM ('OAUTH', 'MANUAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add SYNCING to GmailAccountStatus enum
DO $$ BEGIN
    ALTER TYPE "GmailAccountStatus" ADD VALUE IF NOT EXISTS 'SYNCING';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Add new columns to GmailAccount table
ALTER TABLE "GmailAccount"
    ADD COLUMN IF NOT EXISTS "connectionMethod" "ConnectionMethod" NOT NULL DEFAULT 'OAUTH',
    ADD COLUMN IF NOT EXISTS "appPassword" TEXT;

-- 4. Add Notion-style client fields to contacts table
ALTER TABLE "contacts"
    ADD COLUMN IF NOT EXISTS "company" TEXT,
    ADD COLUMN IF NOT EXISTS "phone" TEXT,
    ADD COLUMN IF NOT EXISTS "priority" "priority_level",
    ADD COLUMN IF NOT EXISTS "estimated_value" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "expected_close_date" TIMESTAMPTZ;
