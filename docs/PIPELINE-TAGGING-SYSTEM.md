# Pipeline Tagging System — Complete Overhaul Plan

## Current State

### Stages Available
| Stage | Label | Color | Auto-assigned? |
|-------|-------|-------|---------------|
| COLD_LEAD | Cold Prospect | Blue | Yes — CSV import, scraper, un-spam |
| CONTACTED | Contacted | Indigo | Yes — when we send first email |
| WARM_LEAD | Warm Lead | Orange | Yes — 2+ opens, no reply (hourly cron) |
| LEAD | Lead | Yellow | Yes — when they reply to our outreach |
| OFFER_ACCEPTED | Offer Accepted | Green | **No** — manual only |
| CLOSED | Closed Won | Purple | **No** — manual only |
| NOT_INTERESTED | Dead / Closed Lost | Red | **No** — manual only (but sticky forever) |

### Current Automatic Transitions
```
CSV/Scraper Import → COLD_LEAD
We send email → COLD_LEAD becomes CONTACTED
They open 2+ times → CONTACTED/COLD_LEAD becomes WARM_LEAD (hourly cron)
They reply → COLD_LEAD/CONTACTED/WARM_LEAD becomes LEAD
Campaign reply → auto-stop campaign, promote to LEAD
```

### What's Missing
1. **No keyword-based tagging** — system doesn't analyze email content to suggest stages
2. **No automatic OFFER_ACCEPTED** — even when client says "yes, let's do this"
3. **No automatic CLOSED** — even after project is created or payment received
4. **NOT_INTERESTED is a death sentence** — can never auto-recover
5. **No tag suggestions for existing data** — 25,000+ emails unanalyzed
6. **Acceptance keywords only log, never promote** — "sounds good", "agreed", etc. just create an activity log entry

---

## Proposed System

### A. Smart Keyword-Based Stage Suggestions

Analyze incoming emails and **suggest** (not auto-apply) stage changes based on content.

#### Keyword Categories

| Trigger | Suggested Stage | Keywords |
|---------|----------------|----------|
| Pricing inquiry | LEAD | "how much", "pricing", "rates", "cost", "quote", "budget", "what do you charge", "packages" |
| Positive response | LEAD | "interested", "sounds good", "tell me more", "let's talk", "I'd love to", "send me", "share" |
| Meeting scheduled | LEAD | "let's meet", "calendar", "schedule", "google meet", "zoom", "availability", "hop on a call" |
| Acceptance | OFFER_ACCEPTED | "let's do it", "let's proceed", "deal", "agreed", "sounds great", "I'm in", "let's lock it in", "book it", "go ahead", "send invoice", "payment" |
| File sharing | OFFER_ACCEPTED | "here are the files", "dropbox link", "google drive", "footage", "sent the files", "uploaded" |
| Rejection | NOT_INTERESTED | "not interested", "no thanks", "pass", "not right now", "too expensive", "already have", "unsubscribe" |
| Objection (soft) | *No change — flag only* | "not sure", "need to think", "maybe later", "tight budget" |
| Re-engagement | LEAD (override NOT_INTERESTED) | Any reply from a NOT_INTERESTED contact |

#### Implementation: `src/services/stageDetectionService.ts` (NEW)

```typescript
interface StageSignal {
    suggestedStage: PipelineStage;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    reason: string;
    keywords: string[];
}

function detectStageSignals(body: string, currentStage: string): StageSignal | null {
    // Word-boundary keyword matching (like existing ACCEPTANCE_KEYWORDS pattern)
    // Returns suggestion with confidence level
    // HIGH = multiple strong keywords (e.g., "send invoice" + "let's proceed")
    // MEDIUM = single strong keyword (e.g., "agreed")
    // LOW = weak signal (e.g., "maybe")
}
```

#### Rules:
1. **Never auto-downgrade** — if contact is LEAD, don't suggest CONTACTED
2. **Only suggest upgrades** — COLD→CONTACTED→WARM→LEAD→OFFER→CLOSED
3. **NOT_INTERESTED requires manual action** — never auto-tag, only suggest
4. **Re-engagement overrides** — if a NOT_INTERESTED contact replies, auto-promote to LEAD
5. **HIGH confidence = auto-apply** — e.g., "here are the files" from LEAD → auto-promote to OFFER_ACCEPTED
6. **MEDIUM/LOW confidence = suggest in Jarvis panel** — show "Jarvis thinks this might be an acceptance. Move to Offer Accepted?"

---

### B. Backfill Existing Data

Run a one-time scan of all existing emails to tag contacts correctly.

#### Script: `scripts/backfill-pipeline-stages.ts`

```
For each contact:
  1. Get all email threads (ordered by date)
  2. Check if we sent to them → at least CONTACTED
  3. Check if they replied → at least LEAD
  4. Check for acceptance keywords in their replies → flag for OFFER_ACCEPTED review
  5. Check if project exists → CLOSED
  6. Check open counts → WARM_LEAD if 2+ opens, no reply
  7. Skip contacts already at OFFER_ACCEPTED or CLOSED (don't downgrade)
```

#### Expected impact:
- Contacts with replies stuck at COLD_LEAD → promoted to LEAD
- Contacts we emailed stuck at COLD_LEAD → promoted to CONTACTED
- Contacts with 2+ opens → promoted to WARM_LEAD
- Contacts with projects → promoted to CLOSED

---

### C. Ongoing Classification (for new incoming emails)

#### File: `src/services/emailSyncLogic.ts` — Modify `handleEmailReceived()`

**Current flow:**
```
Default → COLD_LEAD
Has outgoing in thread → LEAD
Contact is NOT_INTERESTED → stays NOT_INTERESTED (BROKEN)
```

**New flow:**
```
Default → COLD_LEAD
Has outgoing in thread → LEAD
Contact is NOT_INTERESTED but replied → LEAD (RE-ENGAGEMENT)
Body has acceptance keywords (HIGH confidence) → OFFER_ACCEPTED
Body has pricing/meeting keywords → LEAD (if currently below LEAD)
Body has rejection keywords → flag for review (don't auto-tag NOT_INTERESTED)
```

#### Activity log entries for transparency:
```
"Stage auto-promoted: CONTACTED → LEAD (reply received)"
"Stage suggestion: LEAD → OFFER_ACCEPTED (keyword: 'let's proceed', confidence: HIGH)"
"Re-engagement detected: NOT_INTERESTED → LEAD (contact replied after being marked dead)"
```

---

### D. Manual Override Always Wins

The user can always change a stage manually. Manual changes:
1. Override any automatic classification
2. Cascade to all email messages from that contact
3. Log the change with reason: "Manual stage change by [user]"
4. If moving OUT of NOT_INTERESTED, remove from `ignored_senders`

---

### E. Stage Change UI Improvements

#### 1. Inline stage picker in thread header
Currently shows a static badge. Change to a clickable dropdown:
```
[● Lead ▾] → click → dropdown with all stages
```

#### 2. Jarvis stage suggestion card
When Jarvis detects a stage signal, show below the reply suggestion:
```
┌──────────────────────────────────────────┐
│ 💡 Stage suggestion                      │
│                                          │
│ Move to OFFER ACCEPTED?                  │
│ Reason: Client said "let's lock it in"   │
│                                          │
│ [Apply]  [Dismiss]                       │
└──────────────────────────────────────────┘
```

#### 3. Bulk stage management page
Add a view at `/clients` that shows:
- Contacts grouped by stage
- Filters: "Has replied but still COLD_LEAD" (misclassified)
- Filters: "NOT_INTERESTED but has recent activity" (re-engaged)
- Bulk select + change stage

---

## Implementation Order

### Phase 1: Fix the broken stuff (Day 1)
| Task | File | What |
|------|------|------|
| 1.1 | emailSyncLogic.ts | Allow NOT_INTERESTED re-engagement (reply → LEAD) |
| 1.2 | emailActions.ts | Separate "Not Interested" from "Block Sender" |
| 1.3 | emailActions.ts | Add confirmation dialog before Not Interested |
| 1.4 | emailSyncLogic.ts | Auto-promote to OFFER_ACCEPTED on HIGH confidence acceptance keywords |

### Phase 2: Backfill existing data (Day 1-2)
| Task | File | What |
|------|------|------|
| 2.1 | scripts/backfill-stages.ts | Scan all contacts, fix misclassified stages |
| 2.2 | — | Run backfill, review results |
| 2.3 | — | Manual review of flagged acceptance cases |

### Phase 3: Smart detection for new emails (Day 2-3)
| Task | File | What |
|------|------|------|
| 3.1 | stageDetectionService.ts | Create keyword detection engine |
| 3.2 | emailSyncLogic.ts | Integrate detection into sync flow |
| 3.3 | emailSyncLogic.ts | Add activity log for all auto-transitions |

### Phase 4: UI improvements (Day 3-4)
| Task | File | What |
|------|------|------|
| 4.1 | InboxComponents.tsx | Inline stage picker dropdown |
| 4.2 | JarvisSuggestionBox.tsx | Stage suggestion card |
| 4.3 | PageClient.tsx | Undo toast for Not Interested |
| 4.4 | clients/PageClient.tsx | Bulk stage management filters |

---

## Keyword Dictionary (Full Reference)

### ACCEPTANCE (→ OFFER_ACCEPTED)
```
let's do it, let's proceed, deal, agreed, sounds great, I'm in,
let's lock it in, book it, go ahead, send invoice, send payment link,
ready to start, let's get started, move forward, confirmed,
here are the files, uploaded the footage, shared the drive,
sent the dropbox, payment sent, paid, zelle sent
```

### INTEREST (→ LEAD)
```
interested, sounds good, tell me more, I'd love to, send me,
share your portfolio, how much, pricing, rates, cost, quote,
let's meet, schedule, calendar, availability, google meet, zoom,
free test, sample, demo, trial, show me, examples
```

### WARM SIGNALS (→ WARM_LEAD, if currently COLD/CONTACTED)
```
maybe, thinking about it, circling back, revisiting,
saw your email, been meaning to reply, apologies for the delay,
not right now but, keep in touch, follow up next month
```

### REJECTION (→ flag only, NOT auto-tagged)
```
not interested, no thanks, pass, stop emailing,
unsubscribe, remove me, don't contact, too expensive,
already have an editor, found someone, not looking
```

### FALSE POSITIVES TO AVOID
These should NOT trigger stage changes:
```
"cancel the meeting" → NOT rejection (just rescheduling)
"not sure about the timeline" → NOT rejection (just uncertainty)
"yes" in quoted text → check it's in the NEW message, not quoted reply
"sounds good" in signature → check it's in body, not sig block
```

---

## Testing Plan

### Test 1: Backfill accuracy
1. Run backfill on staging/copy of database
2. Compare before/after stage counts
3. Manually verify 20 random contacts for correctness

### Test 2: New email classification
1. Send test emails with acceptance keywords → verify OFFER_ACCEPTED
2. Send test emails with pricing questions → verify LEAD
3. Send test email from NOT_INTERESTED contact → verify re-engagement to LEAD
4. Send test email with "cancel meeting" → verify NO stage change (false positive avoided)

### Test 3: Manual override
1. Auto-tag contact as LEAD
2. Manually change to OFFER_ACCEPTED
3. Receive new email → verify stage stays OFFER_ACCEPTED (not downgraded)
4. Mark as NOT_INTERESTED → verify ignored_senders is NOT touched (separate action)

### Test 4: Edge cases
1. Email with both acceptance and rejection keywords → should NOT change stage (conflicting signals)
2. Very long email with keywords deep in quoted text → should only scan new message portion
3. Contact with no emails → should stay at current stage
4. Contact already CLOSED → should never be downgraded by any automation
