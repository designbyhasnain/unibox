# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (Next.js 16 with Turbopack)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint via next lint
npx prisma generate  # Regenerate Prisma client (also runs on postinstall)
npx prisma migrate dev --name <name>  # Create and apply a migration
npx prisma db push   # Push schema changes without migration (dev only)
```

## Architecture

**Stack:** Next.js 16 (App Router) + React 19 + Prisma + Supabase (PostgreSQL) + Google APIs

Unibox is a **multi-account email CRM** for video production. It manages Gmail and manual IMAP/SMTP accounts, syncs emails, tracks leads through a pipeline, and provides email open/click analytics.

### Key Layers

- **`app/`** — Next.js App Router. Pages (`page.tsx`), API routes (`app/api/`), components, hooks, and context.
- **`src/actions/`** — Server Actions for all database mutations (emails, accounts, contacts, projects, analytics).
- **`src/services/`** — Business logic: Gmail sync (`gmailSyncService.ts`), email sending (`gmailSenderService.ts`, `manualEmailService.ts`), OAuth (`googleAuthService.ts`), tracking pixel injection (`trackingService.ts`), pipeline state machine (`pipelineLogic.ts`).
- **`src/lib/`** — Supabase clients: `supabase.ts` (server, service role) and `supabase-client.ts` (browser, anon key).
- **`prisma/schema.prisma`** — All models use `@@map()` for snake_case table/column names. Core models: User, Contact, GmailAccount, EmailThread, EmailMessage, Project, ActivityLog.

### Email Sync Strategy

Three sync modes, all in `gmailSyncService.ts`:
1. **Push (webhook):** Google Pub/Sub → `app/api/webhooks/gmail/route.ts` for real-time new emails.
2. **History-based:** Incremental sync using Gmail `historyId` for efficient delta updates.
3. **Full sync:** Background reconciliation of all messages.

Manual (non-Gmail) accounts use IMAP via `imapflow` in `manualEmailService.ts`.

### Dual Connection Methods

- **OAuth:** Gmail API with encrypted refresh tokens (AES-256-GCM via `src/utils/encryption.ts`, key from `ENCRYPTION_KEY` env var).
- **Manual:** IMAP/SMTP with app passwords for non-Gmail providers.

### Email Tracking

`trackingService.ts` injects a 1x1 tracking pixel and rewrites links before sending. Tracking events are handled by `app/api/track/` routes. Owner session detection (`OwnerSessionTracker` component) filters out self-opens.

### State Management

- **FilterContext** (`app/context/FilterContext.tsx`): Global account selection and date range filters, persisted to localStorage.
- **useMailbox** (`app/hooks/useMailbox.ts`): Email list state with localStorage + memory cache, polling refresh.
- **useRealtimeInbox** (`src/hooks/useRealtimeInbox.ts`): Optional Supabase real-time subscriptions.

### Pipeline

Leads flow through stages: `COLD_LEAD → LEAD → OFFER_ACCEPTED → CLOSED` (plus `NOT_INTERESTED`). Stage definitions and colors are in `app/constants/stages.ts`.

## Database

PostgreSQL via Supabase. Uses two connection strings:
- `DATABASE_URL` — Pooled (PgBouncer) for runtime queries
- `DIRECT_URL` — Direct for Prisma migrations

Key performance indexes are on `(gmailAccountId, direction, sentAt DESC)` for inbox queries and `(threadId)` for thread lookups.

## Environment

Copy `.env.example` to `.env`. Critical secrets: `ENCRYPTION_KEY` (64-char hex), `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`. See `.env.example` for full documentation.

## Deployment

Vercel. Production `console.log` calls are stripped (except error/warn) via `next.config.js` compiler settings. Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy) are applied to all routes.
