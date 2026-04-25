# Jarvis Reply / Coach Mode — Failure Analysis & Permanent Fix

> **Status:** Spec → Shipping. Owner: Claude (2026-04-25).
> **Trigger incident:** User opened thread "Re: Kirsty + Callum Wedding Edits!" with a fresh inbound message at 12:43 AM. Jarvis side-panel showed `COACHING FEEDBACK` ("The reply looks good, follow up in 3 days…") instead of drafting a reply. The Reply / Coach toggle at the top of the panel did nothing when clicked.

---

## 1. What the user saw

| Expected | Actual |
|---|---|
| Inbound client message arrives → Jarvis drafts a reply. | Jarvis returned coaching feedback for the *previous* SENT message. |
| Click "Reply" tab in Jarvis panel header → forces draft mode. | Click does nothing. Panel stays in coaching mode. |
| Click "Coach" tab → forces coaching mode. | Click does nothing either way. The tabs are decorative. |

## 2. Root causes (three independent bugs, one screen)

### Bug A — Mode toggle is decorative

[`app/PageClient.tsx:123`](../app/PageClient.tsx#L123) declares `const [jarvisMode, setJarvisMode] = useState<'reply' | 'coach'>('reply');` and lines 671-672 render two buttons that flip that state. **But `jarvisMode` is never passed into `<JarvisSuggestionBox>`.** The child component decides its own mode purely from the server response ([`JarvisSuggestionBox.tsx:56`](../app/components/JarvisSuggestionBox.tsx#L56)). So the user has no way to override an incorrect auto-detect.

### Bug B — Mode auto-detect is fragile under sync race

In [`replySuggestionService.ts:426-427`](../src/services/replySuggestionService.ts#L426-L427):

```ts
const lastMessage = thread[thread.length - 1];
const isCoachingMode = lastMessage?.direction === 'SENT';
```

The `thread` is a snapshot of `email_messages` rows for that `thread_id` at query time. The Gmail webhook → `email_messages` insert is **not** transactional with the inbox UI's live thread display. When the user clicks Suggest Reply seconds after a new inbound, the inbox list (which can pull live from Gmail) shows it but `email_messages` may not yet have it. Result: the most recent row in the DB is still our previous SENT reply, mode flips to coaching. The coaching feedback text in the screenshot — *"The reply looks good, follow up in 3 days…"* — confirms it was reviewing our earlier "Awesome, thank you so much!" SENT message, not the new inbound.

### Bug C — Thread query returns the *oldest* 20, not the *newest* 20

[`jarvisActions.ts:91-97`](../src/actions/jarvisActions.ts#L91-L97):

```ts
let msgQuery = supabase
    .from('email_messages')
    .select('id, ...')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })
    .limit(20);
```

For threads with > 20 messages this returns the first 20 chronologically, **not** the most recent 20. Mode detection (`thread[length-1]`), prompt context, and "last received message" extraction all become wrong on long threads. We have at least one thread in production with 47 messages — silently broken today.

---

## 3. All failure modes worth solving (not just the visible ones)

| # | Scenario | Today's behavior | Risk |
|---|---|---|---|
| 1 | New inbound just landed; webhook still in flight | Coaching mode on previous SENT → user sees wrong panel | High (recurring) |
| 2 | Thread has >20 messages | Mode + prompt context use *oldest* 20 → totally wrong | High (silent) |
| 3 | User wants to coach an inbound (rare but valid: review the agent's old reply against new context) | No way to force coach | Medium |
| 4 | User wants to draft a follow-up after a SENT message (most common cold-outreach case) | Coach is forced, no follow-up draft | High |
| 5 | Thread has only SENT messages (cold outreach we sent first, never replied) | Coach the cold opener | Medium — the agent often wants a follow-up draft |
| 6 | Thread has only RECEIVED messages (just-arrived inbound, we never replied) | Reply (correct) | OK |
| 7 | User toggles Reply→Coach repeatedly | No-op (Bug A) → no re-fetch | Medium |
| 8 | Switching threads while a Jarvis call is in flight | `activeThreadRef` already guards this — safe | OK |
| 9 | IMAP-only account where sync is every 15 min | Race window is up to 15 min, not seconds | Medium |
| 10 | Thread fetch fails entirely (RLS / accessible IDs empty) | Generic error | OK |
| 11 | Mode auto-detected silently — user can't tell it's a guess | UI shows "Coaching feedback" with "High conf." badge but doesn't say *auto-detected* | Medium UX trap |

We need a fix that closes 1, 2, 3, 4, 5, 7, 9, and 11 in one pass. 6, 8, 10 are already handled.

---

## 4. Solution design

### 4.1 Server contract

Extend the action signature with an optional explicit mode override:

```ts
suggestReplyAction(
    threadId: string,
    opts?: { forceMode?: 'reply' | 'coach' }
): Promise<{
    success: boolean;
    suggestion?: string;
    mode?: 'reply' | 'coaching';
    modeSource?: 'forced' | 'auto';   // NEW — UI surfaces this as a badge
    staleData?: boolean;              // NEW — true if email_threads.last_message_at > latest fetched message
    error?: string;
}>;
```

`forceMode === undefined` → auto-detect (today's behavior). `forceMode === 'reply' | 'coach'` → server respects the override and returns `modeSource: 'forced'`.

### 4.2 Query fix

Replace the broken `.order('sent_at', { ascending: true }).limit(20)` with newest-first then reverse for chronological prompt context:

```ts
const { data: rows } = await supabase.from('email_messages')
    .select('...')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: false })
    .limit(30);                                  // bumped from 20
const messages = (rows || []).slice().reverse(); // chronological for the prompt
```

This guarantees `messages[length-1]` is always the actual newest in the DB, regardless of total thread length. Bumping the limit from 20 → 30 is cheap and absorbs longer real-world threads.

### 4.3 Staleness check

After fetching messages, also fetch `email_threads.last_message_at` and the count of messages in `email_messages` for that thread. If `last_message_at > newest fetched message.sent_at`, the DB is behind reality. Set `staleData: true` in the response so the UI can show "⚠ Sync catching up — click Regenerate in a few seconds for the freshest version" and avoid silently producing a stale answer.

We do **not** auto-trigger a Gmail sync on the hot path — that adds 3-8s of latency to every Jarvis click. Stale is the exception; surfacing the hint is enough.

### 4.4 Client wiring

`<JarvisSuggestionBox>` accepts a new optional prop:

```ts
interface JarvisSuggestionBoxProps {
    threadId: string;
    forceMode?: 'reply' | 'coach' | null;   // null/undefined = auto
    onCopy: (suggestion: string) => void;
}
```

When `forceMode` changes (and is non-null), the component re-fetches with the override. When `null` (auto), it fetches once on `threadId` change like today.

[`PageClient.tsx`](../app/PageClient.tsx) passes `jarvisMode` directly. Adding an `'auto'` value to the existing `'reply' | 'coach'` state lets the user explicitly opt out of forcing — but since the natural default is auto, the simpler approach is: **first load = auto; clicking Reply or Coach = force**. We add a third small button labeled "Auto" so users can re-enter auto mode.

Updated state in PageClient:
```ts
const [jarvisMode, setJarvisMode] = useState<'auto' | 'reply' | 'coach'>('auto');
```

Three tabs: `Auto` (default) | `Reply` | `Coach`. Clicking any of them re-renders `<JarvisSuggestionBox forceMode={jarvisMode === 'auto' ? null : jarvisMode} />` and the box re-fetches.

### 4.5 UX feedback

Inside the suggestion card, add a small badge next to the existing "Coaching feedback" / "Suggested reply" label:

- `modeSource === 'auto'` → `· auto` in muted text
- `modeSource === 'forced'` → no badge (user knows they forced it)
- `staleData === true` → `· sync catching up` in warn color, with tooltip "The most recent inbound may not be in the database yet. Regenerate in a few seconds."

This makes the auto-detect visible without being noisy.

---

## 5. Implementation plan (ordered)

1. **`src/actions/jarvisActions.ts`** — extend `suggestReplyAction` signature, fix the query (desc + reverse + limit 30), add staleness check via a parallel fetch from `email_threads`.
2. **`src/services/replySuggestionService.ts`** — accept `opts?: { forceMode?: 'reply' | 'coach' }`, override `isCoachingMode` when set, return `modeSource` in the result.
3. **`app/components/JarvisSuggestionBox.tsx`** — accept `forceMode` and `staleData` (from result) props, refetch on `forceMode` change, render the `auto` and `sync catching up` badges.
4. **`app/PageClient.tsx`** — bump `jarvisMode` state to include `'auto'`, render three tabs, pass `forceMode` to the box.
5. **Manual smoke test** — open a thread with a recent inbound, verify auto detects reply mode; toggle to coach; toggle back to auto; switch threads; verify staleness hint by manually deleting the latest `email_messages` row for one thread (or use SQL to make `email_threads.last_message_at` newer than any `email_messages.sent_at`).
6. **Type-check** — `npx tsc --noEmit`.
7. **Update CLAUDE.md** — document the new prop API + staleness pattern + the limit/order fix.

## 6. Out of scope (deferred)

- Auto-triggering Gmail history sync on Jarvis click. Cost: 3-8s latency; benefit marginal once the staleness hint exists. Can be a Pro feature ("Force fresh sync") later.
- Realtime subscription so the box auto-refreshes when a new message lands while the panel is open. Nice-to-have, not blocking.
- Switching the auto-detect from "last message direction" to a richer signal (e.g. "is the thread currently waiting on us?" computed from gaps + send patterns). Today's heuristic is fine once the override exists.

## 7. Verification checklist (gate for "shipped")

- [x] Doc published.
- [ ] Server action accepts `forceMode`, query fix in place, staleness boolean returned.
- [ ] Service honors `forceMode` and returns `modeSource`.
- [ ] Component accepts `forceMode`, refetches on change, renders the auto/stale badges.
- [ ] `PageClient` exposes 3-tab toggle, default `auto`.
- [ ] `npx tsc --noEmit` clean.
- [ ] Manual test on the trigger thread: with a fresh inbound, auto picks `reply`; clicking Coach forces coaching; clicking Auto re-evaluates.
- [ ] Manual test on a thread with > 20 messages: mode + prompt now reflect the newest 30, not the oldest 20.
- [ ] CLAUDE.md updated with new prop API and the limit/order fix.

---

_Last updated: 2026-04-25._
