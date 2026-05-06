# CLAUDE.md — Unibox Working Rules

> **This file is for Claude's behavior on this repo.** Architecture and full inventories live in [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md). Build journal and per-change rationale lives in [`CHANGES.md`](CHANGES.md). When you need facts about routes, models, services, integrations, or env vars — **read `PROJECT_OVERVIEW.md` first**.

---

## Read This Every Session

You are the sole developer on this project. Never ask the user where to push, deploy, or which service to use. All URLs are below. When the user says **"live karo"**, **"deploy karo"**, **"push karo"**, or **"update karo"** — follow the deploy steps without asking.

### Deploy Steps (in order)

1. `npx tsc --noEmit` — fix any TypeScript errors first
2. `npm run lint` — fix any lint errors
3. `npm run build` — fix any build errors
4. `git add <specific files>` — never `git add .`
5. `git commit -m "describe what changed"`
6. `git push origin main`
7. Vercel auto-deploys
8. Tell user: "Live ho gaya → https://txb-unibox.vercel.app"

### Live Service URLs

- GitHub: https://github.com/designbyhasnain/unibox
- Vercel Live: https://txb-unibox.vercel.app
- Vercel Dashboard: https://vercel.com/designsbyhasnain-6046s-projects/unibox
- Vercel Env Vars: https://vercel.com/designsbyhasnain-6046s-projects/unibox/settings/environment-variables
- Supabase URL: https://uksnpmelsxryycnsokxc.supabase.co
- Supabase Dashboard: https://supabase.com/dashboard/project/uksnpmelsxryycnsokxc
- Resend: https://resend.com/overview
- Upstash QStash: https://console.upstash.com/qstash

---

## Self-Updating Rule (MANDATORY)

When you change code in any of the following ways, update the right doc in the same commit:

| Trigger | Update where |
|---------|-------------|
| New page, API route, server action file, service, component, or background job | `PROJECT_OVERVIEW.md` (the relevant inventory section) |
| Add/rename/remove a Prisma model or enum | `PROJECT_OVERVIEW.md` → Database section |
| Add a new role, change RBAC, or change `proxy.ts` / `auth.ts` / `roleGate.ts` / `accessControl.ts` | `PROJECT_OVERVIEW.md` + this file's Critical Security Rules if it changes a rule |
| Add a new npm dependency or bump a major version | `PROJECT_OVERVIEW.md` → Tech Stack |
| Add a new AI model / external service (Groq, ElevenLabs, etc.) | `PROJECT_OVERVIEW.md` → External Integrations |
| Ship anything significant | Append a "Build YYYY-MM-DD" entry to `CHANGES.md` |
| Discover a surprising pattern / hidden trap | `PROJECT_OVERVIEW.md` → Non-Obvious Patterns |
| Change a Critical Security Rule, coding pattern, or build/deploy step | This file |

**If you discover this file or `PROJECT_OVERVIEW.md` is out of date during a task, fix it before continuing — not after.**

---

## Tech Stack (summary)

Next.js 16 (App Router, Turbopack) · TypeScript 5.9 strict · React 19 · PostgreSQL via Supabase · Prisma 6 · Vercel (IAD1) · **Vanilla CSS only** (`app/globals.css`, oklch tokens, dark mode) · googleapis (Gmail+OAuth+Pub/Sub) · imapflow + nodemailer · Upstash QStash · Resend (invites) · Groq (Llama 3.3 70B + 3.1 8B) · Anthropic Claude via Gloy proxy · Google Gemini · ElevenLabs TTS · ESLint 9 flat config.

Full versions, scale numbers, and integration details: [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md).

---

## Commands

```bash
npm run dev              # Next.js dev server (Turbopack)
npm run build            # Production build
npm run lint             # ESLint 9 flat config — must pass 0 warnings
npm run format           # Prettier write
npx tsc --noEmit         # Type-check (RUN BEFORE EVERY COMMIT)
npx prisma generate      # Regenerate Prisma client (also on postinstall)
npx prisma migrate dev --name <name>  # Create + apply migration
```

---

## Coding Patterns (the ones that actually matter)

### Server Action — identity scoping is mandatory

```typescript
// src/actions/exampleActions.ts
'use server';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds, blockEditorAccess, requireAdmin } from '../utils/accessControl';
import { supabase } from '../lib/supabase';

export async function myAction() {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);          // throw on VIDEO_EDITOR
    // requireAdmin(role);             // uncomment for admin-only

    const accessible = await getAccessibleGmailAccountIds(userId, role);
    const accountIds = accessible === 'ALL' ? null : accessible;
    if (Array.isArray(accountIds) && accountIds.length === 0) {
        // SALES with zero assignments = empty data, NEVER fall through to admin branch.
        return { success: true, data: [] };
    }

    let q = supabase.from('email_messages').select('*');
    if (accountIds) q = q.in('gmail_account_id', accountIds);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data };
}
```

**Identity-scoping rules:**
- Every data query must scope through `getAccessibleGmailAccountIds(userId, role)`.
- `'ALL'` for ADMIN/ACCOUNT_MANAGER; explicit ID array for SALES; `[]` for VIDEO_EDITOR.
- Empty array MUST short-circuit to `{ success: true, data: [] }` — never fall through.
- `getAccessibleGmailAccountIds()` is memoized per-request via React `cache()`. Safe to call many times.

### Page Wrapper (server component)

```typescript
import { blockEditorAccess } from '../../src/lib/roleGate';
import FeatureClient from './PageClient';

export default async function Page() {
    await blockEditorAccess();        // or requireAdminAccess()
    return <FeatureClient />;
}
```

Two role-check layers, by design:
- `ensureAuthenticated()` in server actions reads the cookie's role (fast, no DB hit).
- `roleGate.ts` in page wrappers reads the DB's current role (safe against stale cookies after role change).

### Optimistic UI

For mutations, mirror the server change locally first, then revert on error. The current pattern across `accounts/PageClient.tsx`, `projects/`, `campaigns/`:

```typescript
// Optimistic
setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'NEW' } : i));
try {
    const res = await mutateAction(id);
    if (!res.success) {
        // Revert on server failure
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: original } : i));
        showError(res.error, { onRetry: () => handle(id) });
    }
} catch (err) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: original } : i));
}
```

Use `useTransition` for non-urgent re-renders, `useUndoToast` (`showSuccess` / `showError` with `onRetry`) for user feedback. Never use native `alert()` — replaced with toast across the app.

### Cron Route (dual QStash + Vercel Cron)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { qstashReceiver } from '../../../../lib/qstash';

async function run() { /* your logic */ }

export async function POST(req: NextRequest) {
    const body = await req.text();
    await qstashReceiver.verify({ signature: req.headers.get('upstash-signature')!, body });
    return NextResponse.json(await run());
}
export async function GET(req: NextRequest) {
    const auth = req.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (!auth || !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(await run());
}
```

### Response Envelope

All server actions return `{ success: boolean; data?: T; error?: string }`. Paginated: `{ emails, totalCount, page, pageSize, totalPages }`.

---

## Critical Files (Do Not Break)

| File | Why |
|------|-----|
| `proxy.ts` (NOT `middleware.ts`) | IP whitelist + session validation on every request. Next.js 16 convention |
| `src/lib/auth.ts` | AES-GCM session enc/dec. Format `iv:authTag:cipher`. `NEXTAUTH_SECRET` strictly required |
| `src/lib/roleGate.ts` | Fresh-DB role check for page guards |
| `src/lib/safe-action.ts` | Cookie-role gate for server actions |
| `src/utils/accessControl.ts` | Data scoping. Breaking this leaks data across roles |
| `src/utils/encryption.ts` | OAuth/IMAP token encryption (AES-256-GCM) |
| `src/actions/contactDetailActions.ts#transferContactAction` | Single chokepoint for `contacts.account_manager_id` writes |
| `src/actions/projectActions.ts#updateProjectAction` | Guards `projects.account_manager_id` on PAID projects |
| `app/api/webhooks/gmail/route.ts` | Verifies OIDC JWT before processing |
| `src/services/jarvisService.ts` | Jarvis tool catalog + system prompt with live business data |
| `prisma/schema.prisma` | Only ADD models/fields — never rename existing `@@map()` |
| `next.config.js`, `vercel.json` | Turbopack config, server externals, function timeouts, region, crons |

---

## Critical Security & Correctness Rules

1. **Never touch auth** (`proxy.ts`, `src/lib/auth.ts`, `roleGate.ts`, `safe-action.ts`, `accessControl.ts`) without understanding the whole chain.
2. **Always `npx tsc --noEmit`** before committing — strict mode must pass.
3. **Always `npm run build`** before push — SSR/client mismatches only surface there.
4. **Always `git push` after committing** — don't leave work only local.
5. **Never hardcode secrets.** All in `.env`. See `.env.example`.
6. **Never expose** `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `NEXTAUTH_SECRET` to the client.
7. **Never bypass RBAC.** Every data query: `ensureAuthenticated()` + `getAccessibleGmailAccountIds()`. SALES with empty assignments must fail-closed (return empty), never fall through to admin branch.
8. **Never remove** `'use server'` from action files or `import 'server-only'` from `src/services/` files.
9. **Never rename existing Prisma `@@map()`** decorators — they map to live Supabase tables/columns.
10. **Always use snake_case** column names in Prisma (with `@map()`).
11. **Never delete `webhook_events`** without processing — use the dead-letter pattern.
12. **Never skip IP whitelist or session checks** in `proxy.ts`. The 403 page must HTML-escape any user-controlled value.
13. **Never write `contacts.account_manager_id` directly.** All transfers MUST flow through `transferContactAction` (writes the `OWNERSHIP_TRANSFER` audit row). Inserts on creation can stay direct but should call `recordOwnershipChange({ from: null, to: <userId>, source })`. See `docs/AM-CREDIT-AND-OWNERSHIP-SCOPE.md`.
14. **Never write `projects.account_manager_id` after `paid_status='PAID'`** without `{ adminOverride: true, reason: '... ≥10 chars' }` AND ADMIN role. Guard lives in `updateProjectAction`. **Historical credit is immutable; current ownership is mutable** — two separate fields, never conflated.
15. **Always aggregate revenue through `projects.account_manager_id`, never `contacts.account_manager_id`.** Aggregating through the contact's *current* AM double-counts when a client moves between reps.
16. **Login null-role must return 403, not default to ADMIN.** Whitelist ADMIN/ACCOUNT_MANAGER/SALES/VIDEO_EDITOR.
17. **Invitation tokens are stored as SHA-256 hashes**, never plaintext. `validateInviteTokenAction` accepts both for legacy fallback through 2026-06-01.
18. **Gmail webhook MUST verify OIDC JWT** via `OAuth2Client.verifyIdToken`. Required env: `GMAIL_WEBHOOK_AUDIENCE`. Skip only with `GMAIL_WEBHOOK_VERIFY=false` in local dev.
19. **`activity_logs.note` is TEXT, not JSON.** We `JSON.stringify(payload)` and parse on read. Code reading the table should handle both `note` (current) and `details` (legacy).
20. **Theme toggle is `body[data-theme="light"]`**, not `.dark` on html. Legacy alias tokens that wrap theme-swapping tokens MUST be re-declared inside `[data-theme="light"]` or they freeze to dark values. See `globals.css` lines 219–278.

---

## Roles (4 distinct, despite Prisma enum showing 2)

Prisma enum has only `ADMIN` and `SALES`, but the DB also stores `ACCOUNT_MANAGER` and `VIDEO_EDITOR` as valid strings. **All code paths must handle all 4.**

| Role | Access |
|------|--------|
| `ADMIN` | Full |
| `ACCOUNT_MANAGER` | Treated identically to ADMIN |
| `SALES` | Only assigned Gmail accounts + own contacts/projects/campaigns |
| `VIDEO_EDITOR` | Only `edit_projects` rows. No Gmail / Contact / Campaign access. Allowed paths: `/dashboard`, `/projects`. Everything else redirects via `blockEditorAccess()`. (Profile editing now flows through the AccountSettingsModal triggered by the sidebar profile pill — same as every other role.) |

---

## Where to look when…

- "What server action / route / service / model does X?" → `PROJECT_OVERVIEW.md`
- "Why was X built that way?" / "What changed in build YYYY-MM-DD?" → `CHANGES.md`
- "What pattern do I follow for a new server action / page / cron?" → this file (above)
- "What are the security rules?" → this file (above)
- "What env var is for X?" → `PROJECT_OVERVIEW.md` → Environment Variables, or `.env.example`
- "What's the current data volume / team / live URL?" → `PROJECT_OVERVIEW.md` → top section

---

_Last audited: 2026-05-06 (post-launch) (/actions page click-to-open via ActionCard refactor + Ask AI wired in ActionCard + ComposeModal — both call suggestReplyAction(threadId)). Previous: 2026-05-06 (later) (search coverage extended to /my-projects + /link-projects + /data-health; /intelligence scroll fix). 2026-05-06 (global search overhaul — wired /projects + /scraper, extended projects search to editor column, hid the search form on non-list routes, partitioned recent-search history per page key). 2026-05-05 (deleted /settings route + manual theme toggle — theme now follows OS prefers-color-scheme; redesigned /accounts cards as glassmorphism with kebab actions + collapsible Technical Health). 2026-05-04 (merged /branding features into /accounts; deleted /branding route; added BIMI-Selector header + Gravatar fallback to mail senders). 2026-04-30 (Phase 1 launch-ready)._
