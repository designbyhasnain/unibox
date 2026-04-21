# NOT_INTERESTED Classification Bug — Root Cause Analysis & Fix Plan

## The Problem

Active, engaged leads are being tagged as "Dead" (NOT_INTERESTED) in the inbox. MAFFITI (Merily Lillevälja) — a hot lead who scheduled a Google Meet call — was shown as "Dead" because someone accidentally clicked "Not Interested" on one of her emails.

## Impact

- Hot leads appear as "Dead" in the inbox, causing sales reps to ignore them
- Future emails from blocked contacts are **silently dropped** during sync (never appear in inbox)
- No way to recover without manual database intervention
- No confirmation dialog or undo for this destructive action

## Root Cause Analysis

### Three problems found:

### 1. "Not Interested" button is a nuclear option (CRITICAL)

**File:** `src/actions/emailActions.ts` — `markAsNotInterestedAction()` (lines 899-937)

When a user clicks "Not Interested" on a single email, it does ALL of these at once:
- Adds the sender to `ignored_senders` table → **all future emails silently dropped during sync**
- Sets `pipeline_stage = 'NOT_INTERESTED'` on **ALL emails** from that sender (past + future)
- Sets `pipeline_stage = 'NOT_INTERESTED'` on the **contact** record

One misclick = contact is permanently dead + invisible.

### 2. Sticky NOT_INTERESTED prevents recovery (HIGH)

**File:** `src/services/emailSyncLogic.ts` — `handleEmailReceived()` (lines 335-338)

```typescript
if (contact?.pipeline_stage === 'NOT_INTERESTED') {
    newEmailStage = existingStage || 'NOT_INTERESTED';
}
```

Once a contact is NOT_INTERESTED, every new incoming email from them is also tagged NOT_INTERESTED. Even if they reply saying "Actually, let's do this!" — the system blocks promotion to LEAD.

### 3. Ignored sender list silently drops emails (HIGH)

**File:** `src/services/gmailSyncService.ts` (lines 720, 912)

The `ignored_senders` table causes the sync service to skip all emails from that address. No notification, no log, no way to know emails are being lost.

## What is NOT the problem

- **No automated keyword detection** — there is no code that scans email content for "not interested", "cancel", etc. and auto-sets NOT_INTERESTED
- **No AI classification bug** — the only path to NOT_INTERESTED is through explicit user action
- The `emailClassificationService.ts` only classifies email type (OUTREACH_FIRST, FOLLOW_UP, etc.), not pipeline stage

## Data Audit (April 21, 2026)

| Metric | Count |
|--------|-------|
| Contacts tagged NOT_INTERESTED | 0 (MAFFITI already fixed) |
| Emails tagged NOT_INTERESTED | 0 (already fixed) |
| Ignored senders | 4 (LinkedIn x2, AliExpress, Meezan Bank — all legitimate blocks) |

MAFFITI was the only misclassified contact. Fixed by:
1. Updated all her emails from NOT_INTERESTED → LEAD
2. Removed `info@maffiti.ee` from `ignored_senders`

## Fix Plan

### Fix 1: Add confirmation dialog (URGENT)

**File:** `app/PageClient.tsx` or `app/components/InboxComponents.tsx`

Before marking as Not Interested, show a confirmation dialog:
```
"This will block all future emails from [sender]. Are you sure?"
```

With two options:
- "Just hide this thread" — only hides the current thread, doesn't block
- "Block sender permanently" — current behavior

### Fix 2: Separate "Not Interested" from "Block Sender"

**File:** `src/actions/emailActions.ts` — `markAsNotInterestedAction()`

Split into two actions:
1. **markAsNotInterested()** — Sets contact + emails to NOT_INTERESTED but does NOT add to `ignored_senders`. Future emails still sync.
2. **blockSender()** — Adds to `ignored_senders` AND sets NOT_INTERESTED. Used for spam/promotional senders.

### Fix 3: Allow re-engagement to override NOT_INTERESTED

**File:** `src/services/emailSyncLogic.ts` (lines 335-338)

Change from:
```typescript
if (contact?.pipeline_stage === 'NOT_INTERESTED') {
    newEmailStage = existingStage || 'NOT_INTERESTED';
}
```

To:
```typescript
if (contact?.pipeline_stage === 'NOT_INTERESTED') {
    // If they're replying to our outreach, they're re-engaging — promote to LEAD
    if (hasOutgoing) {
        newEmailStage = 'LEAD';
        // Also update the contact
        await supabase.from('contacts').update({ pipeline_stage: 'LEAD' }).eq('id', contact.id);
    } else {
        newEmailStage = existingStage || 'NOT_INTERESTED';
    }
}
```

### Fix 4: Add "Undo" for Not Interested

**File:** `app/PageClient.tsx`

After marking as Not Interested, show an undo toast (like Gmail's "Conversation archived. Undo") for 10 seconds. If clicked, reverse the action.

### Fix 5: Add visual warning for ignored senders

**File:** `app/components/InboxComponents.tsx`

In the contact detail panel, show a warning if the contact is in `ignored_senders`:
```
⚠️ This sender is blocked. New emails from them will not appear.
[Unblock]
```

## Implementation Priority

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | Confirmation dialog | 30 min | Prevents future accidents |
| 2 | Separate Not Interested vs Block | 1 hour | Correct behavior |
| 3 | Re-engagement override | 30 min | Auto-recovers hot leads |
| 4 | Undo toast | 30 min | Safety net |
| 5 | Ignored sender warning | 20 min | Visibility |

## How to test

1. Pick a test contact (e.g., create a dummy contact)
2. Click "Not Interested" → verify confirmation appears
3. Confirm → verify contact is NOT_INTERESTED but NOT in ignored_senders
4. Send a test reply from that contact → verify they get promoted back to LEAD
5. Use "Block Sender" instead → verify they ARE in ignored_senders
6. Click "Undo" within 10 seconds → verify everything is reversed
