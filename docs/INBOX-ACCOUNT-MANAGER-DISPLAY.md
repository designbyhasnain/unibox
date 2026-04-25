# Inbox Row — Account / Account Manager Display

> **Status:** Spec → Shipping. Owner: Claude (2026-04-25).
> **Trigger incident:** Inbox rows show `filmsbyrafay · filmsbyrafay` as the account/manager footer. Both halves are the same string and neither tells the user **which teammate owns the relationship with the contact**. User asks for the format `<email> · AM(<manager>)` (e.g. `filmsbyrafay@gmail.com · AM(junaid)`).

---

## 1. What the user sees today vs what they want

| | Today | Desired |
|---|---|---|
| Left label | `filmsbyrafay` (truncated by column width — actual value is `filmsbyrafay@gmail.com`) | The connected Gmail account address — full or aliased |
| Right label | `filmsbyrafay` (the `users.name` of whoever **connected the Gmail account**, which here happens to be the same string as the local part) | `AM(<actual relationship owner>)` — the human who manages this contact |

The two labels collapse to the same string today because Wedits' team set `users.name = "filmsbyrafay"` for the admin who connected most accounts. Even when names differ, the right label still shows the *Gmail-account creator*, not the contact's *account manager*. Different concept.

## 2. Where account managers actually live in the schema

There are **three distinct "ownership" pointers** in the DB. Conflating them is the root cause of this UI bug.

```
                    ┌──────────────────────────────────────────────────────────┐
                    │  users (the team roster)                                 │
                    │   id, name, email, role                                  │
                    └──┬───────────────┬───────────────┬───────────────────────┘
                       │               │               │
        (1) creator    │   (2) shared  │   (3) owner   │
        of Gmail acct  │   access      │   of contact  │
                       │               │               │
              ┌────────▼─────┐  ┌──────▼────────────┐  ┌▼─────────────────────┐
              │ gmail_       │  │ user_gmail_       │  │ contacts             │
              │ accounts     │  │ assignments       │  │  account_manager_id  │
              │  user_id ────┘  │  user_id          │  │   (FK → users.id)    │
              │  (Prisma:    │  │  gmail_account_id │  │                      │
              │  createdBy)  │  │   pivot, M:N      │  │                      │
              └──────────────┘  └───────────────────┘  └──────────────────────┘
                       │                                          ▲
                       │                                          │
                       │       ┌──────────────────────────────────┘
                       │       │
                       ▼       │
                ┌──────────────┴────────┐
                │ email_messages        │
                │  gmail_account_id     │
                │  contact_id           │
                │  ...                  │
                └───────────────────────┘
```

| Pointer | Lives on | What it actually means | Use it for |
|---|---|---|---|
| **(1) Gmail-account creator** | `gmail_accounts.user_id` (Prisma alias `createdById`, relation `createdBy`) | The single user who **connected** the Gmail account via OAuth. Usually the team admin who onboarded the inbox. Almost never the salesperson who handles incoming leads. | Token refresh, audit trail. Not for "who owns this client". |
| **(2) Shared access** | `user_gmail_assignments` (M:N: `users` ⇄ `gmail_accounts`) | Which SALES users are *allowed to see* a Gmail account's emails. Drives RBAC via `getAccessibleGmailAccountIds()`. | Permission filtering. Not display. |
| **(3) Account manager for the contact** | `contacts.account_manager_id` → `users.id` (Prisma relation: `accountManager`, `User.handledContacts`) | The actual human who **owns the relationship with this client**. Set during contact creation, on import, or when an AM is reassigned. | This is what the inbox row should display. |

The current code in [`InboxComponents.tsx:54-55`](../app/components/InboxComponents.tsx#L54-L55) reads from pointer (1) (`email.gmail_accounts.user.name`). That's why every email from the same Gmail account shows the same "manager" — it's the connector, not the relationship owner.

### Other places already doing this right

The pattern of resolving the AM from `contacts.account_manager_id` is already used in production:

- [`src/actions/jarvisActions.ts:147-150`](../src/actions/jarvisActions.ts#L147-L150) — Jarvis pulls `accountManagerName` for the side panel.
- [`src/actions/clientIntelligenceAction.ts:36`](../src/actions/clientIntelligenceAction.ts#L36) — Client intelligence cards.
- [`src/actions/contactDetailActions.ts:14`](../src/actions/contactDetailActions.ts#L14) — Contact detail page.
- [`src/actions/revenueActions.ts:22`](../src/actions/revenueActions.ts#L22) — Revenue analytics filtering.

So we already have proven query patterns; we just need to apply them to the inbox rows.

## 3. The fix — display contract

For each inbox row, render two compact labels:

```
<gmail account email>   ·   AM(<account manager name>)
```

### Resolution chain (in order of precedence)

This is the rule the user stated explicitly: *"the email account filmsbyrafay assigned to rameez so all the clients on that email is rameez clients if client database is not saying otherwise"*. The `contacts` table is the **override**; the `user_gmail_assignments` table is the **default**.

1. **Contact override** — `contacts.account_manager_id` → `users.name`, when the row's `contact_id` is set AND the contact has an explicit `account_manager_id`. This wins over everything because the team has actively chosen who manages this client.
2. **Gmail-account assignment default** — `user_gmail_assignments` for the row's `gmail_account_id` → `users.name`. If `filmsbyrafay@gmail.com` is assigned to Rameez, every contact on that inbox is Rameez's by default. When multiple users are assigned to one Gmail account, prefer the one with `role = 'SALES'` over `ADMIN` (admins often have access for oversight, not as the working salesperson), tie-broken by oldest `assigned_at` (the original owner).
3. **`Unassigned`** (italic, dim) — if neither of the above resolves. Surfaces a real workflow gap (an inbox/contact nobody owns) instead of hiding it.
4. **`—`** — if the row has no `contact_id` AND no Gmail-account assignment (very rare — usually a pre-classification or system row).

We deliberately **never** fall back to `gmail_accounts.user.name` (the *connector*). That's the bug we're fixing — for Wedits the connector is the team admin who onboarded all 62 inboxes, not the salesperson who handles the leads.

The row also carries `account_manager_source: 'contact' | 'gmail_account' | null` so the UI can later show a subtle hint (e.g. an underline or italic) for AMs that come from the per-account default vs. an explicit per-contact assignment. Not used today — kept available for future polish.

Hover tooltip on the AM label shows the AM's email (`<users.email>`) so the agent can click-to-copy or recognize the person.

### Worked example

Inbox shows three rows from `filmsbyrafay@gmail.com`:

| Row | `contact_id` set? | Contact's `account_manager_id` | `user_gmail_assignments` for filmsbyrafay | Displayed AM |
|---|---|---|---|---|
| Kari Ries | yes | NULL | Rameez (SALES) | `AM(Rameez)` (default) |
| Jaz & Alejandro | yes | Junaid | Rameez (SALES) | `AM(Junaid)` (override wins) |
| Some random scrape | yes | NULL | (no assignments) | `Unassigned` |

## 4. Implementation plan

### 4.1 Server side

In [`src/actions/emailActions.ts#getInboxEmailsAction`](../src/actions/emailActions.ts#L194):

1. Add `contact_id` to the row SELECT.
2. After dedup, collect `uniqueContactIds = [...new Set(rows.map(r => r.contact_id).filter(Boolean))]` and `uniqueAccountIds` (already built earlier in the function).
3. **Contact-override lookup**: `contacts.select('id, account_manager_id').in('id', uniqueContactIds)`.
4. **Account-default lookup**: `user_gmail_assignments.select('gmail_account_id, user_id, assigned_at').in('gmail_account_id', uniqueAccountIds).order('assigned_at')`.
5. Single deduped `users` query for all referenced AM ids (both sources) — `users.select('id, name, email').in('id', allAmIds)` plus a second `users.select('id, role').in('id', assignmentUserIds)` to break SALES vs ADMIN ties.
6. Build `contactAmMap[contactId]` and `accountAmMap[gmailAccountId]`. For multi-user assignments, pick SALES first, then oldest.
7. Per emitted row: `am = contactAmMap[contact_id] ?? accountAmMap[gmail_account_id] ?? null`. Attach `account_manager_name`, `account_manager_email`, and `account_manager_source` ('contact' | 'gmail_account' | null).

Cost: ~3 extra DB queries per page (one each for `contacts`, `user_gmail_assignments`, and the deduped `users`). All by primary key with `IN` — sub-10ms each, well within the existing budget. Users are deduped across both sources via a shared `userById` cache so we never query the same user twice.

We do the same in any sibling path that also feeds the inbox row component (sent view, search, thread side panel) — see § 6 for the full audit.

### 4.2 Client side

In [`app/components/InboxComponents.tsx#EmailRow`](../app/components/InboxComponents.tsx#L23):

```tsx
const accountEmail   = email.gmail_accounts?.email || '';
const amName         = email.account_manager_name || null;        // null = unassigned
const amEmail        = email.account_manager_email || '';
const amLabel        = amName ? `AM(${amName})` : 'Unassigned';
```

Render:

```tsx
<div className="gmail-row-account" title={accountEmail}>{accountEmail}</div>
<div className="gmail-row-manager" title={amEmail || amLabel}
     style={amName ? undefined : { fontStyle: 'italic', opacity: 0.6 }}>
    {amLabel}
</div>
```

### 4.3 Types

Bump `email` row shape (loose `any` today) to include the new fields. Component still accepts `any` to avoid a wide refactor — fields are optional reads.

## 5. Edge cases & how we handle them

| Scenario | Handling |
|---|---|
| Contact has no AM assigned (most cold leads) | Falls back to the Gmail-account assignment (e.g. `AM(Rameez)` for filmsbyrafay). Only shows `Unassigned` if the Gmail account also has no `user_gmail_assignments` row. |
| Email row has no `contact_id` (rare — sync hasn't classified it yet) | Still uses the Gmail-account assignment if present; `—` only when both sources fail. |
| Gmail account assigned to multiple users (e.g. an admin + a SALES rep have access) | Pick the SALES user (the working salesperson). If there's no SALES user, pick the oldest assignment. |
| Contact's AM was reassigned (`account_manager_id` updated) | Override wins — historical Gmail-account default is overridden. |
| Contact's AM is a deactivated user (`status != 'ACTIVE'`) | Still show the name — it's accurate history; the AM-reassign flow is a separate concern. |
| AM's `users.name` is empty (legacy data) | Fall back to local-part of `users.email` (e.g. `junaid@texasbrains.com` → `junaid`). |
| Same contact appears in many threads on a single inbox page | Deduped at the contact lookup step — one DB row, attached to all matching rows. |
| Cross-account thread (same contact emailing two of our Gmail accounts) | Each row pulls the same AM via `contact_id`. Consistent. |
| Long AM name pushes layout | Column already has `flex: 0 0 220px; min-width: 0` and the title attribute carries the full string. CSS truncates with ellipsis. |

## 6. Other render paths that need the same treatment (follow-up)

The audit found four other places that build `gmail_accounts: { ..., user: { name } }` shapes and feed the same row component / similar UI surfaces. They'll exhibit the same bug until updated.

- [`emailActions.ts:283`](../src/actions/emailActions.ts#L283) — `getInboxEmailsAction` (this PR).
- [`emailActions.ts:387,487`](../src/actions/emailActions.ts#L387) — `getInboxWithCountsAction` / sent variants.
- [`emailActions.ts:840,908`](../src/actions/emailActions.ts#L840) — search / sent action paths.
- [`emailActions.ts:1117`](../src/actions/emailActions.ts#L1117) — thread side panel.

We ship the fix on the inbox path first (highest-traffic surface, the one in the screenshot). The same pattern can be lifted into a small helper (`attachAccountManagerNames(rows)`) and applied to the others in a follow-up PR — flagged as a TODO in the code.

## 7. Verification checklist

- [x] Doc published.
- [ ] Inbox query returns `account_manager_name` and `account_manager_email`.
- [ ] `EmailRow` renders `AM(<name>)` with `Unassigned` italic fallback.
- [ ] Tooltip on the AM label shows the AM's email.
- [ ] `npx tsc --noEmit` clean.
- [ ] Browser smoke: open inbox, verify rows now show `<gmail-acct-email> · AM(<actual-am>)` per contact, and `Unassigned` for cold leads with no AM.
- [ ] CLAUDE.md updated with the display contract + the helper-extraction follow-up TODO.

---

_Last updated: 2026-04-25._
