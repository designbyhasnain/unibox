# The Email Intelligence Layer — Plan

> **Frame:** treat this codebase as if we're shipping the back-office for an Apple-grade wedding-filmmaking operation. We have ~100k emails on ~18k contacts — that's the truth of the business. Most of it sits unstructured in `email_messages.body`. The plan below turns that corpus into a typed, queryable, decision-grade dataset, ranked Tier 1 → Tier 3 by what drives the most product decisions.

---

## Why this matters now

The Pipeline Cleanup screen surfaced the symptom: every "Earliest project" cell reads **29 March 2026** — because `projects.created_at` is the timestamp the admin pasted the row in, not the actual wedding / delivery date. Same problem in twelve other places:

- Goal Planner can't compute honest funnel timing because we don't know when deals were won, only when they were *recorded*.
- Production capacity charts can't say *"23 weddings in June"* because nobody's stored "the wedding is in June" anywhere structured.
- Campaign copy can't address *"your June 15 wedding in Austin"* because the wedding date + city + couple names live in unstructured email bodies.

Every surface that should answer those questions is starved of the same five typed facts. The fix is one extraction pipeline that mines them once and writes them into structured columns. After that, the rest of the app gets ten-times sharper for free.

---

## What I'll extract

Tier 1 facts drive ≥80% of business decisions. Build these first; ignore the rest until pulled in by a real product question.

### Tier 1 — facts that drive the most decisions

| # | Fact | Type | Why it earns its row |
|---|---|---|---|
| 1 | **Wedding date** | `date` | Drives production calendar, urgency cues, follow-up cadence, season pricing |
| 2 | **Couple / client names** | `text[]` | Personalisation in every campaign template + inbox row title |
| 3 | **Location** | `{ city, region, country }` | Geographic strategy in Goal Planner; merges fragmented `location` text |
| 4 | **Project type** | enum: `HIGHLIGHT`, `FULL_FILM`, `TRAILER`, `SOCIAL_CUT`, `RESTORATION`, `OTHER` | Pricing benchmarks per type; production-staffing ratios |
| 5 | **Quoted / accepted price (USD)** | `number` | Avg deal size that doesn't lie; powers fair pricing recommendations |
| 6 | **Source channel** | enum: `UPWORK`, `INSTAGRAM`, `REFERRAL`, `WEBSITE`, `COLD_OUTREACH`, `UNKNOWN` | Marketing CAC by channel — single biggest ad-spend lever |
| 7 | **Delivery date** | `date` | Real "deal closed" date (replaces `projects.created_at`) |
| 8 | **Outcome** | enum: `WON`, `LOST`, `GHOSTED`, `NOT_INTERESTED`, `STILL_OPEN` | Honest funnel; powers reply-rate by outcome |

### Tier 2 — production planning (after Tier 1 lands)

| # | Fact | Type |
|---|---|---|
| 9 | Footage volume | `{ files: int, gb: number, hours: number }` |
| 10 | Deliverables list | `text[]` (drone, color grade, audio sync, social cuts, photo book) |
| 11 | Turnaround / due date requested | `date` |
| 12 | Style reference URLs | `text[]` (links the prospect cited) |

### Tier 3 — marketing intel (only when surfaces ask for it)

| # | Fact | Type |
|---|---|---|
| 13 | Sentiment trajectory | `number[]` (per-message score) |
| 14 | Objection cited | enum (price / turnaround / style / availability / partner-decision) |
| 15 | Pain points mentioned | `text[]` |

---

## Architecture (Musk-lens — first principles, delete what doesn't pull weight)

One pipeline, three components:

```
[ email_messages (existing) ]
        │  hourly cron + one-shot backfill
        ▼
[ extractInsightsService.ts ]   ← Groq llama-3.1-8b, JSON-mode, ~150 tokens/thread
        │  Zod-validated output
        ▼
[ contact_insights (new table) ]   ← typed facts + confidence + source_email_id
        │
        ▼
[ every future feature ]   Goal Planner · Calendar · Production board · Campaigns · Pricing
```

### `contact_insights` schema (one row per fact, not per contact)

```prisma
model ContactInsight {
  id           String   @id @default(uuid())
  contactId    String   @map("contact_id")
  contact      Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)

  factType     String   @map("fact_type")   // e.g. 'wedding_date', 'price_quoted', 'source_channel'
  value        Json     // shape varies per fact_type — typed at read time via fact-type registry
  confidence   Float                                // 0.0 – 1.0; below 0.6 → surfaced for human confirm
  sourceEmailId String? @map("source_email_id")
  sourceEmail  EmailMessage? @relation(fields: [sourceEmailId], references: [id])

  extractedAt  DateTime @default(now()) @map("extracted_at")
  modelVersion String   @default("groq-llama-3.1-8b@v1") @map("model_version")

  @@index([contactId, factType])
  @@index([factType, confidence])
  @@map("contact_insights")
}
```

One row per fact (not jsonb on contact) so:
- We can re-extract a single fact when the prompt improves without rewriting the rest.
- We can show provenance ("this wedding date came from this email") on hover.
- Confidence scores are first-class — analytics ignore < 0.6 by default.

### Extractor service (`src/services/insightsExtractor.ts`)

- Input: a thread (subject + first 1.5k chars of latest 5 messages).
- LLM call: Groq llama-3.1-8b, JSON-mode, ~50 ms, ~150 input tokens / ~80 output tokens.
- Cost per thread: **~$0.00005**. For 100k threads, ~$5 total backfill.
- Output: validated by Zod schema (the fact-type registry). Anything off-schema is dropped, logged.
- Idempotent: each `(contactId, factType)` pair has a UNIQUE constraint; UPSERT replaces older fact when new extraction confidence is higher OR the prompt version is newer.

### Cron (`app/api/cron/extract-insights`)

- Runs hourly via QStash (existing pattern).
- Picks contacts with: any new inbound email since `last_extracted_at`, OR `last_extracted_at IS NULL`.
- Hard-cap of 200 contacts per run so no single cycle blows the function timeout.
- One-shot backfill is the same code, called from a `tsx scripts/backfill-insights.ts --dry-run` script.

---

## What this powers (Jobs-lens — every product surface answers a real question)

Once Tier 1 is in `contact_insights`, the rest of the app can be sharpened with one-line queries:

| Surface | Question it answers (today) | Question it answers (after) |
|---|---|---|
| **Goal Planner** | "What's our avg deal size?" — based on `projects.project_value` (sparse) | "What's our avg deal size **per project type per region for last 90 days**?" — based on extracted prices |
| **Inbox row** | "Lead · WARM" | "Lead · WARM · **wedding in 47 days · Austin · highlight reel quoted $850**" |
| **New page `/calendar`** | (doesn't exist) | Month grid of upcoming weddings, click → thread |
| **New page `/production-board`** | (doesn't exist) | Editors see jobs sorted by due date with footage volume + deliverables |
| **Dashboard** | "Revenue this month: $X" | "Revenue forecast next 60 days: **$Y from 23 booked weddings**" |
| **Campaigns** | "Hi {{first_name}}" | "Hi {{couple_names}}, I noticed your {{city}} wedding is in {{N}} days, and your last note mentioned {{pain_point}}…" |
| **Marketing decisions** | "Should we spend more on Instagram or Upwork?" — gut feel | Source-attribution chart by `source_channel` × revenue × close rate |
| **Pricing** | "What should I quote a UK destination filmmaker?" | Distribution chart of `price_quoted` filtered by region + project type — the salesperson sees the median + p90 |

---

## Build order — phased, each phase independently shippable

### **Phase 1 — Tier 1 extraction + the smallest UI win** (3-4 days)

1. **Schema migration** — `contact_insights` table + indexes. Production Supabase write — gated on owner sign-off. SQL committed to `prisma/insights_layer_migration.sql`.
2. **Extractor service** — `src/services/insightsExtractor.ts` with the 8 Tier-1 fact types, Zod validation, Groq client (already configured in `.env`), a unit-test fixture per fact type.
3. **One-shot backfill script** — `scripts/backfill-insights.ts`. `--dry-run` prints to stdout; `--live` writes. Resumable via `--since-contact-id`. Logs progress per 100 contacts.
4. **Hourly cron** — `app/api/cron/extract-insights/route.ts` calling the same service.
5. **The minimum-viable UI win** — inbox row badge: when a contact has `wedding_date` insight, show *"💍 47 days"* (or *"💍 Today"*, *"💍 in 6 weeks"*) next to the existing stage chip. Single change in `app/PageClient.tsx` reading `email.contact_wedding_date` (joined into the inbox query alongside `contact_name`, same pattern we already use).

After Phase 1: every conversation has a wedding-date badge, the Pipeline Cleanup screen's "Earliest project" column gets renamed to "Wedding date" and reads from the insight, and Rameez/Shayan can finally see "this couple is married next week — answer this email NOW" without opening the thread.

### **Phase 2 — Calendar + dashboard surface** (2-3 days)

1. `/calendar` page — month grid; each cell shows wedding count + revenue; click a date → list of weddings + click-through to thread. Built from `contact_insights` where `fact_type='wedding_date'`.
2. Dashboard widgets: "*Weddings next 30 days: N · Forecast revenue: $X*", "*Source mix*" pie (Upwork / IG / Referral / Cold), "*Avg quoted price by project type*" bar chart.
3. Goal Planner v2 — replace the current per-region average-deal-size with **per-`(region, project_type, last_90_days)` avg from `contact_insights.price_quoted`**. Sharper, honest, no priors needed once we have ≥30 data points.

### **Phase 3 — Production-board + campaign personalisation** (2-3 days)

1. `/production-board` — editor-facing view of upcoming jobs: wedding date, footage volume, deliverables list, due date. Editors can flag jobs "blocked / waiting on assets".
2. Campaign templates — copy variables `{{wedding_date}}`, `{{couple_names}}`, `{{city}}`, `{{quoted_price}}`, `{{pain_point}}` resolved from `contact_insights` per recipient at send time. Goal Planner's auto-drafted templates (currently generic) become per-prospect.
3. Auto-cadence — system schedules follow-ups at *T-12mo / T-6mo / T-1mo / T-1day / T+3day-thank-you* relative to `wedding_date`, replacing the `nextFollowupAt` heuristic.

---

## Critical files

**New:**
- `prisma/insights_layer_migration.sql` — schema migration (CONCURRENTLY indexes; idempotent)
- `src/services/insightsExtractor.ts` — extractor + Zod fact-type registry
- `src/actions/insightsActions.ts` — read-side server actions for the UI surfaces
- `app/api/cron/extract-insights/route.ts` — hourly job
- `scripts/backfill-insights.ts` — one-shot backfill with `--dry-run`
- `app/calendar/page.tsx` + `CalendarClient.tsx` (Phase 2)
- `app/production-board/page.tsx` + client (Phase 3)

**Modified:**
- `prisma/schema.prisma` — add `ContactInsight` model + Contact relation
- `src/actions/emailActions.ts` — `resolveAccountManagers()` already coalesces in two queries; extend to also pull `contact_wedding_date` and `contact_quoted_price` from `contact_insights` for inbox row rendering
- `app/PageClient.tsx` — add wedding-date badge to row meta (one inline `<span>` next to the existing stage chip)
- `app/pipeline-cleanup/PipelineCleanupClient.tsx` — replace "Earliest project" column with "Wedding date" once available

**Reused (don't rewrite):**
- `markContactClosed()` in `src/services/pipelineLogic.ts` — still the rule for setting `is_client`
- Goal Planner's `goalPlannerService.ts` — feed it the new per-segment medians instead of priors when sample-size ≥ 30
- Existing Groq client wiring (`GROQ_API_KEY` in `.env`)
- `staleWhileRevalidate.ts` for caching the calendar / dashboard reads

---

## Cost + risk envelope

| Item | Number |
|---|---|
| Backfill LLM cost (~100k threads × Groq llama-3.1-8b) | ~$5 |
| Steady-state cron cost (assume 200 contacts × 24 runs/day) | ~$0.50/month |
| Engineering time | ~1 week to Phase 2; +1 week to Phase 3 |
| Production-DB write (Phase 1 schema migration) | One Prisma migration; reversible with `DROP TABLE contact_insights` if v2 spec replaces it |
| Risk if extractor gets a fact wrong | Confidence < 0.6 hides it from analytics + flags it for human confirm; failures fall back to current behaviour (no badge shown) |

---

## The quick win we can ship by tonight

Skip everything except this:

1. Add a single `contacts.wedding_date_extracted` (`date`) column.
2. Run a one-shot script over **the last inbound email of every WARM_LEAD/LEAD/OFFER_ACCEPTED contact** (the ~7k that matter most), Groq-extracts the wedding date if mentioned.
3. Write to that column. Cost: ~$0.40, runtime ~10 minutes.
4. Inbox renders "💍 in 47 days" badge using that column.

The Pipeline Cleanup screen and the Goal Planner immediately stop showing the misleading 29-March dates because every place that reads "earliest_project_at" now prefers `wedding_date_extracted` if present.

That's a 4-hour, $0.50 task that unblocks the visible bug while we plan the bigger insights layer above.

---

## Open questions before I start

1. Is the Quick Win acceptable as Phase 0 (one column on `contacts`, ships before Phase 1's full table)? Or go straight to the proper `contact_insights` table?
2. Phase 1 schema migration to production Supabase — same pattern as the indexes (CONCURRENTLY, run via Supabase Dashboard SQL editor) or do you want me to use the Prisma migration runner against the prod URL?
3. For the source-channel classification, do you want a hard-coded set ({Upwork, IG, Referral, Website, Cold, Unknown}) or should I let the LLM infer free-text values for the first batch and pick the cluster centroids after?
