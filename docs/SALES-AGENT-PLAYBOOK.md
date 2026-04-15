# Unibox Sales Agent Playbook

**Audience:** Sales Agents (Account Managers), Team Leads, Operations
**Version:** 1.0
**Last updated:** 2026-04-16

This document is the operational handbook for sales agents working in Unibox. It covers the daily workflow, how the software supports each step, how we assign work, how we measure effectiveness, and how data quality is maintained as a natural by-product of doing the job — not as a separate chore.

---

## Part 1 — The Business Context

Wedits provides outsourced wedding video editing to production companies worldwide. The sales function exists to:

1. **Discover new filmmakers** who may need editing help (outreach).
2. **Nurture warm leads** through a pipeline until they accept an offer.
3. **Retain existing clients** by maintaining regular contact and fast response on replies.
4. **Collect payment** and track project production from brief to delivery.

Every sales agent is a steward of a portfolio of Gmail accounts (personas), contacts, and deals. Their job is to produce revenue at a predictable rate from the assets assigned to them.

---

## Part 2 — Role Definition

### The Sales Agent (SALES role)

**Primary goals:**
- Keep response time on warm/lead replies under **2 hours during working window**
- Send **new outreach to 80–120 fresh leads per day** per assigned Gmail account (warmup-adjusted)
- Convert at least **2% of contacted leads** into LEAD stage per month
- Maintain a **clean pipeline** (no ghosts older than 30 days without a win-back attempt)

**Daily commitments:**
- Clear the Today's Actions queue before end of day
- Log any off-platform interactions (calls, Slack, WhatsApp) on the contact's timeline
- Mark projects as DELIVERED / PAID as soon as you confirm with production
- Flag any contact that feels off (wrong industry, duplicate, spam) for admin review

**What Sales agents cannot do:**
- Change RBAC roles, invite users, or access `/team`, `/finance`, `/intelligence`
- Connect or disconnect Gmail accounts
- View contacts assigned to other agents

### The Admin / Account Manager (ADMIN role)

- Assigns Gmail accounts and contact portfolios to SALES agents
- Reviews the weekly QA scorecard (Part 13)
- Approves campaign launches and new templates
- Owns the data quality dashboard

---

## Part 3 — The Daily Workflow (the "4-hour day")

A productive agent's day is structured, repeatable, and predictable. The software is designed so that every step advances both a business outcome **and** the underlying data quality.

| Time Block | Duration | Action | Page |
|------------|----------|--------|------|
| **09:00 — 09:30** | 30 min | Morning Briefing — review overnight replies, campaign performance, urgent actions | `/dashboard` |
| **09:30 — 11:00** | 90 min | **Reply Sprint** — clear every Reply Now card in today's queue | `/actions` |
| **11:00 — 12:00** | 60 min | **Follow-up block** — process all Follow Up + Win Back cards | `/actions` (filtered) |
| **12:00 — 12:30** | 30 min | Lunch / break |
| **12:30 — 14:00** | 90 min | **New Outreach block** — launch fresh cold campaigns, review new leads | `/campaigns`, `/clients?tab=new-leads` |
| **14:00 — 15:30** | 90 min | **Pipeline grooming** — update stages, log calls, link orphan projects (5/day target) | `/my-projects`, `/link-projects` |
| **15:30 — 16:00** | 30 min | **Payment check-ins** — chase unpaid invoices, mark paid projects, confirm delivery | `/my-projects?filter=unpaid` |
| **16:00 — 16:30** | 30 min | **End-of-day huddle** — log outcomes, set tomorrow's intent, review Jarvis briefing | `/jarvis` |

The entire structure is designed so that **the queue empties to zero by 16:00**. If it doesn't, the agent is either over-assigned or stuck on a single deal — both signals for the admin.

---

## Part 4 — How Each Page Maps to the Workflow

### `/dashboard` — Mission Control
- **What they see:** KPI cards (reply-now count, follow-up count, revenue MTD, open rate, top 5 unpaid invoices, top 5 needs-reply), monthly revenue chart, recent projects, pipeline funnel.
- **What it teaches them:** "These are the numbers I'm accountable for by end of month."
- **Data fix it produces:** Clicking any KPI card filters the related list — every click on "Needs Reply" surfaces a contact; if the agent replies, we know that contact is active.

### `/actions` — Today's Actions (the reply-first surface)
This is the most important page in the app for agents. It ranks every contact by urgency and shows only what requires action today.

**Four queue types:**
1. **Reply Now** — client replied, we haven't responded. Urgency = critical.
2. **New Leads** — added in last 48h, never emailed. Urgency = high.
3. **Follow Up** — we sent, no reply, 3–14 days ago. Urgency = medium.
4. **Win Back** — was engaged (5+ replies), silent 30+ days. Urgency = low.

**Expanded card (click any row):**
- Shows the last received email (blue border) with subject and preview
- Shows our last sent email (grey border) for context
- Inline reply composer with the correct Gmail account auto-selected
- Cmd+Enter to send

**Data fix it produces:**
- Every click loads the 3-tier email lookup (contact_id → email fallback → self-heal), which backfills `contact_id` on any orphan emails matching the contact's address.
- Sending a reply marks the action as DONE, which clears `next_followup_at` on the contact.
- Snoozing sets `next_followup_at` to a future date so the card disappears until due.

### `/clients` — Portfolio View
- Lists the agent's contacts with pipeline stage, lead score, last contact date, revenue to date.
- Filter tabs: All · New Leads (48h) · Cold · Contacted · Warm · Offer · Closed · Not Interested.
- Sort: lead score, days since last contact, revenue, created date.

**Data fix it produces:** Clicking into a client opens the detail page, which runs the same 3-tier email lookup. Over time, every client the agent visits gets its historical emails re-linked.

### `/clients/[id]` — The Client Detail
- Timeline of all emails and activity
- Linked projects with revenue and payment status
- Quick-edit fields: name, company, phone, priority, notes
- "Add Project" button
- Tags the agent can apply (e.g. `high-ltv`, `slow-payer`, `referral-source`)

**Data fix it produces:**
- Every time a field is edited, the contact becomes "enriched" — we know a human verified it.
- Adding a project through this page auto-sets `client_id` correctly — no orphans created.

### `/my-projects` — The Project Tracker (Notion-style editing)
- All projects attributed to the agent's clients
- Inline editable: project name, value, status, paid/unpaid, delivery date
- Status dropdown: Not Started → In Progress → In Review → Delivered → Cancelled
- Payment toggle: Unpaid → Paid
- Filters: Unpaid only · This month · Over $1k · By client

**Data fix it produces:**
- The agent updates status and payment as they speak with production and clients. Each edit brings `total_revenue`, `paid_revenue`, and `unpaid_amount` on the contact closer to truth.
- Deleting a duplicate project merges counts back to reality.

### `/link-projects` — Smart Linking (daily 5-minute task)
- Shows 343 orphaned projects with AI-suggested matches based on who the agent was emailing around the project date
- Two tabs: Orphaned Projects · Suspicious Links (projects linked to the wrong contact)
- One-click confirm or search-and-link

**Data fix it produces:** This is the **primary manual data-linking workflow**. Every confirmed link recalculates contact revenue. Target: 5 projects linked per agent per day = 50–75 per week across the team = 343 done in under two weeks.

### `/campaigns` + `/campaigns/new` — Outreach Engine
- Campaign builder with goals (book a call, introduce service, re-engage, referral ask)
- A/B variants per step, spintax, placeholders, location filters
- Daily send limits per account with warmup mode

**Data fix it produces:** Campaign enrollment creates `campaign_contacts` rows and attributes every sent email to the agent's Gmail account → keeps stats clean at source.

### `/templates` — The Reply Library
- Templates by category (cold, follow-up, warm, retargeting, proposal, invoice)
- Each template has a short name and preview
- Used from the inline reply composer ("Use template" button)

### `/jarvis` — The AI Assistant (voice + chat)
- Morning briefing: reads today's actions, top risks, top opportunities
- On-demand Q&A: "Who hasn't replied in 5 days?", "What's my pipeline value?", "Which clients owe me money?"
- Assesses decisions: "Should I give a discount to this client?" → Jarvis weighs historical LTV
- Touch it at the end of day to log outcomes verbally

---

## Part 5 — Email Assignment Strategy

### How many Gmail accounts per agent?

| Agent Experience | Accounts Assigned | Warmup Phase? | Daily Capacity |
|------------------|-------------------|---------------|----------------|
| New hire (week 1–2) | 2 | Yes | 40 sends / day total |
| Ramping (week 3–8) | 3–4 | Mix | 200 sends / day total |
| Established (month 3+) | 5–7 | Cruise | 500–1000 sends / day total |
| Senior | 8–10 | Cruise | 1500+ sends / day total |

**Rules:**
- Never more than **10 accounts per agent** — beyond that, response time suffers.
- Accounts must match the agent's working hours timezone (±3h) so clients get consistent reply speed.
- At least one account per major region the agent covers (see Part 6).

### How many contacts per agent?

A balanced portfolio looks like:
- **~1,500 total contacts** (the agent's "book")
- Of those:
  - 200 active leads (pipeline stages CONTACTED / WARM / LEAD / OFFER_ACCEPTED)
  - 50 paying clients
  - 1,250 cold or dormant (for win-back + referral later)
- Max **30 Reply Now cards in the queue on any morning.** If more, redistribute to another agent the same day.

### Current assignment baseline

- Shayan Ismail: 3 Gmail accounts, ~3,965 contacts assigned by email history + round-robin backfill. Currently seeing ~80 active action-queue items. This is **slightly over the recommended ceiling** — consider reducing or splitting.

---

## Part 6 — Regional Outreach Strategy

### Why region matters
Wedding season, pricing expectations, language/tone, and reply timing vary heavily by region. Running an agent across every region at once means nothing gets optimized.

### Regional assignment

Each Gmail account/persona should be assigned to **one primary region** and **one secondary region**:

| Region | Primary Pitch | Peak Season | Best Reply Window (agent local) |
|--------|---------------|-------------|---------------------------------|
| US East | Speed + premium quality | May–Oct | 09:00–11:00 + 16:00–18:00 ET |
| US West | Creative + cinematic | Apr–Oct | 10:00–12:00 + 17:00–19:00 PT |
| UK / Ireland | Professionalism + price | May–Sep | 09:00–11:00 + 14:00–16:00 GMT |
| Australia / NZ | 24h turnaround advantage | Oct–Mar | 09:00–11:00 + 15:00–17:00 AEST |
| Canada | Bilingual capability | May–Sep | 09:00–11:00 ET |
| Europe (DE/FR/IT/ES) | Localized editors | May–Sep | 10:00–12:00 CET |
| Middle East | Luxury event coverage | Year-round | 09:00–11:00 GST |

### How to filter by region in outreach
1. `/campaigns/new` → set the Location filter to a country/state
2. Set the daily limit proportional to your warmup stage
3. Schedule sends between **08:00–10:00 region-local time** — highest open rate
4. Track region performance in `/analytics` (grouped by location)

### Regional rotation rule
Never run two campaigns to the same region from two accounts on the same day. Stagger by 24 hours to avoid duplicate-sender fatigue for leads that bounce between accounts.

---

## Part 7 — Email Performance Evaluation

We treat every email like an ad: it has a cost (time + deliverability risk) and a conversion rate.

### What "working" means

A subject line or template is **working** if, over 100 sends:
- Open rate ≥ 45%
- Reply rate ≥ 8%
- Positive-reply rate (non-unsubscribe, non-auto-reply) ≥ 5%

### What "not working" means

Kill or rewrite if over 100 sends:
- Open rate < 25%
- Reply rate < 2%
- Unsubscribe rate > 1%
- Bounce rate > 3% (also pause the account)

### Where to find these numbers

| Metric | Page | Notes |
|--------|------|-------|
| Template performance | `/templates` (each template card) | Shows sends, opens, replies |
| Campaign variant A/B | `/campaigns/[id]` | Compare variants side by side |
| Agent average | `/analytics` → "By Sender" view | Warning badge if below baseline |
| Account deliverability | `/accounts` | Health score 0–100, red badge if <60 |

### Weekly evaluation ritual
Every **Friday 15:00**, the agent:
1. Opens `/analytics` filtered to their accounts, last 7 days
2. Takes a screenshot or note of the 3 worst subject lines
3. Proposes one variant change for the next week (logged in the template notes)
4. Drops any template with <2% reply rate across 3 weeks

---

## Part 8 — Client Habit Tracking (when to reach each client)

The system learns each client's communication rhythm so we can reach them at the moment they're most likely to reply.

### What we track per contact
- `preferred_reply_hour` (0–23) — median hour they reply
- `preferred_reply_day` (0–6) — median day they reply
- `avg_response_time_hours` — median time from our send to their reply
- `timezone_guess` — derived from `location` + reply timing

### How it's populated
- Every time the contact replies, we log the hour/day in a background job.
- After 3+ replies, the system starts suggesting send times on new outreach.
- The agent sees it on the client detail page as: **"Best time to reach: Tuesdays, 10am local"**.

### How the agent uses it
- In the inline reply composer, there's a **"Send at best time"** option. Clicking it queues the reply in the QStash send queue for the contact's preferred window.
- For urgent Reply Now cards, ignore the suggestion and reply immediately.
- For Follow Up and Win Back, **always** use the suggested time.

### When to override the system
- Contact says "I'm on vacation until X" → set `next_followup_at` to X + 2 days.
- Contact explicitly asks for WhatsApp/phone → add note, set `preferred_channel` to phone.
- Contact is a seasonal business (wedding videographer in off-season) → skip entirely until next season.

---

## Part 9 — Payment Tracking Workflow

Payment is the last step in the pipeline. Revenue only counts when paid, so the agent's job doesn't end at DELIVERED — it ends at PAID.

### States a project can be in
```
Not Started → In Progress → In Review → Delivered → Paid
                                              ↘ Cancelled
```

### How the agent tracks payment
1. On **delivery confirmation** from production (Slack/email), the agent sets status to **Delivered** in `/my-projects`.
2. Project auto-creates an invoice placeholder with `unpaid_amount` = `project_value`.
3. When the client pays, the agent flips the **Paid** toggle. System:
   - Moves value from `unpaid_amount` → `paid_revenue`
   - Logs activity: "Payment received $X"
   - If this was the client's first paid project, promotes them to `CLIENT` type
4. If unpaid for **7 days after delivery**, the project appears in the daily **Payment Check-in block** (15:30).
5. If unpaid for **30 days**, the project is flagged **Overdue** and appears in the admin's finance dashboard.

### What to say in a payment chase
Week 1 (gentle): "Hope you loved the final cut — when you get a moment, the invoice is attached."
Week 2 (nudge): "Checking in on the invoice from [date]. Let me know if anything is unclear."
Week 3 (firm): "We have a $X invoice outstanding from [date]. Can you confirm payment timing?"
Week 4 (escalate): Pass to admin for finance team pursuit.

### Data fix it produces
- Marking paid recalculates `total_revenue` and `unpaid_amount` on the contact
- Status history becomes the source of truth for the `/finance` dashboard
- Overdue counts drive the weekly admin QA review

---

## Part 10 — Project Production Tracking

### Who owns what
- **Sales agent:** owns the relationship and the deadline commitment
- **Production team:** owns the actual editing work and the delivery asset
- **Admin:** owns escalations when a deadline slips

### The agent's responsibilities on production
1. **Set the delivery date** when the project is created. No project should be saved without a `delivery_date`.
2. **Status updates** — whenever production gives a status, update in `/my-projects`. Do not wait.
3. **Client comms during production** — send at least one progress email when the project hits "In Review".
4. **Delivery hand-off** — send the final deliverable link, confirm receipt, ask for testimonial/referral.

### Status rules (what each means)
| Status | Who sets | Triggers |
|--------|----------|----------|
| Not Started | Agent (on create) | Default after brief received |
| In Progress | Agent (after production confirms pickup) | Lock delivery date |
| In Review | Production or agent | Progress email to client |
| Delivered | Agent (after client confirms) | Create invoice; move to paid tracking |
| Paid | Agent | Bump contact LTV, trigger testimonial ask |
| Cancelled | Agent (with reason in notes) | Remove from revenue; flag reason |

### Production capacity check
- Each editor has a weekly capacity (e.g. 10 projects/week).
- Before committing a delivery date, check `/resource-utilization` (admin page, or ask Jarvis: "Do we have capacity next week?").
- Never promise a date that exceeds 80% of available capacity.

---

## Part 11 — Data Quality as a Side Effect of Daily Work

This is the most important section. **We don't ask agents to clean data — we let them do their job and the software captures the signal.**

### The seven data-fix loops

**1. Reply Sprint fixes email-to-contact links**
Every expanded action card runs the 3-tier email lookup. Any orphan emails matching that contact's address are silently backfilled with `contact_id`.

**2. Client detail views fix the same thing**
Visiting `/clients/[id]` runs the same backfill for that specific contact.

**3. Marking "Done" fixes next-followup state**
Clearing an action card resets `next_followup_at` and `auto_followup_enabled` — killing zombie follow-ups.

**4. Project status updates fix revenue rollups**
Inline-editing project fields in `/my-projects` recalculates the contact's `total_revenue`, `paid_revenue`, `unpaid_amount` immediately.

**5. Link Projects fixes orphan projects**
5-per-day target on `/link-projects` converges the 343 orphans to zero in ~2 weeks without any "data cleanup day".

**6. Inline contact edits confirm identity**
Every name/company/phone edit on a client page marks the contact as human-verified. Badge turns green.

**7. Template "worked / didn't work" reactions train the library**
After each send, the agent can hit 👍 or 👎 on the template used. Over time, the template list self-sorts by reply rate.

### What's still manual (and why)
- **Duplicate contact merges** — high-risk, admin-only action
- **New contact creation for 649 remaining orphan senders** — agent submits suggestion, admin approves
- **Region reassignment** — affects commissions, admin-only

### The admin's data quality dashboard
A hidden page (`/admin/data-health` — to be built) shows:
- Orphan emails remaining (target: 0)
- Orphan projects remaining (target: 0)
- Contacts with stat drift (target: 0)
- Contacts with no human edits in 60 days (aging cohort)
- Agents with fewest `link-projects` confirmations this week

---

## Part 12 — UX Design Principles

These rules apply whenever we build or change a screen for sales agents.

### 1. One primary action per screen
Agents should never have to hunt. The biggest, brightest button is the action for 80% of visitors.
- Actions page → **Reply**
- Client detail → **Send email**
- My Projects → **Add Project**
- Campaigns → **New Campaign**

### 2. Keep the queue empty
If a queue has zero items, the screen celebrates ("All caught up!"). If it has items, the default sort is urgency descending.

### 3. Edit in place, not in modals
Anywhere the agent needs to change a value (project value, contact phone, status), let them click it and type. Modals are for multi-field commits only.

### 4. Every click should save
No "Save" buttons for single-field edits. Use debounced auto-save + subtle toast confirmation.

### 5. Show the history next to the input
When writing a reply, the last 2 messages are visible above the textarea. When updating a project status, recent activity is visible next to it.

### 6. Colors carry meaning
- **Red** = critical / overdue / urgent
- **Amber** = warning / due today / warm
- **Blue** = actionable / informational
- **Green** = success / paid / delivered
- **Grey** = archived / not interested / closed

Never use red for "info". Never use green for "warning".

### 7. Keyboard first
Every major action should have a shortcut. `Cmd+Enter` sends a reply. `J/K` moves through action cards. `E` opens the email composer.

### 8. Instrument everything
Every button logs an event. Every page load logs time-on-page. This is how we know Part 13 (QA) has real numbers.

---

## Part 13 — QA & Review Process

### Weekly QA scorecard (admin runs every Monday 10:00)

For each sales agent, the admin reviews:

| Metric | Target | Weight |
|--------|--------|--------|
| Action queue closure rate (Reply Now cleared same-day) | ≥ 95% | 25% |
| Average response time on Reply Now | < 2 hours | 15% |
| New leads contacted within 48h | ≥ 90% | 10% |
| Projects linked in `/link-projects` | ≥ 25 / week | 10% |
| Payment chases logged on overdue projects | 100% | 10% |
| Template engagement (avg reply rate across their templates) | ≥ 6% | 10% |
| Data edits on clients (human-verified signal) | ≥ 30 / week | 10% |
| Bounce rate on their accounts | < 3% | 10% |

Score = weighted average. ≥ 85 is green, 70–84 is amber, <70 triggers a 1:1.

### The 1:1 format
If an agent is in amber/red:
1. Admin opens `/analytics` filtered to that agent
2. Identifies which 2–3 metrics pulled them down
3. Shows the specific examples (which contacts weren't replied to, which projects never got linked)
4. Agrees on a corrective action for next week
5. Logs the 1:1 in the agent's note field in `/team`

### The spot check (random)
Twice a month, the admin randomly picks:
- 5 Reply Now cards from the past week → verifies the agent's reply was appropriate
- 3 projects marked Paid → verifies there's evidence of payment
- 2 projects marked Delivered → verifies delivery confirmation
- 1 template with poor metrics → checks whether it was retired

Spot-check failures get logged and weigh 5% extra on the next week's scorecard.

### The monthly portfolio review
On the 1st of every month, admin + agent review:
- Top 10 clients by LTV
- Bottom 20 cold leads (archive or re-engage?)
- Any contacts last touched >60 days that aren't archived
- Revenue target for the coming month

---

## Part 14 — KPIs & Success Metrics

### The one number the agent is measured on monthly
**Collected revenue attributable to their contacts** (`paid_revenue` on contacts where `account_manager_id = agent`).

### Supporting metrics (tracked daily, displayed on `/dashboard`)
| Metric | Definition | Healthy |
|--------|------------|---------|
| Reply-Now queue depth | Open Reply Now cards at 09:00 | ≤ 30 |
| Avg time-to-reply (24h rolling) | Median minutes from received → sent | ≤ 120 |
| Weekly outreach volume | Unique new contacts emailed | 400+ |
| Lead → Offer conversion | % of leads that reach OFFER_ACCEPTED | ≥ 15% |
| Offer → Paid conversion | % of offers that become paid projects | ≥ 60% |
| Unpaid invoice age (avg) | Mean days unpaid | ≤ 21 |
| Portfolio health score | Weighted combination of above | ≥ 75 |

### Monthly targets (for a fully-ramped agent)
- 2,000 outreach sends
- 30+ replies
- 8+ offers
- 5+ paid projects
- $8,000 collected revenue

---

## Appendix A — Quick Reference: "What page do I open to…"

| Task | Page |
|------|------|
| See what's urgent today | `/actions` |
| Reply to a client | `/actions` → click card → inline reply |
| View a client's full history | `/clients/[id]` |
| Update a project status | `/my-projects` |
| Chase an unpaid invoice | `/my-projects?filter=unpaid` |
| Link an orphan project | `/link-projects` |
| Launch a new cold campaign | `/campaigns/new` |
| See my numbers | `/dashboard` |
| Ask a question verbally | `/jarvis` |
| Clean up a template | `/templates` |
| Check account health | `/accounts` |

## Appendix B — Emergency playbook

| Situation | Action |
|-----------|--------|
| Account flagged for spam | Pause it immediately, tell admin, halt all sends from it for 72h |
| Client threatens legal | Escalate to admin, do not reply further |
| Cannot find a contact you know exists | Admin runs the data-health audit; contact may be under a duplicate |
| System shows 0 actions but you know you have replies | Hard refresh, check the Reply Now filter, ping admin if still empty |
| Project value changed but revenue didn't update | Trigger the recount script (admin-only) |

## Appendix C — The Data Self-Heal Contract

Every page the agent touches contributes to data health. Specifically:

- `/actions` → backfills `contact_id`
- `/clients/[id]` → backfills `contact_id`, marks contact as verified
- `/my-projects` → recalculates `total_revenue`, `paid_revenue`, `unpaid_amount`
- `/link-projects` → drops orphan project count
- `/campaigns/new` → creates new contacts cleanly (no orphans from day 1)

No agent should ever be told "please spend 30 minutes cleaning data". If that's needed, the software has failed.

---

**End of Playbook.**

Owner: Admin / Team Lead
Review cadence: Monthly
Next review: 2026-05-16
