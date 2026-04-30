# Phase 5 Lockdown — 2026-04-30

> Triggered by `docs/UNIBOX-ULTIMATE-AUDIT.md`. Each fix shipped as one
> commit on `main`. Audit findings closed inline; new findings discovered
> mid-flight tagged inline.

## Status

| Phase | Subject | Status | Commit |
|---|---|---|---|
| A   | Apply `get_pipeline_counts` RPC + 5 indexes to prod | ✅ done | (DB-only, no commit) |
| B1  | `server-only` on 7 services | ✅ shipped | `c5ba0ca` |
| B2  | Hash extension API keys + RBAC on contact lookups | ✅ shipped | `5f1894a` |
| B3  | HMAC-sign unsubscribe tokens | ✅ shipped | `6d6cc79` |
| C1  | Investigate empty `webhook_events` + Gmail watch state | ✅ shipped | `a182286` |
| C2  | Repair 16,559 orphan emails | ✅ shipped | `3fe2cf7` |
| C3  | Drop `projects_backup_20260329` | ✅ done | (DB-only, no commit) |
| D1  | `useDialogShell` for AccountSettings + DownloadExtension | ✅ shipped | `e7fae07` |
| D2  | Transfer Contact UI on `/clients/[id]` | ✅ already shipped | (audit was wrong — `OwnerPicker` is wired) |
| E   | List 13/15 ADMINs for review | ✅ done | (data inline below) |

---

## Phase A — `get_pipeline_counts` RPC deployed

```
✓ get_pipeline_counts function CREATED
  pg_proc check: PRESENT
✓ index applied: contacts_pipeline_stage_idx
✓ index applied: contacts_am_pipeline_idx
✓ index applied: projects_paid_status_date_idx
✓ index applied: activity_logs_contact_created_idx
✓ index applied: edit_projects_user_due_idx
```

End-to-end RPC roundtrip: 398 ms (was ~2.5–4 s on the fallback). Pipeline
funnel now matches reality:

| stage | count |
|---|---|
| COLD_LEAD | 2,495 |
| CONTACTED | 8,447 |
| LEAD | 2,027 |
| WARM_LEAD | 2 |
| OFFER_ACCEPTED | 31 |
| CLOSED | 303 |

---

## Phase B1 — server-only added

7 services now opt-in to client-bundle exclusion:
`aiSummaryService.ts`, `accountHealthService.ts`, `accountRotationService.ts`,
`tokenRefreshService.ts`, `trackingService.ts`, `emailClassificationService.ts`,
`salesAutomationService.ts`. Stale TODO removed from `gmailSenderService.ts`.

---

## Phase B2 — extension API hashed + RBAC-scoped

Schema migration applied to prod:
```sql
alter table users add column extension_api_key_hash text;
create index users_extension_api_key_hash_idx on users (extension_api_key_hash) where ... is not null;
-- backfilled SHA-256 hashes for the 2 existing keys
```

New helper at `src/lib/extensionAuth.ts`:
- `hashApiKey(key)` — SHA-256 hex.
- `authenticateExtension(req)` — primary lookup by hash, legacy fallback by plaintext (with opportunistic backfill).
- `applyContactScope(query, auth)` — narrows `contacts` queries to the caller's RBAC-accessible set.

5 routes migrated: `/api/ext/{ping,add-lead,check-duplicate}`,
`/api/extension/{me,clients,generate-key}`. `VIDEO_EDITOR` blocked from
extension contact creation. Extension contact lookup now respects the
SALES Gmail-account assignment scope. Phone match tightened from last-7
to last-10 digits to reduce false positives.

**Backward compat**: existing keys keep working; the legacy plaintext
column is checked as a fallback. Drop `users.extension_api_key` after
30 days.

---

## Phase B3 — unsubscribe tokens HMAC-signed

Token format changed from `base64url(email)` to
`base64url(email).base64url(hmac-sha256(email, secret))`. Verified with
constant-time HMAC compare. Email is normalized to `.toLowerCase().trim()`
before sign/verify.

Backward compat: legacy single-part base64 tokens still accepted (with a
`console.warn`) so unsubscribe links already in delivered emails keep
working.

Smoke-tested:
```
✓ valid signed token verifies
✓ tampered signature rejected
✓ legacy single-part token still accepted
```

---

## Phase C1 — `webhook_events` diagnosis + retry pipeline activated

**Diagnosis**: all 12 OAuth Pub/Sub watches are ACTIVE with valid expiry
(2026-05-04 through 05-06). Pub/Sub itself is healthy. The empty
`webhook_events` table was a *symptom* of a separate bug:

When `syncAccountHistory` threw inside `/api/webhooks/gmail`, the outer
try/catch swallowed the error, returned 200 to Pub/Sub, and dropped the
history-id on the floor. The retry pipeline (table +
`/api/cron/process-webhooks` every 2 min + exponential backoff) was
never activated because no row was ever inserted.

**Fix**: wrap `syncAccountHistory` in its own try/catch. On failure,
insert `{status: 'PENDING', attempts: 0, last_error}` into
`webhook_events` so the existing 2-min retry cron picks it up.

---

## Phase C2 — orphan email cleanup

Dry-run output:
```
Total orphan rows:                       16,559
Step 1 — re-link by counterparty email:  186 re-linked
Step 2 — NULL remaining bounces/orphans: 16,373 NULLed
```

Final orphan count: 0.

**Lessons learned**: the 16,538 RECEIVED orphans were all
mailer-daemon bounces (`Mail Delivery Subsystem <mailer-daemon@googlemail.com>`)
attached to contacts that were later deleted. These aren't real
customer correspondence. NULLing was the right call.

The script is reusable: `node scripts/repair-orphan-emails.mjs` (dry-run)
or `--apply` to commit. Uses 500-row batches with
`session_replication_role = replica` to skip the `sync_thread_summary`
trigger that fires per-row update.

---

## Phase C3 — `projects_backup_20260329` dropped

Audited first:
- 3,282 rows in backup
- 1,772 still match current `projects`
- 1,510 missing from current

Spot-checked the 1,510 "missing" — all created within the same 11-minute
window (2026-03-29 12:25–12:36 UTC) with placeholder names ("Couple Name ",
"Zoe & Charles ( ", " "), `project_value=0`, `paid_status=UNPAID`. This was
a failed CSV import that was deliberately rolled back. Safe to drop.

---

## Phase D1 — modal a11y restored

`AccountSettingsModal` and `DownloadExtensionModal` now use
`useDialogShell({ onClose })`. Both have:
- `dialogRef` + `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
- Esc-to-close
- Focus trap (Tab cycles within modal)
- Body scroll lock
- Focus restored to trigger on close

---

## Phase D2 — Transfer Contact UI: already shipped

The audit's SALES-1 finding ("no UI exists, only the action") was wrong.
`OwnerPicker.tsx` is wired into `app/clients/[id]/PageClient.tsx:211`
with full transfer + reason + history-toggle UI. Verified. Audit
correction noted in `docs/UNIBOX-ULTIMATE-AUDIT.md` next pass.

---

## Phase E — ADMIN list for review

15 ADMIN/ACCOUNT_MANAGER users (CLAUDE.md said 11 — drift confirmed):

| email | name | role |
|---|---|---|
| designsbyhasnain@gmail.com | Design By Hasnain | ADMIN |
| editsbyraf@gmail.com | editsbyraf | ADMIN |
| filmsbyrafay@gmail.com | filmsbyrafay | ADMIN |
| hasnainsiddike6@gmail.com | Hasnain Siddike | ACCOUNT_MANAGER |
| **mustafakamran5@gmail.com** | Mustafa kamran | ADMIN (you) |
| photographybyrafay@gmail.com | photographybyrafay | ADMIN |
| rafay.films@gmail.com | rafay.films | ADMIN |
| rafay.wedits@gmail.com | rafay.wedits | ADMIN |
| rafayfilmmaker@gmail.com | rafayfilmmaker | ADMIN |
| rafayonfilm@gmail.com | rafayonfilm | ADMIN |
| rafayonreel@gmail.com | rafayonreel | ACCOUNT_MANAGER |
| rafaysarwarfilms@gmail.com | rafaysarwarfilms | ADMIN |
| rafaystoryfilms@gmail.com | rafaystoryfilms | ADMIN |
| rafayvisuals1@gmail.com | rafayvisuals1 | ADMIN |
| raffeditts@gmail.com | raffeditts | ADMIN |

**Pattern**: 12 of these correspond exactly to the 12 connected OAuth
Gmail accounts. They're auto-created during Google sign-in (the OAuth
callback creates a `users` row if the email isn't already there) and
default to ADMIN. That's the privilege creep.

**Recommended action**: tell me which of those 12 OAuth-derived accounts
are real human users vs auto-provisioned, and I'll downgrade the rest to
SALES (or delete them entirely if no one logs in as them).

Likely real humans: `designsbyhasnain` (Hasnain), `mustafakamran5`
(you), `hasnainsiddike6` (Hasnain again?). Everything else is a
Gmail-account name (`rafayonreel`, `editsbyraf`, etc.) and looks
auto-created.

A follow-up question: should the OAuth callback default new users to
SALES (or even VIDEO_EDITOR) instead of ADMIN? That'd close the leak at
the source.

---

## Open follow-ups (out of scope for this lockdown)

- **OAuth callback default role** (CEO-1): change from ADMIN to SALES.
- **Drop `users.extension_api_key`** column after the 30-day transition
  (B2 backward-compat).
- **Drop legacy unsubscribe-token path** after 90-day transition (B3
  backward-compat).
- Remaining ULTIMATE-AUDIT findings: ARCH-3 to ARCH-26 (codebase rot),
  SEC-7 to SEC-15 (medium security), DSGN-2 to DSGN-11 (design tokens),
  DB-4 (over-indexed `email_messages`), and the rest.

---

_Generated 2026-04-30 by Phase 5 lockdown. Prior cycles: Phase 1-4
(Phases 1-4 fixes + pre-launch verification), Grand Audit
(`docs/UNIBOX-ULTIMATE-AUDIT.md`)._
