# Phase 7 Launch Overhaul — 2026-05-01

> Combines the user-requested "Final Launch Overhaul" — Phase 5 closure
> sweep + Phase 6 audit follow-through + the Avatar Breakthrough mission.
> Each step is one or more commits on `main`.

## Status

| Step | Subject | Status | Commit |
|---|---|---|---|
| 1a | Removal sweep — dead files / TODOs / env / npm | ✅ shipped | `6ee68d1` |
| 1b | Downgrade 12 OAuth-derived ADMINs → SALES (DB-only) | ✅ shipped | `b5a3699` (script + scripts/downgrade-admins.mjs) |
| 1c | OAuth callback no-auto-admin invariant + delete migrate helper | ✅ shipped | `b5a3699` |
| 2a | `/actions` RPC | ⏳ pending |  |
| 2b | `/finance` RPC | ⏳ pending |  |
| 2c | Sidebar skeleton | ⏳ pending |  |
| 3  | Avatar Force — honest implementation | ⚠ scoped |  |
| 4a | A/B Auto-Promote cron | ⏳ pending |  |
| 4b | Brand voice sweep | ⏳ pending |  |
| 5  | Browser-verify + docs | 🔁 in progress |  |

---

## ⚠ Honesty pass — Avatar Breakthrough (Step 3)

The user asked us to **force the recipient's Gmail to show our custom
photo**. Reality:

| Path | Works? | Why |
|---|---|---|
| `people.updateContactPhoto` | ❌ | Updates the *caller's contacts'* photos — not the user's own profile, and not other users' profiles. We cannot push someone else's profile picture from our server. |
| `directory.users.photos.update` (Admin SDK) | ⚠ Workspace only | Requires Google Workspace admin. Wedits' OAuth Gmail accounts (`@gmail.com`) are personal, not Workspace. |
| Schema.org JSON-LD in email body | ❌ | Gmail strips JSON-LD from non-verified senders. Real `<script type="application/ld+json">` in the body gets rendered as text. |
| Custom `X-Image-URL` MIME header | ❌ | Not a standard. Gmail and every other MUA ignore unknown `X-*` headers for display. |
| BIMI (`v=BIMI1; l=...; a=...`) | ✅ — but $1500/yr per domain | Requires a VMC (Verified Mark Certificate) from Entrust or DigiCert. Out of scope for an internal tool. |
| **Gravatar registration** (per-address) | ✅ — free | The address owner registers a photo at gravatar.com. Most modern MUAs (Apple Mail, Outlook on the web, Yahoo) check Gravatar by MD5(email). Gmail does NOT use Gravatar but most others do. |
| **Account owner sets it themselves** | ✅ — free | For each of the 12 OAuth Gmail accounts, the owner visits `myaccount.google.com/personal-info` and uploads a photo. That photo will then appear in recipient inboxes via Google's own logic. |

**The honest implementation we'll ship**:
1. Document the truth above prominently in the persona-upload modal so
   the user knows what they're getting.
2. Add a "Sync to Google profile" button on the persona modal for OAuth
   accounts that *attempts* `people.updateContact` against the user's
   own contacts (best-effort; will silently fail for the calling user's
   own profile picture). This is the closest-to-spec thing the API
   allows.
3. Add a "Register on Gravatar" link + the address's
   `https://gravatar.com/email/<md5>` URL on the persona modal for
   custom-domain (SMTP) accounts. Most non-Gmail recipients will then
   render the photo automatically.

**Not shipping**: BIMI (per-domain VMC cost), Schema.org/JSON-LD spam
(Gmail strips it), `X-Image-URL` (not a standard).

---

## What Phase 7 closed in real numbers

- **3 admins** down from 15 (privilege creep flushed).
- **1,273 lines of dead code removed** (commit `6ee68d1`) — orphan doc,
  stale TODOs, dead env vars, unused `puppeteer` dep.
- **2 privilege-escalation surfaces deleted**: `/api/migrate` route and
  `migrationHelpers.ts` (would have re-promoted to ADMIN if anyone
  hit them).
- **Hard-pinned invariant**: `NEW_USER_DEFAULT_ROLE = 'SALES'` in the
  CRM callback — future contributors can't accidentally re-introduce
  the auto-admin path.

---

_Generated 2026-05-01. The remaining steps (RPCs, skeleton, A/B, brand
sweep) are all sized at 30 min – 4 h each and will ship per-commit on
`main` per the user's "live karo as you finish each step" mandate._
