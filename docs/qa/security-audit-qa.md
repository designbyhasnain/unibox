# Security Audit

## Overview
Comprehensive security analysis covering authentication, input validation, secret management, XSS, CORS, and webhook security.

---

## Critical Issues

### 1. Hardcoded Default User ID — No Real Authentication
**Severity:** CRITICAL
**Files:**
- `app/constants/config.ts:1`
- `app/api/auth/google/callback/route.ts:18`
- `src/actions/projectActions.ts:7`
- `src/actions/clientActions.ts:7`

All server actions accept `userId` as a parameter without verifying the caller's identity. OAuth callback assigns accounts to `DEFAULT_USER_ID` instead of the authenticated user.

**Impact:** Any client can perform actions as any user. No user isolation.

**Fix:** Implement proper session management (NextAuth.js or Clerk). Extract userId from authenticated session server-side. Never accept userId as a client parameter.

---

### 2. Missing `server-only` Imports
**Severity:** CRITICAL
**Files with sensitive operations exposed to potential client bundling:**
- `src/lib/supabase.ts` — contains `SUPABASE_SERVICE_ROLE_KEY`
- `src/utils/encryption.ts` — contains `ENCRYPTION_KEY` access
- `src/services/googleAuthService.ts` — contains `GOOGLE_CLIENT_SECRET`
- `src/services/gmailSyncService.ts` — server-only operations
- `src/services/manualEmailService.ts` — server-only operations

All have TODO comments noting this but never implemented.

**Fix:** Add `import 'server-only';` at the top of each file immediately.

---

## High Issues

### 3. No CSRF Protection on OAuth Callback
**Severity:** HIGH
**File:** `app/api/auth/google/callback/route.ts:8`

`state` parameter is extracted but never validated. `validateOAuthState()` exists in `googleAuthService.ts` but is unused in the callback.

**Fix:** Store state in session before redirect. Validate on callback.

---

### 4. XSS Risk — Unsafe innerHTML in Email Composer
**Severity:** HIGH
**Files:**
- `app/components/ComposeModal.tsx` (lines 89, 155, 167, 195, 219)
- `app/components/InlineReply.tsx` (lines 112, 131, 147)

Email body stored and rendered via `innerHTML`. If body comes from untrusted source (received email for reply), scripts could execute.

**Fix:** Use DOMPurify for HTML sanitization before rendering.

---

### 5. Gmail Webhook Has No Signature Validation
**Severity:** HIGH
**File:** `app/api/webhooks/gmail/route.ts`

No validation that the request actually came from Google Pub/Sub. Anyone who knows the endpoint URL can trigger fake webhook events.

**Fix:** Validate Pub/Sub message signature. Verify GCP project. Add timestamp validation.

---

### 6. No Auth Checks on API Routes
**Severity:** HIGH
**Files:**
- `app/api/track/route.ts` — no auth
- `app/api/track/click/route.ts` — no auth
- `app/api/track/session/route.ts` — no auth
- `app/api/sync/route.ts` — validates account exists but not user ownership

**Fix:** Add authentication middleware. Verify user ownership before operations.

---

## Medium Issues

### 7. Error Messages Leak Internal Details
**Severity:** MEDIUM
**Files:**
- `app/api/auth/google/callback/route.ts:29` — raw `error.message` in redirect URL
- `src/actions/emailActions.ts:116-120` — internal error strings returned to client

**Fix:** Return generic error codes, log details server-side only.

---

### 8. Weak Rate Limiting on Tracking Endpoints
**Severity:** MEDIUM
**Files:** `app/api/track/route.ts`, `app/api/track/click/route.ts`

20 events per 60 seconds per IP is generous. No per-account or per-trackingId limiting.

**Fix:** Reduce to 5-10/min. Add trackingId-based rate limiting.

---

### 9. No Rate Limiting on Sync Endpoint
**Severity:** MEDIUM
**File:** `app/api/sync/route.ts`

User can trigger unlimited resource-intensive syncs.

**Fix:** Add per-account rate limiting (1 sync per 30 seconds).

---

### 10. CRON_SECRET May Be Empty
**Severity:** MEDIUM
**File:** `app/api/cron/cleanup-tracking/route.ts:17`

If `CRON_SECRET` is unset, auth check becomes `Bearer undefined` — still blocks requests, but fragile.

**Fix:** Validate CRON_SECRET exists at startup. Fail hard if not configured.

---

### 11. Unhandled Promise Rejections
**Severity:** MEDIUM
**File:** `src/actions/accountActions.ts` (lines 131-141)

Fire-and-forget async operations that silently fail.

**Fix:** Add proper error monitoring (Sentry or similar).

---

## What's Working Well

- **Encryption:** AES-256-GCM with random IV per encryption, auth tag ✓
- **SQL Injection:** Uses Supabase RPC and parameterized queries ✓
- **ILIKE Escaping:** Proper `escapeIlike()` function ✓
- **Open Redirect Prevention:** Click tracking validates URL scheme ✓
- **Security Headers:** X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy ✓
- **No circular dependencies** in service layer ✓

---

## Summary

| Severity | Count | Primary Issues |
|----------|-------|----------------|
| CRITICAL | 2 | No real auth, missing server-only |
| HIGH | 4 | CSRF, XSS, webhook validation, unprotected routes |
| MEDIUM | 5 | Error leakage, rate limiting, CRON secret |
| LOW | 1 | CORS on tracking endpoints |

## Priority Remediation

### Immediate
1. Add `import 'server-only'` to all service/lib files with secrets
2. Validate OAuth state parameter in callback

### Urgent
3. Implement proper authentication (NextAuth.js / Clerk)
4. Add DOMPurify for email HTML sanitization
5. Validate Gmail webhook signatures

### Soon
6. Add auth middleware to all API routes
7. Strengthen rate limiting
8. Use generic error messages in responses
9. Add input validation schema (Zod)

---

## Recommended Dependencies to Add
- `next-auth` or `@clerk/nextjs` — authentication
- `dompurify` — HTML sanitization
- `zod` — input validation schemas
- ~~`server-only` — prevent server code in client bundles~~ (added)

---

## Implementation Log

**Date:** 2026-03-16

### Fix 1: Added `server-only` imports (Issue #2 — CRITICAL)
Added `import 'server-only';` as the first import in all five server-side files that handle sensitive secrets. This ensures Next.js will throw a build-time error if any of these modules are accidentally imported from client-side code.

**Files modified:**
- `src/lib/supabase.ts` — protects `SUPABASE_SERVICE_ROLE_KEY`
- `src/utils/encryption.ts` — protects `ENCRYPTION_KEY`
- `src/services/googleAuthService.ts` — protects `GOOGLE_CLIENT_SECRET`
- `src/services/gmailSyncService.ts` — server-only Gmail API operations
- `src/services/manualEmailService.ts` — server-only IMAP/SMTP operations

The `server-only` package was already present in `package.json` dependencies. Removed the TODO comments that were placeholders for this fix.

### Fix 2: OAuth CSRF state validation (Issue #3 — HIGH)
The OAuth callback now validates the `state` parameter using the existing `validateOAuthState()` function from `googleAuthService.ts`, which performs a timing-safe comparison to prevent timing attacks.

**Files modified:**
- `app/api/auth/google/callback/route.ts` — reads `oauth_state` cookie, validates against the `state` query parameter, rejects with `invalid_state` error on mismatch, and deletes the cookie after successful validation.

### What remains to be done
- **Complete CSRF flow (Issue #3):** `src/actions/accountActions.ts` > `getGoogleAuthUrlAction()` needs to be updated to: (1) call `generateOAuthState()`, (2) set an `oauth_state` HttpOnly cookie with the generated state, and (3) pass the state to `getGoogleAuthUrl(state)`. Without this, the callback validation will reject all requests since no cookie is being set yet.
- **Issue #1 (CRITICAL):** Implement proper authentication (NextAuth.js or Clerk) to replace the hardcoded `DEFAULT_USER_ID`.
- **Issue #4 (HIGH):** Add DOMPurify for HTML sanitization in `ComposeModal.tsx` and `InlineReply.tsx`.
- **Issue #5 (HIGH):** Validate Google Pub/Sub webhook signatures in `app/api/webhooks/gmail/route.ts`.
- **Issue #6 (HIGH):** Add authentication middleware to API routes (`/api/track/*`, `/api/sync`).
- **Issues #7-11 (MEDIUM):** Error message sanitization, rate limiting improvements, CRON_SECRET validation, unhandled promise rejections.
