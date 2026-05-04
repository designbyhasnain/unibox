# Sales Playbook — Cold Outreach + Follow-ups in Unibox

> **Audience:** sales operators (e.g. Rameez, role=`SALES`) and engineers extending the SALES surface. Worked example throughout uses Rameez (`rameezsiddiqui@txb.com.pk`).
>
> Every file path is relative to the repo root.

---

## 1. What a SALES user can see (role scope)

A SALES user is *not* given a system-wide view. Two layers of scoping apply:

| Layer | Where it's enforced | What it limits |
|---|---|---|
| **Role gate** | `src/lib/roleGate.ts`, `src/utils/accessControl.ts` | Hides Admin-only nav, blocks Admin server actions |
| **Gmail-account assignment** | `user_gmail_assignments` table + `getAccessibleGmailAccountIds()` in `src/utils/accessControl.ts` | Inbox / sent / threads / contacts limited to mailboxes the user is assigned to |
| **Owner filter** | `getOwnerFilter(userId, role)` | Contacts visible only when `account_manager_id = current user's id` |

**Sidebar visibility for SALES** (`app/components/Sidebar.tsx`):

- Visible: Inbox `/`, Dashboard, My Clients (`/clients`), My Projects (`/my-projects`), My Pipeline (`/opportunities`), My Campaigns (`/campaigns`), Templates, My Analytics, Jarvis AI, Settings
- Hidden: Accounts, Scraper, Edit Projects, Link Projects, Intelligence, Finance, Data Health, Team

> **Implication.** Rameez doesn't acquire raw leads from the Scraper — an Admin scrapes and assigns. Rameez works *the assigned book* using Campaigns + Jarvis + the Inbox.

---

## 2. The data Rameez has on every lead

For any contact a SALES user owns, Unibox already stores:

**Contact-level** (`contacts` table, `prisma/schema.prisma`)
- Identity: `email`, `name`, `company`, `contactType`, `source`
- Pipeline: `pipelineStage` (COLD_LEAD → CONTACTED → WARM_LEAD → LEAD → OFFER_ACCEPTED → CLOSED / NOT_INTERESTED), `isLead`, `isClient`, `becameClientAt`
- Engagement: `leadScore`, `openCount`, `lastOpenedAt`, `followupCount`, `nextFollowupAt`, `autoFollowupEnabled`
- Ownership: `accountManagerId`

**Per-message** (`email_messages` table)
- `direction` (SENT | RECEIVED), `emailType` (OUTREACH_FIRST, FOLLOW_UP, CONVERSATIONAL, FIRST_REPLY, CONTINUED_REPLY)
- `isTracked`, `trackingId`, `deliveredAt`, `openedAt`, `opens_count`, `clicks_count`, `last_opened_at`
- `pipelineStage` snapshot at send time

**Per-thread** (`email_threads` table) — `firstReplyReceived` flag.

**Activity log** (`activity_log`) — every send, stage move, and project event with `performedBy` + timestamp.

**Open / click telemetry**
- `app/api/track/route.ts` — pixel; ignores Gmail proxy prefetch via 120 s post-deliver delay (commit `2b52a20`).
- `app/api/track/click/route.ts` — wrapped link redirect.
- `src/services/trackingService.ts` (`prepareTrackedEmail()`) — injects pixel + rewrites links.

---

## 3. Cold-outreach flow

### Step 1 — Pick a list
Open **My Pipeline** (`/opportunities`) or **My Clients** (`/clients`) and filter `pipelineStage = COLD_LEAD`. One-off lead: **+ Add Lead** (`app/components/AddLeadModal.tsx`).

### Step 2 — Build a campaign
`app/campaigns/PageClient.tsx`; server in `src/actions/` campaign actions and `app/api/campaigns/process/route.ts`.

A campaign is rich:
- **Goal**: `COLD_OUTREACH | FOLLOW_UP | RETARGETING` (`CampaignGoal`).
- **Steps** (`campaign_step`): ordered, each with `delayDays`, `subject`, `body`. A step can be a **subsequence**: only fires if the parent step was `OPENED_NO_REPLY` (column `subsequenceTrigger`).
- **A/B variants** (`campaign_variant`): each step holds A and B copy with weights. Cron `app/api/cron/ab-auto-promote/route.ts` picks the winner if `autoVariantSelect=true`.
- **Throttle / schedule**: `dailySendLimit`, `emailGapMinutes`, `randomWaitMax`, `scheduleEnabled`, `scheduleDays`, `scheduleStartTime/EndTime`, `stopOnAutoReply`, `textOnly`.
- **Sending mailbox**: `sendingGmailAccountId` — must be one of the user's assigned accounts.

### Step 3 — Enrol contacts & queue sends
- `campaign_contact` per prospect: `currentStepNumber`, `nextSendAt`, `status` (PENDING → IN_PROGRESS → COMPLETED / STOPPED / BOUNCED / UNSUBSCRIBED).
- `campaign_send_queue` per email: `scheduledFor`, `status` (QUEUED → SENDING → SENT/FAILED), `attempts`.

### Step 4 — Send
- Hourly cron `app/api/cron/automations/route.ts` orchestrates campaign step processing, follow-up scheduling, auto-stage transitions, OAuth refresh, account health.
- `app/api/campaigns/process/route.ts` drains the send queue (60 s budget, 30 emails/cycle/account).
- Actual send: `src/services/gmailSenderService.ts` (OAuth) or `src/services/manualEmailService.ts` (SMTP).
- Every outbound email runs through `trackingService.prepareTrackedEmail()` → pixel + click wrapping if `trackReplies=true`.

### Step 5 — Templates accelerate Step 2
- `app/templates/` — personal + shared library (`email_template`: name, subject, body, category, isShared, usageCount).
- Monday 03:00 UTC cron `/api/mine-templates` (`vercel.json`, `src/services/templateMiningService.ts`) auto-extracts new templates from sent emails using semantic similarity.

---

## 4. Follow-up flow

### Real-time surfaces
| Page | Path | What it is |
|---|---|---|
| Inbox | `app/page.tsx` + `app/PageClient.tsx` | Tabs by pipeline stage; right panel is full thread; quick reply via `app/components/InlineReply.tsx` |
| Sent | `app/sent/` | Outbound, sortable by `deliveredAt`/`openedAt` |
| Delivered | `app/delivered/` | Confirmed delivered (blue tick) |
| My Queue | `app/my-queue/` | Today's scheduled campaign sends |
| Revisions | `app/revisions/` | Project revision threads (post-sale) |

### Pipeline transitions are automatic
`src/services/emailSyncLogic.ts` + `src/services/pipelineLogic.ts`:
- First send → COLD_LEAD → CONTACTED.
- First inbound reply → CONTACTED → WARM_LEAD; thread `firstReplyReceived` flips true.
- Manual moves to LEAD / OFFER_ACCEPTED / CLOSED via the inbox stage dropdown (also written to `activity_log`).

### Triggered follow-ups
- `subsequenceTrigger=OPENED_NO_REPLY` on a step — auto-fires after delay if prospect opened previous step but didn't reply.
- `nextFollowupAt` + `autoFollowupEnabled` on the contact — single recurring nudge cadence outside campaigns.
- `stopOnAutoReply` — kills a campaign on OOO / vacation auto-replies.

### Tracking signals worth acting on
- `openedAt` set + no inbound reply → high-value follow-up moment (Jarvis surfaces this in the briefing).
- Multiple opens (`openCount` rising) → email forwarded internally → time to call.
- Click on a wrapped link → strongest intent signal.
- All of the above visible per-thread in `app/components/ClientIntelligencePanel.tsx`.

---

## 5. Jarvis — AI co-pilot for sales

`app/jarvis/` and `app/api/jarvis/` provide three things every salesperson uses daily:

1. **Daily Briefing** — `src/services/dailyBriefingService.ts`. SALES path summarises last 24 h: emails sent/received, new WARM_LEADs, deals closed, top opens-without-reply. Pre-warmed by `app/api/cron/precompute-briefings/route.ts` (hourly) so the dashboard card is instant. Groq llama-3.1-8b.
2. **Reply Suggestions** — `src/services/replySuggestionService.ts`. Drafts the next reply given thread history + contact profile + company intel. Claude (sonnet-4.5 via Gloy proxy `https://api.gloyai.fun`).
3. **Lead Q&A agent** — `src/services/jarvisAgentService.ts`. Multi-turn chat: *"which clients have I not followed up with this week"*, *"summarise this thread"*. Groq.

Plus `src/services/aiSummaryService.ts` for one-line thread summaries shown atop long inbox threads.

---

## 6. Automations Rameez doesn't manage but benefits from

All wired in `vercel.json` + `app/api/cron/*`:

| Cron | Purpose | Why Rameez cares |
|---|---|---|
| `automations` (hourly, QStash) | Campaign steps, follow-up scheduling, OAuth refresh, account health, daily-send reset at UTC midnight | His campaigns keep sending without manual nudges |
| `campaigns/process` | Drains `campaign_send_queue` | Step 4 above |
| `precompute-briefings` | Generates Jarvis briefings | §5.1 |
| `ab-auto-promote` | Picks A/B winner | Step 2 — set and forget |
| `process-webhooks` | Drains Gmail Pub/Sub backlog | Inbound replies appear in inbox quickly |
| `renew-gmail-watches` | Keeps Gmail push subscription alive | Without this, replies stop appearing |
| `sync-imap` | IMAP fallback for non-Gmail mailboxes | Custom-domain accounts still sync |
| `mine-templates` (Mon 03:00 UTC) | Refreshes template library | Step 5 |
| `cleanup-tracking` | Trims old tracking rows | DB hygiene |

> **Local note.** Crons run **only on Vercel production**. Locally, the inbox/campaigns update only after a manual sync. Force-sync: `POST /api/sync` from a logged-in browser.

---

## 7. The "one screen" that has everything

When a SALES user opens a thread, the right panel pulls together:
- **Contact card**: stage, lead score, open/click counts, lifetime revenue, source, account manager.
- **Project + revenue history**: `projects` joined on `clientId` — `projectName`, `projectValue`, `paidStatus`, `dueDate`.
- **Activity log**: every touchpoint, chronological.
- **Tracking strip**: when delivered, when opened (and how many times), which links clicked.
- **Jarvis suggestion** button: fills `InlineReply` with a Claude-drafted response that's context-aware of all of the above.

Every field is sourced from tables listed in §2.

---

## 8. Recommended daily routine

1. **`/dashboard`** — Jarvis briefing: top deals, opens-without-reply, follow-ups due today.
2. **`/my-queue`** — confirm today's outbound campaign sends.
3. **`/opportunities`** filtered to WARM_LEAD + LEAD — deals to call / personal-message.
4. **`/`** (inbox) — handle replies; Jarvis-draft → edit → send; move stage on win/loss; add to `/projects` on OFFER_ACCEPTED.
5. End of day: **`/analytics`** for own send/open/reply rates; tweak underperforming campaign copy in **`/campaigns`** — A/B auto-promote will pick the winner overnight.

---

## 9. Verification checklist (for the engineer reviewing this)

- [ ] SALES role gating: log in as a SALES user, sidebar matches §1.
- [ ] `getAccessibleGmailAccountIds(<sales-user-id>)` returns only assigned mailbox IDs (Node REPL against the Supabase service-role client).
- [ ] `/jarvis` briefing renders SALES-scoped numbers (sent/received limited to assigned mailboxes).
- [ ] Add a step with `subsequenceTrigger=OPENED_NO_REPLY`, send a test, confirm the queue row only fires after `openedAt` is set + delay elapses.

---

## 10. Known gaps (for a "next build" backlog)

- **No enrichment on cold leads** — no LinkedIn / Apollo lookup before first send.
- **No meeting booking** — OFFER_ACCEPTED doesn't propose a calendar slot; manual handoff to projects.
- **No deliverability dashboard for SALES users** — bounce / spam-complaint trend per assigned mailbox isn't surfaced (data exists in `gmail_accounts.healthScore` and bounce events but is not graphed for SALES).
- **No unsubscribe self-service for prospects** — the `unsubscribe.ts` helper exists but no public landing page binds it to incoming campaign clicks.
- **No per-template performance leaderboard** — `email_template.usageCount` exists but open / reply rate per template isn't computed.
