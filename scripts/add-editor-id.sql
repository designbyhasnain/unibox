-- Adds `editor_id` to edit_projects with FK to users.id.
-- Idempotent — safe to re-run.
--
-- HOW TO APPLY: paste into the Supabase SQL editor (Project → SQL → New query).
-- The Prisma CLI cannot apply this directly while the .env DB password is stale
-- (CLAUDE.md, "Build 2026-04-25" — same blocker as scripts/create-jarvis-tables.mjs
-- and scripts/add-last-cut-url.sql).

-- 1. Column.
ALTER TABLE edit_projects
    ADD COLUMN IF NOT EXISTS editor_id UUID;

-- 2. FK to users.id with SetNull on user delete (matches Prisma's onDelete: SetNull).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'edit_projects_editor_id_fkey'
    ) THEN
        ALTER TABLE edit_projects
            ADD CONSTRAINT edit_projects_editor_id_fkey
            FOREIGN KEY (editor_id) REFERENCES users (id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Index for the editor-facing queries.
CREATE INDEX IF NOT EXISTS edit_projects_editor_id_idx
    ON edit_projects (editor_id);
