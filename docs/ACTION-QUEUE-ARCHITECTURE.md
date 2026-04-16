# Action Queue Architecture — Design Document

**Author:** System Architect
**Date:** 2026-04-16
**Status:** Proposal → Ready for implementation
**Scope:** `/actions` page, `actionQueueActions.ts`, `ActionCard.tsx`, `emailSyncLogic.ts`

---

## 1. The Problem Statement

The Today's Actions queue — the single most important surface for a sales agent — is broken in a way that destroys trust. It shows contacts that have already been replied to, contacts that are automated notification services, and contacts whose conversation context is stale or misleading.

When a sales agent opens the page and sees 50 items in "Reply Now," but 30 of them are ghosts (already replied, junk, or stale), they stop trusting the queue entirely. They fall back to scanning Gmail directly, which defeats the purpose of the CRM. **A queue the user doesn't trust is worse than no queue at all.**

### The Five Broken Things

| # | Problem | User Experience | Root Cause |
|---|---------|----------------|------------|
| 1 | Contacts already replied to still appear in Reply Now | Agent wastes time expanding cards they already handled | `last_message_direction` is a cached stat that goes stale; validation fallback returns "keep" when `contact_id` isn't linked |
| 2 | Notification services (Mailsuite, Calendly, Slack) appear as urgent contacts | Agent sees fake urgency, learns to ignore real urgency | No blocklist for automated sender patterns |
| 3 | Conversation preview shows unrelated SENT/RECEIVED emails | Agent can't understand the context before replying | `lastReceived` and `lastSent` picked independently by direction, not by thread |
| 4 | "From" account not pre-selected | Agent has to manually pick from a dropdown every time | `suggestedAccountId` returned by server may not be in the SALES user's assigned account list |
| 5 | Timestamps both show "2h ago" | Agent can't tell which message came first | `timeAgo()` rounds to the same unit for close timestamps |

### Why This Matters (Business Impact)

- **Reply speed is the #1 predictor of conversion.** A 2-hour reply beats a 24-hour reply by 3x in our data.
- **50 stale items = 25 minutes wasted per day** (30 seconds per stale card × 50 items).
- **Trust erosion compounds.** Once an agent stops checking the queue daily, recovery takes weeks.

---

## 2. The Architecture Today (What's Wrong)

```
                    ┌──────────────────────┐
                    │   contacts table      │
                    │                       │
                    │  last_message_direction│ ← CACHED, goes stale
                    │  total_emails_sent    │ ← CACHED, can drift
                    │  total_emails_received│ ← CACHED, can drift
                    │  days_since_last_contact│← CACHED, never auto-updates
                    └──────────┬───────────┘
                               │
                    getActionQueueAction()
                               │
                    ┌──────────▼───────────┐
                    │  SELECT * FROM contacts│
                    │  WHERE last_message_   │
                    │  direction = 'RECEIVED'│ ← Trusts cached stat blindly
                    │  AND total_emails_     │
                    │  received > 0          │
                    └──────────┬───────────┘
                               │
                    Validation layer (added recently)
                               │
                    ┌──────────▼───────────┐
                    │  For each contact:    │
                    │  SELECT direction     │
                    │  FROM email_messages   │
                    │  WHERE contact_id = ?  │ ← FAILS when contact_id is NULL
                    │  ORDER BY sent_at DESC │
                    │  LIMIT 1              │
                    └──────────┬───────────┘
                               │
                    Falls back to valid=true  ← THE BUG: assumes "keep" on failure
```

### Why contact_id Is Often NULL

The `email_messages.contact_id` field is nullable. During Gmail sync:
1. The sync extracts the sender/recipient email from raw headers
2. It looks up a contact by that email
3. If the contact doesn't exist yet, it creates one
4. The `contact_id` is set on the email_message row

But this breaks when:
- The contact was created AFTER the emails were synced (bulk import, CSV upload, manual creation)
- The sync hit a rate limit or timeout and skipped the contact lookup
- The email header parsing extracted a different format than what's stored in `contacts.email`
- A previous bug (self-referential contacts) caused the wrong `contact_id` to be set, and the FK SetNull on delete nulled them out

**Result:** ~4,815 email_messages still have `contact_id = NULL` (4.4% of 108,630). For contacts whose emails are in that 4.4%, the validation query returns nothing, and they stay in the queue regardless of actual state.

---

## 3. The Architecture We Need

### Design Principles

1. **Never trust cached stats for user-facing decisions.** Use them for fast filtering, but validate against source of truth before displaying.
2. **Fail closed, not open.** If we can't determine whether a contact needs a reply, exclude it from the queue (false negative is better than false positive — a missed follow-up is recoverable; a phantom action item erodes trust).
3. **Self-heal on every read.** Every time we query the action queue, fix any stale data we find. The system should converge to correct state through normal usage.
4. **The queue is a contract.** Every item in it is a promise: "this contact needs your attention RIGHT NOW." Breaking that promise is worse than having an empty queue.

### The New Flow

```
                    ┌──────────────────────┐
                    │   contacts table      │
                    │  (cached stats used   │
                    │   for FAST FILTER     │
                    │   only — never shown  │
                    │   to user directly)   │
                    └──────────┬───────────┘
                               │
                    Step 1: Fast filter (same as before)
                    SELECT WHERE last_message_direction = 'RECEIVED'
                    LIMIT 50 (overfetch to account for filtering)
                               │
                    ┌──────────▼───────────┐
                    │  Step 2: Validate     │
                    │  against truth        │
                    │                       │
                    │  For each candidate:  │
                    │  ┌─────────────────┐  │
                    │  │ Try contact_id   │  │
                    │  │ If no result →   │  │
                    │  │ Try ILIKE email  │  │ ← NEW: fallback to email match
                    │  │ If still no →    │  │
                    │  │ EXCLUDE from     │  │ ← NEW: fail closed
                    │  │ queue            │  │
                    │  └─────────────────┘  │
                    └──────────┬───────────┘
                               │
                    Step 3: Self-heal
                    Fix last_message_direction on stale contacts
                    Backfill contact_id on orphan emails found
                               │
                    ┌──────────▼───────────┐
                    │  Step 4: Return only  │
                    │  validated items      │
                    │  (max 30)             │
                    └──────────────────────┘
```

### The Validation Query (Detailed)

For each candidate contact from the fast filter:

```
TIER 1: SELECT direction FROM email_messages
        WHERE contact_id = {contactId}
        ORDER BY sent_at DESC LIMIT 1

        → If result.direction = 'RECEIVED' → KEEP (valid action item)
        → If result.direction = 'SENT' → DROP (we already replied)
           + Self-heal: UPDATE contacts SET last_message_direction = 'SENT'
        → If no result → go to TIER 2

TIER 2: Fetch contact.email, then:
        SELECT direction, id FROM email_messages
        WHERE from_email ILIKE '%{email}%'
           OR to_email ILIKE '%{email}%'
        ORDER BY sent_at DESC LIMIT 1

        → If result.direction = 'RECEIVED' → KEEP
           + Self-heal: UPDATE email_messages SET contact_id = {contactId}
                        WHERE id = {result.id} AND contact_id IS NULL
        → If result.direction = 'SENT' → DROP
           + Self-heal: UPDATE contacts SET last_message_direction = 'SENT'
        → If no result → DROP (no email history = shouldn't be in Reply Now)
           + Self-heal: UPDATE contacts SET total_emails_received = 0
```

### Performance Budget

- Fast filter: 1 query, ~50ms
- Validation: 50 parallel queries × ~5ms each = ~100ms (TIER 1)
- TIER 2 fallback: ~30ms per contact (ILIKE is slower), but only runs for contacts without contact_id links
- Expected TIER 2 rate: <10% of candidates (decreasing over time as self-heal backfills)
- Total budget: <500ms for the full action queue load

---

## 4. Junk Contact Filtering

### The Blocklist Approach

Rather than maintaining a growing list of patterns, we use a two-layer filter:

**Layer 1: Email pattern blocklist (server-side, in the SQL query)**

```typescript
const JUNK_PATTERNS = [
    '%noreply%', '%no-reply%', '%mailer-daemon%', '%postmaster%',
    '%notification%', '%mailsuite%', '%mailtrack%', '%hubspot%',
    '%calendly%', '%zoom.us%', '%donotreply%', '%unsubscribe%',
    '%bounce%', '%feedback@%', '%support@%', '%billing@%',
    '%newsletter%', '%updates@%', '%digest@%', '%automated%',
];
```

Applied to all 4 queues (Reply Now, New Lead, Follow Up, Win Back) via:
```typescript
for (const pat of JUNK_PATTERNS) {
    query = query.not('email', 'ilike', pat);
}
```

**Layer 2: Domain blocklist (future enhancement)**

Maintain a `blocked_domains` table. During sync, check if the sender's domain is in this table before creating a contact. This is more scalable than pattern matching but requires a migration.

**Why not delete junk contacts?**
Some "junk" contacts may have legitimate email threads buried under them (e.g., a real conversation that got mixed in with Calendly notifications because the contact was auto-created from the notification sender). Deleting is risky. Filtering is safe and reversible.

---

## 5. Conversation Context Display

### The Problem

The ActionCard picks `lastReceived` and `lastSent` independently:
```typescript
const lastReceived = emails.find(e => e.direction === 'RECEIVED');
const lastSent = emails.find(e => e.direction === 'SENT');
```

Since emails are sorted by `sent_at DESC`, this gives you the most recent of each direction. But those two emails might be from completely different threads or topics.

**Example:**
- Thread A (project delivery): RECEIVED 2h ago — "the edit structure is wrong"
- Thread B (cold outreach): SENT 1h ago — "I deleted it by mistake, will resend"

The card shows Thread A's complaint next to Thread B's apology — making no contextual sense.

### The Fix

```typescript
// Find the latest RECEIVED email
const lastReceived = emails.find(e => e.direction === 'RECEIVED');

// Find the SENT email most related to it
const sentEmails = emails.filter(e => e.direction === 'SENT');
let lastSent;
if (lastReceived && sentEmails.length > 0) {
    // Prefer same thread (coherent conversation)
    const sameThread = sentEmails.find(
        e => e.thread_id && e.thread_id === lastReceived.thread_id
    );
    lastSent = sameThread || sentEmails[0]; // fallback to latest sent
} else {
    lastSent = sentEmails[0];
}
```

### Display Order

The card should always show:
1. **Their message first** (RECEIVED, blue border) — "what are they waiting for?"
2. **Our last response** (SENT, grey border) — "what did we say?"
3. **Reply composer** — "what should we say next?"

This mirrors the natural flow: read what they said → remember what you said → write your reply.

---

## 6. Account Auto-Selection

### The Problem

`getContactLastEmailsAction` returns a `gmailAccountId` from the most recent SENT email. But for SALES users, this account might not be in their assigned list (another agent sent the email, or the account was reassigned).

### The Fix (3-tier fallback)

```typescript
// Tier 1: Use the suggested account from the conversation
const suggestedId = result.gmailAccountId;
const matchesAvailable = suggestedId && accounts.some(a => a.id === suggestedId);

if (matchesAvailable) {
    setFromAccountId(suggestedId);
} else {
    // Tier 2: Find ANY account from the thread that the user has access to
    const threadAccountIds = result.emails
        .filter(e => e.gmail_account_id)
        .map(e => e.gmail_account_id);
    const matchFromThread = accounts.find(a => threadAccountIds.includes(a.id));

    // Tier 3: Fall back to user's first assigned account
    setFromAccountId(matchFromThread?.id || accounts[0]?.id || '');
}
```

### Why This Matters

"Select account..." as the default means:
- Agent has to think about which account to use (cognitive load)
- If they pick wrong, the client gets a reply from a stranger
- If they don't notice, the send button is disabled (no account selected)

Auto-selecting the right account removes this friction entirely.

---

## 7. Timestamp Precision

### The Problem

```
timeAgo("2026-04-15T14:30:00") → "2h ago"
timeAgo("2026-04-15T14:15:00") → "2h ago"
```

Two different times, same label. The agent can't tell which message came first.

### The Fix

| Time Range | Format | Example |
|------------|--------|---------|
| < 60 minutes | `{n}m ago` | `23m ago` |
| < 24 hours | `{n}h ago ({time})` | `3h ago (2:15 PM)` |
| < 7 days | `{day} {time}` | `Mon 10:30 AM` |
| < 30 days | `{n}d ago` | `12d ago` |
| ≥ 30 days | `{n}mo ago` | `3mo ago` |

The key insight: within 24 hours (the Reply Now zone), showing the actual clock time alongside the relative time gives the agent precise context. "3h ago (2:15 PM)" is instantly clear — "2h ago" is ambiguous.

---

## 8. Self-Healing Strategy

Every time the action queue loads, it should leave the database in a better state than it found it. This is the "self-healing" principle from the Sales Agent Playbook (Part 11).

### What Gets Healed on Each Queue Load

| Signal | Action | Effect |
|--------|--------|--------|
| Validation finds latest email is SENT but contact says RECEIVED | `UPDATE contacts SET last_message_direction = 'SENT'` | Contact drops from Reply Now permanently |
| TIER 2 fallback finds emails by ILIKE that aren't linked | `UPDATE email_messages SET contact_id = ?` | Next load uses fast TIER 1 path |
| Validation finds no emails at all but contact has received > 0 | `UPDATE contacts SET total_emails_received = 0` | Contact drops from Reply Now (total_emails_received filter) |
| Contact has last_message_direction = NULL | Skip (don't default to RECEIVED) | Prevents false positives |

### Convergence

- **Day 1:** ~50% of Reply Now items are stale → validation filters them out + heals them
- **Day 3:** ~10% stale (remaining unlinked contacts slowly getting healed)
- **Day 7:** ~1% stale (only truly edge-case contacts without any email history)
- **Day 14:** 0% stale (all contacts have been visited at least once)

---

## 9. Implementation Checklist

### Phase 1: Validation Fix (Critical — deploy immediately)

- [ ] Update validation to use ILIKE fallback when contact_id returns no results
- [ ] Change default from `valid: true` (fail open) to `valid: false` (fail closed) when no emails found
- [ ] Self-heal: backfill contact_id on emails found via ILIKE
- [ ] Self-heal: fix last_message_direction on stale contacts
- [ ] Self-heal: zero out total_emails_received when no emails exist
- [ ] Overfetch to 50 candidates, validate down to 30 results

### Phase 2: Display Quality (Deploy same day)

- [x] Thread-aware conversation pairing (same thread_id preferred)
- [x] 3-tier account auto-selection
- [x] Precision timestamps with clock time within 24h
- [x] Junk sender pattern blocklist (20 patterns, 4 queues)

### Phase 3: Ongoing Health (Deploy within 1 week)

- [ ] Add a `is_automated` boolean to contacts (set by sync, checked by action queue)
- [ ] Add a `last_validated_at` timestamp to contacts (track when stats were last verified)
- [ ] Cron job: nightly recount of email stats for contacts with `last_validated_at > 24h`
- [ ] Dashboard metric: "Action queue accuracy" (validated items / total candidates)

---

## 10. Success Metrics

After full implementation, measure:

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Reply Now accuracy | ~40% (30/50 stale) | ≥ 95% | validated / total candidates |
| Queue load time | ~200ms | < 500ms | Server action duration |
| Agent queue clear rate | Unknown (low trust) | ≥ 90% by EOD | Items completed / items at 9AM |
| Stale items per day | ~30 | < 3 | Self-heal counter |
| Account pre-selected rate | ~60% | 100% | Cards without "Select account..." |

---

## 11. What We're NOT Doing (And Why)

| Rejected Idea | Why |
|---------------|-----|
| Moving stats to a materialized view | Supabase doesn't support them natively; adds migration complexity |
| Real-time email_messages scan for the queue (no cached stats) | Too slow for 108K emails × 13K contacts |
| Deleting junk contacts | Risky — some have real threads buried. Filtering is safer and reversible |
| Building a separate "queue_items" table | Over-engineering — the current contact-based approach works once validation is solid |
| Pre-computing the queue on a cron | Adds staleness window; real-time validation is better for trust |

---

## 12. Technical Debt This Resolves

- **SEC-008** from KNOWN_ISSUES.md: Sync endpoint doesn't verify account access — the account auto-select now respects RBAC
- **PERF-001**: N+1 queries — the validation uses Promise.all for parallel execution
- **BUG: Self-referential contacts** — junk filter + sync guard prevent recurrence
- **BUG: Stale last_message_direction** — 3-layer defense (send update + sync update + query-time validation)
- **UX-003**: Hardcoded widths — timestamps now use responsive formatting

---

**End of document.**

Next step: Implement Phase 1 (validation fix with ILIKE fallback + fail closed).
