# Goal-Driven Campaign Planner — Design Spec

**Date:** 2026-05-03
**Status:** Draft
**Audience:** Engineering (implementation), product (sign-off)
**Owner:** Mustafa
**Implementor:** TBD

---

## 1. Problem

A SALES user (e.g. Rameez, role=`SALES`) has a revenue goal — e.g. **$8,000 by May 31** — and 13,000+ wedding-filmmaker contacts in the CRM. Today he must:

1. Guess which regions to target.
2. Manually build a campaign with steps + enrolled contacts.
3. Hope the math works.

He should be able to enter the goal, see a data-grounded plan ("send 380 emails to California + re-engage 220 dormant UK leads → projected $8,200, medium confidence"), and click one button to materialise that plan as DRAFT campaigns he can review and launch.

The platform must remain multi-tenant ready. Today's tenant is wedding-filmmaker outreach; tomorrow's tenant could be SaaS, real estate, or B2B law. Niche cannot be hard-coded.

## 2. Out of scope

- LinkedIn / web enrichment of contacts.
- Auto-launch (campaigns are auto-drafted; Rameez clicks Launch).
- Replacing or rewriting the existing campaigns engine — we **wrap** it.
- Per-contact AI personalisation beyond what the existing `draft_email` Jarvis tool already does.

## 3. Constraints & decisions

| Decision | Value | Rationale |
|---|---|---|
| Automation level | Auto-create DRAFT, manual launch | User-confirmed. Lower blast radius than full auto. |
| Goal shape | Amount + deadline | User-confirmed. |
| Forecast model | **Funnel decomposition with Bayesian shrinkage** | Single-number averages hide bottlenecks; shrinkage handles cold-start regions. |
| Lead source | Existing contact pool only (v1) | Scraper is admin-only; SALES users surface "scrape needed" cards but don't trigger scraping. |
| Email content | Existing `draft_email` Jarvis primitive | Already implemented; per-niche prompt templating is the only delta. |
| Determinism | Required | Same goal → same plan, every time. Plan IDs must be stable so refresh doesn't shuffle. LLM-driven planning is rejected (rerolls produce different plans). |
| Multi-tenant | `tenant_niche` is a workspace attribute, not a per-contact column | v1 default `'wedding_filmmakers'`. |

## 4. Architecture

```
[ /campaigns page ]
        │
        ▼
[ <GoalPlanner/> tab ]                    ← new component
        │
        ▼  (server action)
[ generateGoalPlan(amount, deadline) ]   ← src/actions/goalPlannerActions.ts
        │
        ▼
[ goalPlannerService ]                   ← src/services/goalPlannerService.ts (pure)
        │       │              │
        │       ▼              ▼
        │   getRegionBreakdown   getOwnerFilter / accessControl
        │   getContactsByRegion  (existing)
        ▼
[ Scenario[] returned ]
        │
        ▼  (user checks scenarios, clicks Build)
[ buildCampaignsFromPlan(scenarios[]) ]  ← src/actions/goalPlannerActions.ts
        │
        ▼  (one per scenario)
[ existing createCampaign() ] → campaign rows + campaign_step + campaign_contact + campaign_send_queue
```

The planner is a **pure deterministic library** sitting on top of the existing campaigns engine. It calls existing helpers (`getRegionBreakdown`, `getContactsByRegion`, `getOwnerFilter`, `createCampaign`) — adds no new write paths into the campaign tables.

## 5. Data model

### 5.1 No new contact columns

The contacts table already carries `location`, `total_revenue`, `total_projects`, `avg_project_value`, `client_tier`, `total_emails_sent`, `total_emails_received`, `days_since_last_contact`, `lastEmailAt`, `pipelineStage`, `accountManagerId`. That's enough.

### 5.2 New: `users.tenant_niche` (string, default `'wedding_filmmakers'`)

Added in a Prisma migration. Drives:
- Email-draft prompt template (replaces hard-coded "wedding").
- Per-niche prior in the shrinkage step (different niches have different baseline conversion rates; e.g. B2B law ≠ wedding photography).

Until the SaaS pivot, every existing user is updated to `'wedding_filmmakers'`.

### 5.3 New: `goal_plans` (audit/traceability)

```prisma
model GoalPlan {
  id          String   @id @default(uuid())
  userId      String   @map("user_id")
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  goalAmount  Float    @map("goal_amount")
  deadline    DateTime
  scenarios   Json     // serialised Scenario[] returned to UI
  totalProjected Float @map("total_projected")
  selectedScenarioIds String[] @map("selected_scenario_ids")  // which cards he checked
  builtCampaignIds    String[] @map("built_campaign_ids")     // populated after Build
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([userId, createdAt])
  @@map("goal_plans")
}
```

Reasons:
- Lets us show "your last plan" so refresh doesn't lose state.
- Audit trail when projections miss reality (we'll need this to tune the model).
- Powers a future "post-mortem" view: "your $8k plan made $6.2k — here's why each scenario underperformed."

## 6. Forecasting algorithm

### 6.1 Scenario types (always computed)

| Scenario | Filter |
|---|---|
| `region_top` | Group contacts by `location` parsed top region; rank by `revenue_per_send` historical; take top 5. |
| `dormant_reengagement` | Contacts in CONTACTED/COLD_LEAD with `lastEmailAt > 180 days ago`. |
| `followup_depth` | Active campaigns where median `followupCount < 3` AND `lead_score ≥ 50`. |
| `scrape_needed` | Regions with high historical `revenue_per_send` but `untouched_pool < 100`. Surfaces as "scrape N more in X". |

### 6.2 Per-scenario funnel

For each scenario S the service computes:

```
P(deliver | sent)        = sent_delivered / sent              (or 0.95 prior)
P(open | deliver)        = opened / sent_delivered            (or 0.40 prior)
P(reply | open)          = replied / opened                   (or 0.10 prior)
P(meeting | reply)       = stage_advanced_to_LEAD+ / replied  (or 0.30 prior)
P(close | meeting)       = CLOSED / stage_advanced_to_LEAD+   (or 0.20 prior)
avg_deal_size            = mean(projects.projectValue) for closed contacts in S
                                                              (or per-niche prior)
```

Priors are **per-niche** (read from `tenant_niche`). For wedding-filmmakers, we seed defaults from a one-time analysis of the existing 13k contacts; the resulting CSV is committed alongside the migration so engineering can re-derive priors per niche later.

### 6.3 Bayesian shrinkage (handles cold-start)

For each rate `p` with `n` historical samples, the shrunk estimate is:

```
p_shrunk = (n * p_observed + k * p_prior) / (n + k)
```

with `k = 30`. So a region with 10 sends (`n=10`) is `(10 * p_obs + 30 * p_prior) / 40` — heavily pulled toward the prior. A region with 300 sends barely budges from observed reality.

### 6.4 Projected revenue

```
projected_revenue(S) = pool_used(S)
                     × P(deliver) × P(open) × P(reply)
                     × P(meeting) × P(close)
                     × avg_deal_size
```

`pool_used(S)` is computed in two passes:

1. `pool_max(S) = min(untouched_contacts_in_S, daily_send_capacity × days_until_deadline)` — the hard ceiling.
2. After all scenarios produce their `pool_max`, total capacity is allocated proportionally to **projected ROI per send** (revenue per send under the funnel above), so the highest-yield scenario gets capacity first. A scenario whose `pool_max` is below its allocated share keeps its `pool_max`; spare capacity flows to the next-highest-ROI scenario.

### 6.5 Confidence

| Confidence | Rule |
|---|---|
| High | All five rates have `n ≥ 100` |
| Medium | Some rates have `30 ≤ n < 100` |
| Low | Any rate has `n < 30` (relies heavily on prior) |

Low-confidence cards are visible but **excluded from "Build drafts" unless explicitly opted in** — guards against the model hallucinating revenue from a region where we have basically no data.

## 7. UI flow

Single new tab inside `/campaigns/PageClient.tsx`: **Goal Planner**.

```
┌────────────────────────────────────────────────────────────┐
│  Goal Planner                                              │
│                                                            │
│  I want to make $ [  8,000  ]  by  [  May 31, 2026  ]      │
│                          [ Calculate plan → ]              │
│                                                            │
│  ─────────────────────────────────────────────────────     │
│                                                            │
│  ☑ California                                  $4,200      │
│     Pool 380 · Send rate 20/day · Until May 28             │
│     Funnel: 95% → 42% → 11% → 28% → 22% × $440 avg         │
│     Confidence: High                                       │
│                                                            │
│  ☑ Re-engage UK dormant (>6mo no contact)      $2,100      │
│     Pool 220 · Send rate 12/day · Until May 30             │
│     Funnel: 92% → 38% → 8% → 25% → 18% × $310 avg          │
│     Confidence: Medium                                     │
│                                                            │
│  ☐ Add 3rd follow-up to active campaigns       $900        │
│     180 contacts · No new sends, just deeper sequence      │
│     Confidence: Medium                                     │
│                                                            │
│  ⚠ Scrape needed: Europe (500 more)            +$2,000     │
│     Untouched pool: 0  ·  Action: ask Admin to scrape      │
│     Locked until pool exists                                │
│                                                            │
│  ─────────────────────────────────────────────────────     │
│  Total projected: $7,200 / $8,000  (90%)                   │
│                                                            │
│         [ Accept gap and build drafts → ]                  │
└────────────────────────────────────────────────────────────┘
```

After "Build drafts":
- One DRAFT campaign per checked scenario.
- Default 3 steps each: initial + 2 follow-ups (delays 3 / 7 days), with `subsequenceTrigger=OPENED_NO_REPLY` on follow-ups.
- Subjects + bodies generated by the existing `draft_email` Jarvis primitive, fed niche from `tenant_niche`.
- Rameez lands back on the campaigns list with a banner: "3 drafts created — review and launch."

## 8. Multi-tenant seams

| Seam | v1 behaviour | SaaS-future behaviour |
|---|---|---|
| Niche string | `users.tenant_niche` defaults to `'wedding_filmmakers'` | Becomes a workspace setting on signup; user inherits from workspace. |
| Funnel priors | Hard-coded `WEDDING_FILMMAKER_PRIORS` constant in `goalPlannerService.ts` | Read from `niche_priors` table seeded per niche; tenants can override. |
| Email-draft prompt | Single template literal, niche injected as variable | Per-niche template loaded at request time. |
| Region parsing | Free-text `location` split on commas | Same — geocoding is v2. |

The v1 code never says "wedding" outside of one constant block. Renaming the niche is a single config change.

## 9. Error handling

| Condition | Behaviour |
|---|---|
| Goal amount ≤ 0 | Form validation; no server call. |
| Deadline in past or <3 days | Same. |
| Total contact pool = 0 | Empty state + "Ask Admin to scrape" CTA. |
| User not assigned any Gmail accounts | Block planner with "You need at least one assigned mailbox to send." |
| Send capacity < required | Total projected reflects capacity; banner: "Capacity ceiling: $X. Extend deadline by Y days to reach goal." |
| Build drafts fails mid-way (n of m succeeded) | Successful drafts persist; UI shows "3 of 4 drafts created — retry the 4th?" |
| Scenario with `n < 30` and not opted in | Shown grey with confidence badge; checkbox disabled with tooltip "Low confidence — toggle 'Include low-confidence' to enable." |

## 10. Testing strategy

- **Unit** (`src/services/goalPlannerService.test.ts`): synthetic fixture of 200 contacts + 50 messages + 10 projects → assert projected_revenue is within ±5% of analytic ground truth; assert priors apply when `n < 30`; assert shrinkage formula.
- **Integration** (`tests/goalPlanner.integration.ts`): run against the live read-only Supabase, assert no infinities, no negatives, total ≤ pool × max-deal-size.
- **E2E** (`tests/e2e/goalPlanner.spec.ts` via Playwright): log in as Rameez → enter goal → see plan → click Build → assert N draft campaigns visible in `/campaigns` list.
- **Snapshot**: planner card markup.
- **Property test**: for any goal × deadline, the projection function never returns NaN/Infinity.

## 11. Migration / rollout

> **⚠ Production-DB warning.** RUN-LOCALLY.md confirms the local app and `https://txb-unibox.vercel.app` share one Supabase database. Every Prisma migration below hits production immediately. Each must run only after explicit owner approval; never executed automatically by an agent.

1. Prisma migration: add `users.tenant_niche` + `goal_plans` table. Backfill existing users to `'wedding_filmmakers'`. Reversible (drop columns). Run via `prisma migrate deploy` against the prod URL **only after the owner gives go-ahead**.
2. Ship `goalPlannerService.ts` + tests behind a feature flag `GOAL_PLANNER_ENABLED` (defaults off in prod).
3. Ship the `<GoalPlanner/>` tab — only renders if flag enabled.
4. Internal dogfood with Rameez for one week. Collect:
   - Were projections within ±20% of actual revenue?
   - Did he edit drafts before launching, or launch as-is?
   - Any "this is missing" requests?
5. Tune priors from dogfood data. Flip the flag on for all SALES users.

## 12. Open risks

| Risk | Mitigation |
|---|---|
| Funnel priors for wedding-filmmakers are wrong | Seed from one-time analysis of existing 13k contacts; commit the script. Re-derive every quarter. |
| Rameez burns sender reputation by launching everything | Existing `dailySendLimit`, `emailGapMinutes`, `stopOnAutoReply` already enforce floors. Planner respects them. |
| Region parsing collapses "Los Angeles, CA" and "California" into different regions | First version uses last comma-segment ("CA" / "California"). Edge cases logged for v1.5 geocoding pass. |
| Same contact picked up in two scenarios (e.g. California + Dormant) | De-dup at scenario aggregation: a contact belongs to the highest-projected-revenue scenario only. |
| Plan changes between page refresh and click-to-build | `goal_plans` row pins the scenarios; build always reads from the row, not from a fresh recompute. |

## 13. Future work (out of v1, recorded for context)

- **Pre-computed `region_metrics` table** (Approach C) once query patterns stabilise — materialised view refreshed nightly.
- **Auto-launch** with safety rails (only if expected revenue > $X and confidence high; daily-revenue cap).
- **Post-mortem view**: side-by-side projected vs actual per scenario, drives prior updates.
- **Per-tenant priors UI** for SaaS phase.
- **Geocoding** to merge "Los Angeles" / "LA" / "Los Angeles, CA" variants.
