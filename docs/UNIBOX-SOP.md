# Unibox Standard Operating Procedures (SOP)

**Version:** 1.0  
**Last Updated:** April 14, 2026  
**Owner:** Hasnain Siddike  
**Applies To:** All Wedits sales agents and account managers

---

## Table of Contents

1. [Daily Workflow](#1-daily-workflow)
2. [Project Linking](#2-project-linking-sop)
3. [Data Accuracy & Hygiene](#3-data-accuracy--hygiene)
4. [Email Account Management](#4-email-account-management)
5. [Pipeline Management](#5-pipeline-management)
6. [Campaign Operations](#6-campaign-operations)
7. [Revenue & Payment Tracking](#7-revenue--payment-tracking)
8. [Client Ownership Rules](#8-client-ownership-rules)
9. [Jarvis AI Usage](#9-jarvis-ai-usage)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Daily Workflow

### Morning Routine (9:00 AM)

1. **Open Dashboard** (`/dashboard`)
   - Check KPI cards: Revenue, Paid, Unpaid, Clients
   - Review outreach metrics: emails sent today/week/month
   - Note monthly target progress

2. **Check Action Queue** (`/actions`)
   - Reply Now (CRITICAL) — respond within 2 hours
   - Follow Up — contacts who haven't replied in 3-14 days
   - Win Back — previously active contacts gone silent 30+ days
   - New Leads — contacts added in last 48 hours

3. **Link 5 Projects** (`/link-projects`)
   - Daily target: 5 orphaned projects matched to correct clients
   - Use AI suggestions first (contacts emailed by the AM around project date)
   - Manual search if suggestions don't match
   - Skip uncertain ones — come back later

4. **Check Inbox** (`/`)
   - Read and respond to client emails
   - Flag any new projects or payment confirmations

### End of Day

5. **Update Project Status** (`/my-projects`)
   - Mark completed projects as "Done"
   - Toggle paid status on collected payments
   - Add new projects from the day's conversations

6. **Review Pipeline** (`/clients`)
   - Move contacts to correct pipeline stage based on email interactions
   - Flag stale contacts (no activity > 30 days)

---

## 2. Project Linking SOP

### The Problem
Projects imported from Notion were auto-matched to contacts by name. This is wrong because:
- **Contacts = Filmmakers** (wedding videographers who are our clients)
- **Project names = Couple names** (bride & groom whose wedding was filmed)
- A filmmaker named "Nick" gets ALL projects with "Nick" in the couple name

### How to Link Projects Correctly

**Page:** `/link-projects`

**Tab 1: Orphaned Projects** (343 remaining)
These projects have no client linked.

1. Click a project card to expand
2. Look at the **context**: AM name, project date, status
3. Check **AI suggestions** — contacts emailed by that AM around the project date
4. If a suggestion matches, click to link
5. If not, **search manually** by the filmmaker's name/email
6. If unsure, click **Skip** — come back later

**How to identify the correct filmmaker:**
- The filmmaker is who SENT the footage to Wedits
- Check the project's Account Manager — who was handling this deal?
- Check emails around the project date — who was the AM talking to?
- The couple name in the project (e.g., "Sarah & Mike") is NOT the filmmaker

**Tab 2: Suspicious Links**
Contacts with many projects but very few emails — sign of misattribution.

1. Review each suspicious contact
2. Check: does the contact name appear as a bride/groom in their project names?
3. If YES → click **Unlink All** to put projects back in the orphaned queue
4. Then re-link them correctly through Tab 1

**Example of misattribution:**
```
Contact: "Amy & Nick | Sunday Love Photo & Film" (filmmaker)
Has 39 projects linked, but only 5 emails sent / 3 received

Projects include:
- "Lindsay and Nick" → Lindsay is a bride, Nick happens to be in the name
- "RILEE & NICK" → completely different couple
- "Nick & Brooke" → another couple

These should be unlinked and re-matched to the actual filmmakers.
```

**Daily Target:** 5 projects linked per day = all done in ~69 days

---

## 3. Data Accuracy & Hygiene

### Revenue Reconciliation

**Problem:** Contact-level revenue can drift from project-level revenue.

**When to check:**
- After linking/unlinking projects
- Monthly audit (first Monday of each month)
- When dashboard numbers look wrong

**How to fix:**
Linking a project to a contact via `/link-projects` automatically recalculates that contact's:
- `total_revenue` (sum of all project values)
- `unpaid_amount` (total - paid)
- `total_projects` (count)

### Contact Deduplication

**Signs of duplicates:**
- Same email appearing multiple times
- "Rafay Sarwar" appearing as multiple contacts (one per Gmail account)
- Same person with slightly different names

**Rule:** One contact per unique email address. The system should prevent duplicates, but if found, merge by keeping the one with more data.

### Pipeline Stage Accuracy

**Stages and rules:**
| Stage | Meaning | Auto-transition |
|-------|---------|-----------------|
| COLD_LEAD | Never contacted | Default for new contacts |
| CONTACTED | We sent first email | Auto: first email sent |
| WARM_LEAD | Opened 2+ emails, no reply | Auto: hourly detection |
| LEAD | Replied to our outreach | Auto: reply received |
| OFFER_ACCEPTED | Deal agreed | Manual only |
| CLOSED | Project delivered & paid | Manual only |
| NOT_INTERESTED | Explicitly declined | Manual only |

**Never use NOT_INTERESTED for:**
- Contacts who just haven't replied (they're CONTACTED)
- Contacts who went silent (they're still LEAD or CONTACTED)
- Only use when they explicitly say "no" or "remove me"

### Spam/Fake Contacts

**Signs:**
- Email domains like `mail.eu010.mlrcd.com`, `go.patientgrowthmechanism.com`
- Names like "emma emma" or auto-generated strings
- Emails with tracking codes (S8JG4E4, KHKA327)
- "Compliance Training" or "Goal Progress Chat" subjects

**Action:** Change pipeline stage to NOT_INTERESTED. Do NOT delete — keep for audit trail.

---

## 4. Email Account Management

### Account Types

| Type | Count | How it sends | Sync method |
|------|-------|-------------|-------------|
| Manual (SMTP) | 65 | Nodemailer via SMTP | IMAP polling |
| OAuth (Gmail) | 12 | Gmail API | Webhook + History API |

### Daily Send Limits
- Per account: 30 emails/day (configurable)
- Total capacity: 77 accounts × 30 = 2,310 emails/day
- Warmup mode: new accounts start at 20/day, increase by ~1.4/day

### Sync Health
- All accounts sync automatically via webhooks (OAuth) or polling (Manual)
- Health check runs hourly via cron (`/api/cron/automations`)
- Gmail watches renewed every 6 days (`/api/cron/renew-gmail-watches`)

### Manual Resync
- Go to `/accounts` → click Sync button on any account
- This triggers `POST /api/sync` → partial sync (History API)
- If history is expired, falls back to full sync

### OAuth Token Issues
- If an OAuth account shows ERROR status, go to `/accounts` → Reconnect
- The health cron auto-recovers most token issues
- If persistent, the Google app password may need regeneration

### Testing All Accounts
To verify all accounts can send:
```
Send test email from each account to your own email.
Manual accounts: use SMTP credentials
OAuth accounts: use Gmail API with refreshed tokens
```

---

## 5. Pipeline Management

### Stage Transitions

```
New Contact → COLD_LEAD (automatic)
First email sent → CONTACTED (automatic)
2+ opens, no reply → WARM_LEAD (auto, hourly check)
Reply received → LEAD (automatic)
Deal discussed → OFFER_ACCEPTED (manual)
Project completed + paid → CLOSED (manual)
Explicitly declined → NOT_INTERESTED (manual)
```

### Contact Ownership Rules

- Contact belongs to the AM whose Gmail accounts they've emailed with
- If multiple AMs emailed the same contact, the most recent wins
- ADMIN users see all contacts; SALES users only see their assigned contacts
- Assignment is based on `account_manager_id` on the contacts table

### Needs Reply Queue

Contacts in the "Needs Reply" section:
- Last message direction = RECEIVED (they messaged us)
- Pipeline stage is active (not CLOSED or NOT_INTERESTED)
- Not a noreply/mailer-daemon address

**Priority:** Reply within 2 hours for CRITICAL (replied today), 24 hours for HIGH.

---

## 6. Campaign Operations

### Campaign Types

| Type | Goal | Target Audience |
|------|------|----------------|
| Cold Outreach | First contact with new filmmakers | COLD_LEAD contacts |
| Follow Up | Re-engage non-responders | CONTACTED contacts, no reply |
| Retargeting | Win back past clients | Former CLOSED clients gone silent |
| Warm-up | Nurture leads over time | LEAD contacts |
| Closed-Won | Upsell/cross-sell | Active CLOSED clients |
| Location-Based | Target by region | Contacts in specific location |
| Seasonal | Holiday/event promotions | All relevant contacts |

### Campaign Best Practices

1. **Always personalize:** Use `{{first_name}}`, `{{company}}`, location references
2. **Use spintax:** `{Hi|Hello|Hey}` for variation across emails
3. **Daily limit:** 30 per account per day
4. **Multi-step sequences:** 3-4 steps with 3-7 day delays
5. **Auto-stop on reply:** Always enable — stops sending when they respond
6. **A/B test subjects:** Split test to find best performing subject lines

### Creating a Campaign

1. Go to `/campaigns/new`
2. Choose campaign type and goal
3. Select sending Gmail account
4. Build email sequence (steps with delays)
5. Select recipients (filter by stage, location)
6. Review and launch

### Campaign Monitoring

- Check `/campaigns` for active campaign status
- Monitor open rates, reply rates
- Pause campaigns that get negative responses
- Stop campaigns that hit bounce limits

---

## 7. Revenue & Payment Tracking

### Project Revenue Flow

```
Project Created → Value set → Work delivered → Payment collected → Mark PAID
```

### Payment Status

| Status | Meaning |
|--------|---------|
| UNPAID | Invoice sent, not yet paid |
| PAID | Full payment received |
| PARTIAL | Partial payment received |

### Tracking Unpaid

- Dashboard shows total unpaid amount
- `/my-projects` page — click payment badge to toggle PAID/UNPAID
- Priority: chase unpaid > 30 days first
- Top 5 unpaid clients shown on dashboard

### Revenue Accuracy Checklist

- [ ] All projects have a `project_value` set (not $0)
- [ ] All projects have correct `paid_status`
- [ ] All projects are linked to the correct client
- [ ] Contact `total_revenue` matches sum of their project values
- [ ] No orphaned projects (check `/link-projects`)

### Monthly Revenue Audit (First Monday)

1. Compare dashboard revenue vs manual spreadsheet
2. Check for orphaned projects (`/link-projects`)
3. Verify top 10 clients' revenue matches
4. Chase any unpaid > 30 days
5. Flag any projects with $0 value that should have pricing

---

## 8. Client Ownership Rules

### Who Owns a Client?

The Account Manager who most recently worked with the client owns them.

**Assignment hierarchy:**
1. Email-based: AM whose Gmail account has the most recent email with the client
2. Project-based: AM on the most recent project for that client
3. Manual: Admin can reassign via the clients page

### What Happens When Ownership Changes

- Client appears in the new AM's dashboard, action queue, and client list
- Old AM no longer sees the client
- Historical revenue stays attributed to whoever earned it
- Email history stays with the client regardless of AM

### Rules for SALES Users

- Can only see contacts where `account_manager_id` = their user ID
- Can only see projects where `account_manager_id` = their user ID
- Can only send emails from their assigned Gmail accounts
- Cannot access Team, Intelligence, or Finance pages

---

## 9. Jarvis AI Usage

### Voice Mode

1. Click the **robot orb** (top-right corner, visible on every page)
2. Full-screen overlay opens with glowing orb
3. Tap the orb → speak your question
4. Jarvis thinks → responds with voice
5. Tap while speaking to interrupt
6. X to close

### Text Mode

1. Go to `/jarvis`
2. Type questions in the chat box
3. Enable voice output with the speaker button (LOCAL = free browser voice, AI = ElevenLabs)

### What Jarvis Knows

Jarvis has embedded knowledge of:
- All revenue data ($367K total, monthly breakdown)
- Full pipeline (12,913 contacts across all stages)
- Top clients and their revenue
- AM team structure and portfolios
- Email capacity (77 accounts, 2,310/day)
- Pricing by region

### When Jarvis Uses Tools

For general questions ("how's business?", "what's our revenue?") → answers from memory, no tool call.

For specific lookups → uses CRM tools:
- "Search for Amy" → `search_contacts`
- "Brief me" → `get_morning_briefing`
- "Financial health?" → `get_financial_health`
- "Create campaign for Australia" → `create_campaign`
- "Should we take a $600 LA project?" → `assess_project_decision`

### Example Questions

- "Good morning, brief me"
- "How's Shayan doing?"
- "Who are our top unpaid clients?"
- "Should we take a $500 project from UK?"
- "Create a cold outreach campaign for New Zealand"
- "What's our daily email capacity?"
- "How's our financial health?"
- "Who should we follow up with today?"

---

## 10. Troubleshooting

### Dashboard Shows $0 Revenue

**Cause:** SALES user has no contacts assigned, or projects not linked.
**Fix:** Check `/my-projects` — if empty, contact admin to assign contacts.

### Action Queue is Empty

**Cause:** Previously was a database column bug (`last_email_subject` didn't exist).
**Fix:** This has been fixed. Hard refresh the page. If still empty, check that contacts are assigned to your user.

### Emails Not Syncing

**Cause:** OAuth tokens expired or SMTP credentials wrong.
**Fix:** Go to `/accounts` → click Sync. If ERROR status, Reconnect the account through Google OAuth.

### Jarvis Says "AI Service Error"

**Cause:** Groq API context overflow — too many tool results.
**Fix:** Try a simpler question. Jarvis now has business data built-in, so most questions don't need tool calls.

### Projects Showing Wrong Client

**Cause:** Auto-matching by couple name instead of filmmaker name.
**Fix:** Go to `/link-projects` → Suspicious Links tab → Unlink All for that contact → Re-link correctly.

### Revenue Mismatch (Dashboard vs Projects)

**Cause:** Orphaned projects ($50K not linked to any contact) or misattributed projects.
**Fix:** Link orphaned projects via `/link-projects`. Revenue auto-recalculates on link.

### Can't See Other People's Data (SALES User)

**Expected behavior.** SALES users only see their own contacts, projects, and emails. Contact admin if you need access to specific data.

### Browser TTS Not Working

**Cause:** Chrome blocks autoplay audio.
**Fix:** Click the speaker button to enable, then interact with the page (click anywhere) before speaking. Chrome requires user interaction before playing audio.

---

## Appendix: Key Pages

| Page | URL | Purpose |
|------|-----|---------|
| Inbox | `/` | Read and respond to emails |
| Dashboard | `/dashboard` | KPIs, revenue, outreach metrics |
| My Projects | `/my-projects` | Manage projects, edit values, toggle payments |
| Clients | `/clients` | Pipeline management, client profiles |
| Link Projects | `/link-projects` | Match orphaned projects to correct clients |
| Actions | `/actions` | Daily action queue (reply, follow up, win back) |
| Campaigns | `/campaigns` | Email campaign management |
| New Campaign | `/campaigns/new` | Create and launch campaigns |
| Jarvis AI | `/jarvis` | AI assistant (text + voice) |
| Accounts | `/accounts` | Email account management and sync |

## Appendix: Database Tables

| Table | Purpose |
|-------|---------|
| `contacts` | All filmmakers/clients with pipeline stage, revenue, email stats |
| `projects` | Wedding editing projects with value, payment status, client link |
| `email_messages` | All synced emails with direction, contact link, tracking |
| `gmail_accounts` | Email accounts (OAuth + SMTP) with sync state |
| `campaigns` | Email campaign definitions with steps and variants |
| `campaign_contacts` | Enrollment of contacts in campaigns |
| `users` | Team members with roles (ADMIN/SALES/ACCOUNT_MANAGER) |
| `user_gmail_assignments` | Which Gmail accounts are assigned to which users |

---

**End of SOP Document**
