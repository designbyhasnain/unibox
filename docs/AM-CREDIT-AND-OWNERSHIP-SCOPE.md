# AM Credit & Ownership — Scope

> **Status:** ✅ Shipped 2026-04-26 (v1). Owner: Claude.
> **Original status:** Spec / awaiting approval (2026-04-25).
> **Implementation notes for v1** appear inline as `> 🛠 Implementation note:` blocks.
> **Why this exists:** Today, "who closed the deal" and "who owns the client now" are not separated by guardrails. Reassigning a contact (e.g. Abdur → Junaid Sabir) currently risks rewriting historical attribution if any code path also mutates `projects.account_manager_id`. We need to lock the historical record, log every transfer, and make the dual-ownership visible in the UI.

---

## 1. The principle (one-line)

**Historical credit is immutable. Current ownership is mutable. Two facts, two fields, never conflated.**

| Concept | Field | Mutability | Set by | Used for |
|---|---|---|---|---|
| Historical credit | `projects.account_manager_id` | Immutable once project is closed (`paid_status = PAID`) | Server, at close-time | Lifetime achieved revenue, commissions paid, leaderboards |
| Current ownership | `contacts.account_manager_id` | Mutable — moves with reassignments | Admin / sales lead | Active book size, "whose desk does this email land on" |

Worked example (the trigger scenario):
- Sales rep A sells a $10K project → on close, `projects.account_manager_id = A` (locked).
- A leaves → `contacts.account_manager_id` moves to B.
- B's "Active book" now includes that client. Future projects for that client will close with `projects.account_manager_id = B`.
- A's "Lifetime achieved" still shows the $10K.
- Total org revenue stays $10K (no double-counting), because revenue always sums through `projects.account_manager_id`, never through `contacts.account_manager_id`.

---

## 2. Current state audit

Confirmed correct (by structure, not by enforcement):
- `projects.account_manager_id` exists. [`prisma/schema.prisma:353`](../prisma/schema.prisma#L353).
- All revenue queries already filter on `projects.account_manager_id` — see [`src/actions/revenueActions.ts:22, 45, 68, 142`](../src/actions/revenueActions.ts).
- The 2026-04-25 cleanup scripts touched only `contacts.account_manager_id`; project records were preserved automatically.

Gaps:
1. **No write-guard on `projects.account_manager_id`.** Any future code path can quietly rewrite it. The 2026-04-25 reassignment was safe by accident, not by policy.
2. **No transfer audit trail.** When `contacts.account_manager_id` changes, nothing is recorded. We can't tell who moved a client, when, or why.
3. **No UI distinction.** Contact detail and the inbox relationship card both show one "Manager" — there is no surfaced concept of "closed by X, currently owned by Y".
4. **Many writers of `contacts.account_manager_id`.** Without a single chokepoint, adding the audit log means hunting down every site.

---

## 3. Scope — three changes

### 3.1 Schema lock — projects.account_manager_id immutable post-close

**Definition of "closed"** (one signal, the cleanest): `projects.paid_status = 'PAID'`. Optional secondary signal: `projects.final_review_status = 'APPROVED'`. We use only `paid_status = 'PAID'` for v1 — refunds (`PAID` → `PENDING`) implicitly re-open and unlock.

**Implementation: app-level guard, not a DB trigger.**
- App-level wins on error UX (we surface `"This project is paid; AM credit is locked. Use admin override + reason to change."`) and on flexibility (the "ADMIN can override with reason" workflow lives in app code).
- DB triggers are opaque and harder to test; postponed.

**Where the guard lives:** [`src/actions/projectActions.ts`](../src/actions/projectActions.ts) — the `updateProjectAction` (or equivalent setter for `account_manager_id`).

**Pseudo:**
```ts
// inside updateProjectAction or a new setProjectAccountManagerAction
if (changingAccountManagerId) {
    const project = await fetchProject(id);
    if (project.paid_status === 'PAID' && !options.adminOverride) {
        return { success: false, error: 'AM credit is locked on a paid project. Contact an admin to override.' };
    }
    if (project.paid_status === 'PAID' && options.adminOverride) {
        if (!options.reason || options.reason.length < 10) {
            return { success: false, error: 'Override requires a reason (min 10 chars).' };
        }
        // Log the override to activity_logs (see 3.2 schema).
    }
}
```

**Backfill question — what about existing projects with no closer recorded?**
- Audit query: count projects where `account_manager_id IS NULL`.
- For NULL rows: leave NULL. They count as "Unknown closer" in analytics (lifetime achieved tables can show an "Unattributed" bucket).
- For non-NULL rows: treat the existing value as the canonical closer (this is what reports already show; we're not retroactively changing it).
- No data backfill required for v1.

**Edge case — transfer-on-creation.** If a project is created today on a contact whose AM was just changed, `projects.account_manager_id` should default to the contact's *current* AM at creation, not historical. This is already the behaviour; we just call it out so it doesn't get "fixed".

### 3.2 Transfer log — every contact AM change → activity_logs row

**Activity log payload shape (intended):**
```ts
{
    contact_id,
    type: 'OWNERSHIP_TRANSFER',
    actor_user_id,                       // who did it
    payload: {
        from_user_id,  from_name,        // null if previously unassigned
        to_user_id,    to_name,          // null if newly unassigned
        reason: string | null,           // optional, surfaced in UI
        source: 'manual' | 'bulk' | 'invite' | 'admin_override',
    },
    created_at,
}
```

> 🛠 **Implementation note (v1, 2026-04-26):** The actual `activity_logs` table only has columns `id, action, performed_by, note, contact_id, project_id, created_at`. There is no JSONB `payload` column and no `type` column. The shipped storage maps to:
> - `type` → `action` (string: `'OWNERSHIP_TRANSFER'` or `'AM_CREDIT_OVERRIDE'`)
> - `actor_user_id` → `performed_by`
> - `payload{...}` → `note` as `JSON.stringify({ from_user_id, to_user_id, source, reason })` (parsed on read)
> - `from_name` / `to_name` are not stored — names are resolved at read time via a batched `users` lookup so the audit row stays canonical even if a user is renamed.
> A future Prisma migration could promote `note` → `payload JSONB` and add a `type` column for indexed queries; not required for v1.

**Single chokepoint.** Add `transferContactAction(contactId, newAmId, opts?: { reason?, source? })` in [`src/actions/contactDetailActions.ts`](../src/actions/contactDetailActions.ts). Migrate every caller of `contacts.update({ account_manager_id })` to use it.

**Audit of current writers** (must all be migrated):
- [`src/actions/contactDetailActions.ts`](../src/actions/contactDetailActions.ts) — manual edit on contact detail page.
- [`src/actions/importActions.ts:96`](../src/actions/importActions.ts#L96) — CSV import (set on creation, source = `'import'`).
- [`src/actions/campaignActions.ts:1330`](../src/actions/campaignActions.ts#L1330) — campaign enrollment (source = `'campaign'`).
- Any other site found by `grep -rn "account_manager_id" src/actions/` during implementation.
- One-off DB scripts (`scripts/*.mjs`) — opt them in via a `--no-log` flag with explicit comment when intentional (e.g. data migrations).

> 🛠 **Implementation note (v1, 2026-04-26):**
> - The single transfer-update writer is `transferContactAction` in [`src/actions/contactDetailActions.ts`](../src/actions/contactDetailActions.ts). [`updateClientAction`](../src/actions/clientActions.ts) defers the AM field to it.
> - Verified via `grep -rn "from('contacts').*\.update" src/ app/` — no other path mutates `account_manager_id`.
> - **Creation-side inserts** (`importActions.ts`, `campaignActions.ts:1330`, `scraperActions.ts:248`, `clientActions.ts:31/80`, `app/api/extension/clients/route.ts:73`) currently still set `account_manager_id` on insert without writing an audit row. They expose `recordOwnershipChange()` for future opt-in. v1.5 task: migrate these so every initial assignment also lands in `activity_logs` with the correct `source`. v1 ships without this — first-time assignments are not audited, only transfers.
> - The `OwnershipTransferSource` enum was extended with `'system'` for automated reassignments.

**Source enum** keeps reporting honest. Bulk reassignments (like the Abdur cleanup) get `source: 'bulk'` so they can be filtered out of "manual transfers" reports.

**Schema change:** none. The `activity_logs` table already exists. We're just adding a new `type` value. No migration.

### 3.3 UI — surface dual ownership where it matters

**Three surfaces.** All read from `projects.account_manager_id` (closer) and `contacts.account_manager_id` (current) and only render the dual line when they differ.

**A. Contact detail page** — [`app/clients/[id]/page.tsx`](../app/clients/[id]/page.tsx)
- Replace single "Manager" line with:
  ```
  Owner: Junaid          ← current
  History: 2 transfers ▾   (collapsible)
    • 2026-04-25  Abdur → Junaid (auto-bulk; "most-emailed inbox = filmsbyrafay")
    • 2026-02-12  unassigned → Abdur (CSV import)
  ```
- Pulled from `activity_logs WHERE type = 'OWNERSHIP_TRANSFER' AND contact_id = ? ORDER BY created_at DESC`.

**B. Project detail row / card** — wherever projects are displayed
- When `project.account_manager_id !== contact.account_manager_id`:
  ```
  Closed by Abdur · Currently managed by Junaid
  ```
- When they match: just `Managed by Junaid`.

**C. Inbox row tooltip (optional, low effort)** — [`app/PageClient.tsx`](../app/PageClient.tsx) row meta
- Today: tooltip = `Junaid <junaidsabir@texasbrains.com>`
- Add when transfer history exists: append ` (was Abdur until 2026-04-25)`

---

## 4. Analytics — exact queries each lens should use

**These are the queries we must guarantee never break:**

| Lens | Where queried today | Query (post-change) |
|---|---|---|
| A's lifetime achieved (immutable) | `revenueActions.ts:22` | `SUM(projects.total_cost) FILTER (WHERE projects.paid_status = 'PAID') GROUP BY projects.account_manager_id` |
| B's active book size | `dashboardActions.ts`, `intelligenceActions.ts` | `COUNT(contacts) WHERE contacts.account_manager_id = B AND contacts.is_client = TRUE` |
| Revenue this quarter, by rep | `revenueActions.ts:45` | `SUM(projects.total_cost) WHERE closed_at IN range GROUP BY projects.account_manager_id` |
| Org-total revenue | any | `SUM(projects.total_cost)` — never join through contacts |
| AM performance leaderboard | `jarvisService.ts:173` | uses `projects.account_manager_id` (already correct) |

**Lint rule (informal):** any new code that aggregates revenue MUST join through `projects.account_manager_id`. Aggregating through `contacts.account_manager_id` for revenue is a bug. Add this as a "Critical Rule" in `CLAUDE.md`.

---

## 5. Edge cases — explicit handling

| Scenario | Handling |
|---|---|
| Project paid, then refunded (`PAID` → `PENDING`) | Lock implicitly releases. AM can be changed again. When status returns to `PAID`, lock re-engages with whatever AM is current. |
| Admin override needed (e.g. wrong rep was credited) | `transferContactAction({ adminOverride: true, reason: '...' })` — requires `role = 'ADMIN'`, `reason` length ≥ 10, writes a special activity_log entry with `payload.source = 'admin_override'`. |
| Project closed under no AM (legacy data) | `projects.account_manager_id IS NULL` — counts in an "Unattributed" bucket on leaderboards; not retroactively assigned. |
| Contact has many projects, each with a different closer | Already handled — each project carries its own closer. UI shows per-project. |
| Project with no linked contact (`contact_id IS NULL`) | Closer field still works; current-owner concept doesn't apply. UI shows just "Closed by X". |
| Bulk reassignment (cleanup scripts) | Tagged `source: 'bulk'` in activity_log; users can filter these out of "manual transfer" history. |
| Multi-rep commission split | **Out of scope (v2).** Would need a `project_commissions` table. |

---

## 6. Out of scope (v2+)

- Multi-rep commission splits / co-credit.
- Approval workflow for transfers (manager must approve before transfer commits).
- Time-bounded trail commissions.
- Auto-transfer rules (e.g. "if AM hasn't responded in 14 days, auto-reassign").
- Cross-org / multi-account moves.

---

## 7. Rollout order — six steps, ~half a day

1. **Doc this file** (you are here). Get user sign-off on the principle + scope.
2. **Schema-lock guard** — add to `updateProjectAction` + `setProjectAccountManagerAction` if separate. Includes admin override path. ~1.5h.
3. **`transferContactAction` chokepoint** — write the action, migrate the 4 known callers (contactDetail, importActions, campaignActions, plus the manual edit), grep for stragglers. ~1.5h.
4. **Activity-log read paths** — add a small `getOwnershipTransferHistory(contactId)` action. ~30 min.
5. **UI surfaces** (3.3 A & B above) — contact detail dual-ownership + project card. ~2h.
6. **CLAUDE.md update** — document the principle, the chokepoint, the new lint rule. ~15 min.

Inbox tooltip enrichment (3.3 C) is genuinely optional — defer unless free time.

---

## 8. Verification — proof we got it right

| Check | Method |
|---|---|
| Cannot UPDATE `projects.account_manager_id` when paid | Server action returns error; tested via direct `updateProjectAction` call from an admin REPL. |
| Admin override works with reason ≥ 10 chars | Same; tested with `{ adminOverride: true, reason: 'Sales lead corrected miscredit on 2026-04-25' }`. |
| Every `contacts.account_manager_id` change writes an activity_log row | After step 3, run a one-off script to update one contact and verify the row lands. |
| All callers migrated | `grep -rn "contacts.*\.update.*account_manager_id" src/` returns only `transferContactAction` after step 3. |
| Org-total revenue unchanged after a contact transfer | Snapshot `SUM(projects.total_cost)` before + after the next bulk transfer. Diff = 0. |
| Per-rep lifetime stays the same after a transfer | `SUM(projects.total_cost) GROUP BY projects.account_manager_id` snapshot before + after. Diff = 0. |
| UI: contact detail shows transfer history | Open Maria Hudye's contact detail; should show the 2026-04-25 Abdur → Junaid transfer. |
| UI: project card shows dual ownership when they differ | On any project Maria has, card shows "Closed by Abdur · Currently managed by Junaid" if she had a closed project under Abdur. |

---

_Last updated: 2026-04-26 — v1 shipped (steps 1–6). v1.5 punch list: (a) wrap creation-side inserts so first assignments are audited, (b) add dual-ownership rendering to `/projects` and `/my-projects` lists, (c) optional inbox tooltip enrichment._
