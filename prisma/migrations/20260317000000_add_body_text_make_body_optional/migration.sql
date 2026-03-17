-- Migration: add_body_text_make_body_optional
-- Makes body nullable and adds body_text column to email_messages

-- AlterTable: make body nullable
ALTER TABLE "email_messages" ALTER COLUMN "body" DROP NOT NULL;

-- AlterTable: add body_text column (plain text excerpt for search)
ALTER TABLE "email_messages" ADD COLUMN "body_text" TEXT;
