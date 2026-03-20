# Frontend QA Report

## Summary

| Severity | Count |
|----------|-------|
| Critical | 4 |
| High | 12 |
| Medium | 18 |
| Low | 11 |
| **Total** | **45** |

---

## Critical Issues

### [FE-001] XSS via `dangerouslySetInnerHTML`-equivalent in EmailBodyFrame iframe
- **File:** `app/components/InboxComponents.tsx:183-240`
- **Severity:** Critical
- **Description:** The `EmailBodyFrame` component sanitizes HTML by stripping `<script>` tags and inline `on*` event handlers, but the regex-based sanitization is incomplete. It does not handle: (1) `javascript:` URLs in `href`/`src` attributes, (2) `<svg>` with `onload`, (3) CSS `expression()` or `url(javascript:)`, (4) `<iframe>` tags within the email body, (5) event handlers with whitespace like `on click`, (6) data URIs with JavaScript. The `sandbox="allow-same-origin"` attribute on the iframe means scripts that bypass the regex filter have full access to the parent origin's cookies and localStorage.
- **Impact:** A malicious email could execute JavaScript in the context of the application, stealing session data, cached emails, or performing actions on behalf of the user.
- **Suggested Fix:** Use a proper HTML sanitizer library (e.g., DOMPurify) instead of regex. Change the iframe sandbox to `sandbox="allow-popups"` only (remove `allow-same-origin`), or render emails in a sandboxed iframe with a different origin (e.g., a data: URI or blob: URL).

### [FE-002] XSS via `document.execCommand('insertHTML')` with unsanitized user input
- **File:** `app/components/ComposeModal.tsx:143` and `app/components/ComposeModal.tsx:154`
- **Severity:** Critical
- **Description:** `handleInsertTrackedLink` and `handleInsertTrackedButton` take user input from `prompt()` and inject it directly into the DOM via `document.execCommand('insertHTML')` without sanitization. A URL containing `"` can break out of the `href` attribute and inject arbitrary HTML/JavaScript, e.g. `" onclick="alert(1)" x="`.
- **Impact:** Self-XSS that could be exploited via social engineering or if URLs are prefilled from external data.
- **Suggested Fix:** Sanitize and validate the URL input (ensure it starts with `http://` or `https://`), and escape HTML entities in both the URL and the label before calling `insertHTML`.

### [FE-003] `insertText` execCommand does not insert text for emoji
- **File:** `app/components/InlineReply.tsx:186`
- **Severity:** Critical
- **Description:** `handleEmojiClick` calls `execCommand('insertText', emoji)` but the `execCommand` wrapper function in InlineReply (line 88) routes `insertText` through the default `document.execCommand('insertText', false, emoji)` path. However, `document.execCommand` is deprecated and `insertText` does not work reliably across browsers (fails in Firefox completely). The same issue exists in ComposeModal.
- **Impact:** Emoji insertion silently fails in some browsers, leading to a broken user experience with no error feedback.
- **Suggested Fix:** Use the `Range` API directly to insert text nodes at the cursor position instead of relying on `document.execCommand('insertText')`.

### [FE-004] Global mutable state (`globalActiveStage`) shared across renders
- **File:** `app/page.tsx:41`
- **Severity:** Critical
- **Description:** `let globalActiveStage = 'COLD_LEAD'` is a module-level mutable variable that persists across navigations in a single-page app. It is read during `useState` initialization (line 50) and written on tab click (line 274). In a concurrent React rendering environment (React 18 with `startTransition`), reading/writing module-level mutable state during render is unsafe and can cause state tearing. More practically, if the user navigates away and back, the stage will persist from the module variable rather than resetting, which may or may not be intentional but is fragile.
- **Impact:** Potential state tearing in concurrent mode; inconsistent behavior on re-mount depending on module cache state.
- **Suggested Fix:** Use a ref or context/URL search params to persist the active stage. If persistence across navigations is desired, use the URL hash or a proper state management solution.

---

## High Issues

### [FE-005] Search results never populate the main list
- **File:** `app/page.tsx:100-114`
- **Severity:** High
- **Description:** In `handleSearchSubmit`, the search results are fetched via `searchEmailsAction` but are never stored in any state variable. The result of the `await` is discarded. `setSelectedEmail(null)` is called but `setSearchResults` is not called with the full results. The `isSearchResults` flag is set to `true`, but the main email list still displays from the `emails` state (from `useMailbox`), not from search results.
- **Impact:** Pressing Enter to search shows "No search results" even when results exist, because the results are fetched but thrown away. Only the live dropdown (300ms debounce) shows results.
- **Suggested Fix:** Store the search results in state and display them in the email list when `isSearchResults` is true, or integrate search into the `useMailbox` hook.

### [FE-006] Stale closure in `handleSync` captures `currentPage` at callback creation time
- **File:** `app/hooks/useMailbox.ts:311-314`
- **Severity:** High
- **Description:** The `handleSync` callback uses `setTimeout(() => { loadEmails(currentPage); }, 1500)`. The `currentPage` value is captured when `handleSync` is created (via `useCallback` dependencies). However, the user might change pages during the 1500ms wait, causing the reload to fetch the wrong page.
- **Impact:** After sync, the inbox may reload to the wrong page if the user navigated pages during the sync delay.
- **Suggested Fix:** Use a ref for `currentPage` inside the timeout, or call `loadEmails` without a specific page argument to reload the current state.

### [FE-007] Sidebar useEffect re-fetches accounts on every `selectedAccountId` change
- **File:** `app/components/Sidebar.tsx:82-95`
- **Severity:** High
- **Description:** The `useEffect` that fetches accounts has `[selectedAccountId, setSelectedAccountId]` as dependencies. Every time the user changes the account filter (which triggers `setSelectedAccountId`), the Sidebar re-fetches all accounts from the server. This creates unnecessary server load and is a potential infinite loop risk: if `getAccountsAction` returns accounts that don't include the current `selectedAccountId`, it calls `setSelectedAccountId('ALL')`, which changes `selectedAccountId`, which triggers the effect again.
- **Impact:** Potential infinite re-fetch loop; unnecessary API calls on every account switch.
- **Suggested Fix:** Remove `selectedAccountId` from the dependency array. Fetch accounts once on mount. Handle the "selected account no longer exists" case separately with a different mechanism.

### [FE-008] `useRealtimeInbox` polling queries bypass RLS and leak data
- **File:** `src/hooks/useRealtimeInbox.ts:64-98`
- **Severity:** High
- **Description:** The polling function queries `email_messages` directly via the Supabase client using the anon key. If Row Level Security (RLS) is not properly configured on the `email_messages` table, this could return emails from other users. The `accountIds` filter is applied client-side in the `.in()` clause but the anon key may have broader access.
- **Impact:** Potential data leakage if RLS is not correctly configured (defense-in-depth concern).
- **Suggested Fix:** Ensure RLS policies on `email_messages` are properly configured for the anon key. Consider routing polling through server actions instead of direct Supabase client queries.

### [FE-009] MutationObserver in EmailBodyFrame never disconnected
- **File:** `app/components/InboxComponents.tsx:258-263`
- **Severity:** High
- **Description:** Inside the iframe `load` event handler, a `MutationObserver` is created and started with `observer.observe(b, ...)`, but the observer is never disconnected. When the component unmounts, the observer continues to run. The `useEffect` cleanup only clears the `setTimeout` timer, not the observer or the load event listener.
- **Impact:** Memory leak that grows with each email viewed. The observer holds references to the iframe's DOM, preventing garbage collection.
- **Suggested Fix:** Store the observer in a ref, and disconnect it in the `useEffect` cleanup function. Also remove the `load` event listener on cleanup.

### [FE-010] Toast timer refs never fully cleaned up on unmount
- **File:** `app/page.tsx:97` and `app/sent/page.tsx:72`
- **Severity:** High
- **Description:** `toastTimerRef` is a `Map` of timeout IDs, but there is no `useEffect` cleanup that clears all pending timers when the component unmounts. If the page navigates away while toasts are visible, the timers fire after unmount, calling `setToasts` on an unmounted component.
- **Impact:** React state update on unmounted component warnings; potential memory leaks.
- **Suggested Fix:** Add a cleanup `useEffect` that iterates over all entries in `toastTimerRef.current` and clears them on unmount.

### [FE-011] `TextWithLinks` regex.test() resets lastIndex causing alternating matches
- **File:** `app/components/InboxComponents.tsx:301-317`
- **Severity:** High
- **Description:** `TextWithLinks` defines `urlRegex` with the global `g` flag, uses `text.split(urlRegex)` to split text, then uses `urlRegex.test(part)` to check each part. Because `test()` on a global regex advances `lastIndex`, consecutive calls to `test()` can return alternating `true`/`false` results for the same input. This means some URLs will be rendered as plain text instead of links, and some plain text will be incorrectly matched.
- **Impact:** Links in plain-text emails may not render correctly, with some URLs shown as plain text and some text fragments incorrectly wrapped in `<a>` tags.
- **Suggested Fix:** Either use a non-global regex for the `test()` call, or use `part.match(urlRegex)` instead of `urlRegex.test(part)`.

### [FE-012] `FilterContext` reads `localStorage` during SSR initial state
- **File:** `app/context/FilterContext.tsx:19-24`
- **Severity:** High
- **Description:** The `FilterProvider` initializes `selectedAccountId` by reading from `localStorage` inside `useState`. While there is a `typeof window !== 'undefined'` guard, this runs during the initial render. Since `FilterProvider` is used in `layout.tsx` (which is a Server Component importing a Client Component), the server-side render will always produce `'ALL'`. However, the client-side render may produce a different value from localStorage, causing a hydration mismatch. The `suppressHydrationWarning` on `<html>` and `<body>` only suppresses warnings for those specific elements, not their children.
- **Impact:** Hydration mismatch warning; brief flash of wrong account filter on page load.
- **Suggested Fix:** Initialize with `'ALL'` always, then update from localStorage in a `useEffect`.

### [FE-013] Sent page client-side filtering breaks pagination
- **File:** `app/sent/page.tsx:95-103`
- **Severity:** High
- **Description:** The sent page applies a client-side `searchTerm` filter (`filteredEmails`) on top of server-paginated results. The pagination controls still show `totalCount` from the server, but the displayed list shows `filteredEmails.length` items. If the user searches, the count label says "1-50 of 200" but only 3 matching emails are shown. Navigating to page 2 may show different filter results because the filter only applies to the current page's data.
- **Impact:** Misleading pagination; incomplete search results (only searches within the current page, not all sent emails).
- **Suggested Fix:** Either implement server-side search for sent emails (like inbox does), or clearly indicate that the filter is client-side and hide pagination during filtering.

### [FE-014] Accounts page SMTP port inconsistency for Gmail
- **File:** `app/accounts/page.tsx:70,631`
- **Severity:** High
- **Description:** The initial `smtpPort` state is `465` (line 70), but when the user types a Gmail address, the `onChange` handler sets `smtpPort` to `587` (line 631). Port 465 uses implicit TLS (SMTPS), while port 587 uses STARTTLS. The initial default and the auto-detected default are inconsistent, meaning if a user connects a Gmail account without typing the full email first, they'll use port 465, but if they type the email first, it switches to 587. Either could work depending on nodemailer configuration, but the inconsistency may cause connection failures.
- **Impact:** Manual account connection may fail silently or with a confusing error depending on the order of user interactions.
- **Suggested Fix:** Use a consistent default SMTP port (587 with STARTTLS is the modern standard for Gmail).

---

## Medium Issues

### [FE-015] `useMailbox` performs synchronous state updates during render
- **File:** `app/hooks/useMailbox.ts:120-170`
- **Severity:** Medium
- **Description:** The hook compares `cacheKey !== prevCacheKey` during render and calls multiple `setState` functions synchronously. While this pattern (inspired by the React docs for derived state) works, calling 6+ setState functions during render (`setSelectedEmail`, `setThreadMessages`, `setEmails`, `setTotalCount`, `setTotalPages`, `setCurrentPage`, `setIsLoading`) triggers multiple re-renders and is difficult to reason about.
- **Impact:** Extra re-renders during tab/account switches; potential for subtle ordering bugs.
- **Suggested Fix:** Use `useReducer` to batch all state updates into a single dispatch, or use `useSyncExternalStore` for the cache layer.

### [FE-016] `handleNewEmail` increments `totalCount` on every realtime event
- **File:** `app/hooks/useMailbox.ts:350`
- **Severity:** Medium
- **Description:** `setTotalCount((prev: number) => prev + 1)` is called for every new email event, but the email list is also deduplicated by `thread_id` (line 338). If a new message arrives in an existing thread, the thread replaces the old one in the list (correct), but `totalCount` still increments (incorrect). Over time, this causes the displayed count to drift from the actual number of items.
- **Impact:** Incorrect "X of Y" pagination display that grows over time without page refresh.
- **Suggested Fix:** Only increment `totalCount` if the email's `thread_id` is not already in the list.

### [FE-017] `accounts.length` in useEffect dependency causes re-fetch loop risk
- **File:** `app/hooks/useMailbox.ts:284-291`
- **Severity:** Medium
- **Description:** The initial load effect has `[loadEmails, accounts.length]` as dependencies. `loadEmails` changes when its own dependencies change (which includes `selectedAccountId`, `activeStage`, etc.), causing a reload. But `accounts.length` going from 0 to N also triggers a reload. If `getAccountsAction` returns an empty array (error case), and then succeeds, it could cause duplicate loads.
- **Impact:** Potential double-fetching of emails on initial mount.
- **Suggested Fix:** Separate account fetching into its own effect. Remove `accounts.length` from the dependency array and use a ref to track if accounts have been fetched.

### [FE-018] `handleEmailUpdated` has stale closure over `selectedEmail`
- **File:** `app/hooks/useMailbox.ts:361-380`
- **Severity:** Medium
- **Description:** `handleEmailUpdated` is wrapped in `useCallback` with `[selectedEmail]` as a dependency. This means a new callback is created every time `selectedEmail` changes. However, `useRealtimeInbox` stores callbacks in refs (line 52-53), so this is mitigated. The real issue is that `handleEmailUpdated` mutates `globalMailboxCache` directly (line 377: `cached.emails = cached.emails.map(...)`) without creating a new object reference, so React won't re-render if the cache is read elsewhere.
- **Impact:** Cache mutations without immutable updates could cause stale data in components that read from the cache.
- **Suggested Fix:** Create new cache entry objects when updating: `globalMailboxCache[key] = { ...cached, emails: cached.emails.map(...) }`.

### [FE-019] Advanced search form fields are non-functional
- **File:** `app/components/Topbar.tsx:111-138`
- **Severity:** Medium
- **Description:** The advanced search popup renders input fields for "From", "To", "Subject", "Has the words", and "Doesn't have", but none of these fields are connected to any state or search logic. The "Search" button in the popup calls `onSearch(searchTerm)` which uses the main search bar's term, ignoring all advanced fields. The "Create filter" button only closes the popup.
- **Impact:** Users see a functional-looking advanced search UI that does nothing, leading to confusion.
- **Suggested Fix:** Either implement the advanced search functionality (building query operators from the fields) or remove the advanced search UI to avoid misleading users.

### [FE-020] Attachments are collected but never sent
- **File:** `app/components/ComposeModal.tsx:34,182-186` and `app/components/InlineReply.tsx:28,144-148`
- **Severity:** Medium
- **Description:** Both `ComposeModal` and `InlineReply` have attachment UI (file picker, attachment chips with remove buttons), but `handleSend` in both components sends only `{ to, subject, body, accountId, threadId }` to `sendEmailAction`. The `attachments` array is never included in the payload and is silently dropped.
- **Impact:** Users can select attachments and see them listed, but attachments are silently lost when the email is sent. No error or warning is shown.
- **Suggested Fix:** Either implement attachment sending (requires multipart upload to server action) or disable/hide the attachment UI with a "coming soon" indicator.

### [FE-021] `cleanPreview` regex strips legitimate email content
- **File:** `app/utils/helpers.ts:81`
- **Severity:** Medium
- **Description:** The regex `[\w-]+\s*:\s*[\w#\-().,!%]+\s*;?` is intended to strip CSS property-value pairs, but it also matches common English text patterns like "Date: March 16", "Time: 2:30pm", "Price: $500", "Status: Active", etc. This aggressively removes content from email previews.
- **Impact:** Email previews in the list may be missing important information, showing truncated or misleading text.
- **Suggested Fix:** Only apply this CSS-stripping regex when the input is detected as containing HTML/CSS (e.g., when it contains `{` and `}` blocks), not unconditionally.

### [FE-022] Analytics division by zero
- **File:** `app/analytics/page.tsx:275`
- **Severity:** Medium
- **Description:** The sentiment bar width is calculated as `(s.value / data.stats.totalReceived) * 100`. If `data.stats.totalReceived` is 0 (no received emails), this results in `NaN` or `Infinity`, causing the bar to render with `width: NaN%` or `width: Infinity%`.
- **Impact:** Broken layout in the sentiment section when there are no received emails.
- **Suggested Fix:** Add a guard: `(data.stats.totalReceived > 0 ? (s.value / data.stats.totalReceived) * 100 : 0)`.

### [FE-023] `isLive` status indicator is fake
- **File:** `app/page.tsx:136-138` and `app/sent/page.tsx:75-78`
- **Severity:** Medium
- **Description:** The "Live" / "Connecting..." status indicator simply sets `isLive = true` after a 1500ms timeout. It does not reflect actual WebSocket connection status from `useRealtimeInbox`. The indicator shows "Live" even if the Supabase Realtime connection failed.
- **Impact:** Users see a green "Live" dot even when real-time updates are not working, giving false confidence.
- **Suggested Fix:** Expose the Supabase channel subscription status from `useRealtimeInbox` and use it to drive the indicator.

### [FE-024] Settings page does not actually control inbox polling
- **File:** `app/settings/page.tsx:22-53` and `app/page.tsx:92-94`
- **Severity:** Medium
- **Description:** The settings page saves `settings_polling_interval` to localStorage (line 48), but the inbox page initializes its own `pollingInterval` state to `300` (line 93) and never reads from localStorage. The settings page slider range is 5-300 seconds, but the inbox hardcodes 300. The settings are disconnected from the actual polling behavior.
- **Impact:** Users adjust settings that have no effect on application behavior.
- **Suggested Fix:** Read the polling settings from localStorage in the inbox page's initial state, or use a shared context/store for settings.

### [FE-025] `handleEmailDeleted` in `useMailbox` has stale `selectedEmail` closure
- **File:** `app/hooks/useMailbox.ts:382-394`
- **Severity:** Medium
- **Description:** `handleEmailDeleted` depends on `[selectedEmail]`, but the callback ref in `useRealtimeInbox` is updated via `useEffect`. Between a state change to `selectedEmail` and the ref update, a deletion event could fire with the stale `selectedEmail` value, potentially failing to clear the detail panel when the viewed email is deleted.
- **Impact:** Edge case where deleting the currently viewed email via realtime event might not close the detail panel.
- **Suggested Fix:** Use a ref for `selectedEmail` in the deletion handler, or use functional state updates.

### [FE-026] Clients page `globalClientsCache` module variable causes stale data
- **File:** `app/clients/page.tsx:25-35`
- **Severity:** Medium
- **Description:** Module-level `globalClientsCache`, `globalManagersCache`, and `globalClientDetailsCache` persist across navigations. When clients are updated (e.g., stage changed), the cache is not invalidated. Navigating away and back shows stale client data from the module cache.
- **Impact:** Users see outdated client information after making changes, until a hard refresh.
- **Suggested Fix:** Implement cache invalidation on mutations, or use a TTL-based approach for the module cache.

### [FE-027] `AddLeadModal` uses `Date.now()` as ID
- **File:** `app/components/AddLeadModal.tsx:21`
- **Severity:** Medium
- **Description:** `onAddLead` is called with `id: Date.now()` as the lead's ID. This is a numeric timestamp, not a UUID. If the lead is subsequently used to create a project or match against server-side data, the numeric ID will not match any server-generated UUID, causing lookups to fail.
- **Impact:** Newly added leads may not properly integrate with the backend, causing silent failures when trying to create projects or view details.
- **Suggested Fix:** Generate a proper UUID client-side, or let the server action create the lead and return the real ID.

### [FE-028] DateRangePicker "Today" preset sets start = end = today but some queries may use exclusive end
- **File:** `app/components/DateRangePicker.tsx:21-37`
- **Severity:** Medium
- **Description:** The "Today" preset sets `days: 0`, so both `start` and `end` are set to today's date (YYYY-MM-DD format). Depending on how the backend interprets date ranges (inclusive vs. exclusive end), this could return either today's data or no data. The "Yesterday" preset similarly sets both start and end to yesterday.
- **Impact:** Analytics may show no data for "Today" if the server uses `sent_at < endDate` (exclusive) instead of `sent_at <= endDate`.
- **Suggested Fix:** Ensure consistent date range semantics between frontend presets and backend queries. Consider setting `endDate` to tomorrow for "Today" preset if the backend uses exclusive end dates.

### [FE-029] `useHydrated` global flag never resets
- **File:** `app/utils/useHydration.ts:3`
- **Severity:** Medium
- **Description:** `isGlobalHydrated` is a module-level boolean set to `true` once and never reset. In development with hot module replacement (HMR), this means after the first hydration, `useHydrated()` will return `true` synchronously even during SSR-simulated renders, potentially hiding hydration-related bugs during development.
- **Impact:** Hydration bugs may be masked during development, only appearing in production.
- **Suggested Fix:** Accept this as a known dev-only limitation, or reset the flag in a development-only HMR cleanup handler.

### [FE-030] Projects page re-fetches all data on any filter change
- **File:** `app/projects/page.tsx` (loadProjects effect)
- **Severity:** Medium
- **Description:** The projects page calls `getAllProjectsAction` and `getClientsAction` and `getManagersAction` every time any filter changes (status, priority, manager, client). All three calls are made even though only the project list needs to be re-filtered. Clients and managers are static reference data that should be fetched once.
- **Impact:** Unnecessary server load; slower filter interactions.
- **Suggested Fix:** Separate the reference data fetch (clients, managers) from the project list fetch. Only re-fetch projects on filter change, and cache clients/managers.

### [FE-031] `handleNotInterested` in inbox page uses wrong identifier
- **File:** `app/page.tsx:178-181`
- **Severity:** Medium
- **Description:** `handleNotInterested` takes an `email` string parameter (the sender's email address), but in the `EmailDetail` component (line 605), it's called with `extractEmail(email.from_email)`. If `from_email` is in format `"Name" <address@example.com>`, the `extractEmail` function correctly extracts the address. However, the `handleNotInterested` function is also passed to `EmailDetail` via `onNotInterested`, and the `EmailDetail` interface expects `(email: string) => void`. There's a naming collision between the `email` parameter (sender address) and the `email` state object that could lead to future bugs during refactoring.
- **Impact:** Low immediate impact, but confusing naming increases risk of future bugs.
- **Suggested Fix:** Rename the parameter to `senderEmail` for clarity.

### [FE-032] `localCache` has no size limits or TTL
- **File:** `app/utils/localCache.ts:1-19`
- **Severity:** Medium
- **Description:** `saveToLocalCache` writes to localStorage without any size limits, TTL, or eviction strategy. Over time, cached emails, analytics data, client lists, and account data accumulate indefinitely. The try-catch handles `QuotaExceededError` gracefully (just warns), but by then localStorage may be full, preventing other features from storing data.
- **Impact:** localStorage fills up over time, eventually causing quota errors for settings saves and other features.
- **Suggested Fix:** Add a TTL (e.g., 30 minutes) to cached entries. On read, check if the entry is expired and return null. Implement an LRU eviction strategy or periodic cleanup.

---

## Low Issues

### [FE-033] Unused imports across multiple files
- **File:** Multiple files
- **Severity:** Low
- **Description:** Several files import modules that are never used:
  - `app/page.tsx:38` imports `saveToLocalCache` and `getFromLocalCache` but only uses them indirectly through `useMailbox`.
  - `app/sent/page.tsx:10` imports `getAccountsAction` but never calls it directly.
  - `app/sent/page.tsx:11` imports `useRealtimeInbox` but never calls it directly.
  - `app/sent/page.tsx:16-17` imports `saveToLocalCache` and `getFromLocalCache` and uses them only for the unused `globalSentCache`.
  - `app/page.tsx:17` imports `getAccountsAction` but uses it only through `useMailbox`.
- **Impact:** Increased bundle size; confusing code.
- **Suggested Fix:** Remove unused imports. Enable the `no-unused-vars` ESLint rule.

### [FE-034] Hardcoded `ADMIN_USER_ID` duplicated across 10+ files
- **File:** `app/page.tsx:24`, `app/sent/page.tsx:20`, `app/clients/page.tsx:10`, `app/projects/page.tsx:19`, `app/accounts/page.tsx:79`, `app/settings/page.tsx:38`, `app/analytics/page.tsx:20`, `app/hooks/useMailbox.ts:22`, `app/components/Sidebar.tsx:71`, `app/components/ComposeModal.tsx:71`, `app/components/InlineReply.tsx:41`, `app/components/AddProjectModal.tsx:4`
- **Severity:** Low
- **Description:** The same UUID string `'1ca1464d-1009-426e-96d5-8c5e8c84faac'` is hardcoded in over 10 files. This is not just a DRY violation -- if the user ID ever needs to change (e.g., adding real authentication), every file must be updated.
- **Impact:** Maintenance burden; high risk of missed updates.
- **Suggested Fix:** Define the constant in a single shared file (e.g., `app/constants/auth.ts`) and import it everywhere.

### [FE-035] `document.execCommand` is deprecated
- **File:** `app/components/ComposeModal.tsx:167` and `app/components/InlineReply.tsx:116`
- **Severity:** Low
- **Description:** Both the compose modal and inline reply use `document.execCommand()` extensively for text formatting. This API is deprecated and may be removed from browsers in the future.
- **Impact:** Future browser versions may break the rich text editing functionality.
- **Suggested Fix:** Migrate to a modern rich text editor library (e.g., TipTap, Slate, or Lexical) or use the Clipboard API and Input Events API.

### [FE-036] `globalSentCache` is initialized but never read
- **File:** `app/sent/page.tsx:25-30`
- **Severity:** Low
- **Description:** `globalSentCache` is initialized from localStorage on module load but is never used. The sent page uses `useMailbox({ type: 'sent' })` which has its own caching mechanism.
- **Impact:** Dead code; unnecessary localStorage read on module initialization.
- **Suggested Fix:** Remove the unused `globalSentCache` variable and related imports.

### [FE-037] Missing keyboard accessibility on tab elements
- **File:** `app/page.tsx:267-287`
- **Severity:** Low
- **Description:** Pipeline stage tabs are rendered as `<div>` elements with `onClick` handlers. They lack `role="tab"`, `tabIndex`, `onKeyDown` (Enter/Space), and `aria-selected` attributes. Screen readers cannot navigate or activate these tabs.
- **Impact:** Application is not accessible to keyboard-only users or screen reader users for tab navigation.
- **Suggested Fix:** Use `role="tablist"` on the container, `role="tab"` on each tab, add `tabIndex={0}`, handle Enter/Space key presses, and set `aria-selected`.

### [FE-038] Missing `aria-label` on icon-only buttons
- **File:** Multiple files (e.g., `app/page.tsx:244`, `app/components/InboxComponents.tsx:572`)
- **Severity:** Low
- **Description:** Many buttons contain only SVG icons with no text content. While some have `title` attributes, they lack `aria-label` for screen reader accessibility.
- **Impact:** Screen readers announce these as unlabeled buttons.
- **Suggested Fix:** Add `aria-label` attributes to all icon-only buttons.

### [FE-039] `EmailRow` calls `useHydrated()` inside `React.memo`
- **File:** `app/components/InboxComponents.tsx:39`
- **Severity:** Low
- **Description:** Each `EmailRow` calls `useHydrated()` individually. With 50 rows on a page, this means 50 hook calls that all return the same value. While React handles this efficiently, it is unnecessary overhead.
- **Impact:** Minor performance overhead from redundant hook calls.
- **Suggested Fix:** Pass `isHydrated` as a prop from the parent component instead of calling the hook in each row.

### [FE-040] No loading/error state for `handleChangeStage` and `handleNotInterested`
- **File:** `app/page.tsx:171-188`
- **Severity:** Low
- **Description:** `handleChangeStage` and `handleNotInterested` call server actions (`updateEmailStageAction`, `markAsNotInterestedAction`) without try-catch, loading indicators, or error handling. If the server action fails, the UI silently does nothing after `loadEmails` reloads.
- **Impact:** User gets no feedback if a stage change fails.
- **Suggested Fix:** Add try-catch with error toast notification, and optimistic UI updates that revert on failure.

### [FE-041] `style jsx` in analytics page may not work with App Router
- **File:** `app/analytics/page.tsx:397-420`
- **Severity:** Low
- **Description:** The analytics page uses `<style jsx global>` which is a Next.js Pages Router feature (styled-jsx). In the App Router, styled-jsx works in client components but the `global` modifier may not scope correctly, and the global styles affect all pages, not just analytics.
- **Impact:** CSS from the analytics page (like `::-webkit-scrollbar` styles) leaks to all other pages when the analytics page is mounted.
- **Suggested Fix:** Move global styles to `globals.css` or use CSS modules.

### [FE-042] `DateRangePicker` `formatDisplayDate` may show wrong date due to timezone
- **File:** `app/components/DateRangePicker.tsx:49-52`
- **Severity:** Low
- **Description:** `new Date(dateStr)` where `dateStr` is "YYYY-MM-DD" parses the date as UTC midnight. `toLocaleDateString` then converts to local time, which could show the previous day for users in negative UTC offset timezones (e.g., "2024-03-15" displays as "Mar 14" for UTC-5).
- **Impact:** Date display may be off by one day for some users.
- **Suggested Fix:** Parse the date string manually (`const [y, m, d] = dateStr.split('-')`) or append `T00:00:00` to force local time interpretation.

### [FE-043] Inconsistent empty `onSearch` handlers across pages
- **File:** `app/sent/page.tsx:122`, `app/accounts/page.tsx:293`, `app/settings/page.tsx:88`, `app/analytics/page.tsx:151`
- **Severity:** Low
- **Description:** Several pages pass `onSearch={() => {}}` to the `Topbar` component, making the search bar appear functional but do nothing when Enter is pressed. The accounts page has search filtering that works via `searchQuery` state but the Topbar's `onSearch` is still a no-op.
- **Impact:** Inconsistent UX -- search bar is present but non-functional on some pages.
- **Suggested Fix:** Either hide the search bar on pages where search is not implemented, or implement search functionality.

---

## Fixes Applied

### [FE-001] (fixed)
- **Fix:** Removed `allow-same-origin` from iframe sandbox attribute (now `sandbox="allow-popups"` only). Enhanced regex sanitization to also strip `<iframe>` tags, `javascript:` and `data:text/html` URIs in href/src, `expression()` in CSS, unquoted event handlers, and event handlers with various quoting.
- **File:** `app/components/InboxComponents.tsx:183-198,286`
- **Validated:** Yes

### [FE-002] (fixed)
- **Fix:** Added `sanitizeUrl()` helper that rejects non-http(s) URLs (blocks `javascript:`, `data:`, etc.) and `escapeHtml()` helper that escapes `& < > " '` in both URL and label before passing to `insertHTML`. Applied to both `handleInsertTrackedLink` and `handleInsertTrackedButton`.
- **File:** `app/components/ComposeModal.tsx:138-170`
- **Validated:** Yes

### [FE-003] (fixed)
- **Fix:** Added Range API-based text insertion for the `insertText` command in both `ComposeModal.execCommand` and `InlineReply.execCommand`. Instead of using the deprecated `document.execCommand('insertText')`, we now create a text node and insert it at the current selection range. This works reliably across all browsers including Firefox.
- **File:** `app/components/ComposeModal.tsx:175-188`, `app/components/InlineReply.tsx:115-126`
- **Validated:** Yes

### [FE-004] (fixed)
- **Fix:** Removed the module-level `let globalActiveStage = 'COLD_LEAD'` mutable variable. Replaced with a simple `useState('COLD_LEAD')` initialization. Removed the `globalActiveStage = tab.id` write on tab click. State is now purely React-managed, safe for concurrent mode.
- **File:** `app/page.tsx:41,48,273`
- **Validated:** Yes

### [FE-005] (fixed)
- **Fix:** In `handleSearchSubmit`, the fetched search results are now stored via `setSearchResults(results)`. The email list rendering now uses `(isSearchResults ? searchResults : emails)` to display search results when active. The `PageLoader` also shows loading state during `searchLoading`.
- **File:** `app/page.tsx:107,327,355`
- **Validated:** Yes

### [FE-006] (fixed)
- **Fix:** Added `currentPageRef` ref that is kept in sync with `currentPage` state. The `setTimeout` callback in `handleSync` now reads from `currentPageRef.current` instead of the stale closure-captured `currentPage`. Removed `currentPage` from the `useCallback` dependency array.
- **File:** `app/hooks/useMailbox.ts:179-180,314,322`
- **Validated:** Yes

### [FE-007] (fixed)
- **Fix:** Changed the Sidebar's `useEffect` dependency array from `[selectedAccountId, setSelectedAccountId]` to `[]` (mount-only). Removed the "selected account no longer exists" reset logic that was causing the infinite loop risk. Accounts are now fetched once on mount.
- **File:** `app/components/Sidebar.tsx:82-95`
- **Validated:** Yes

### [FE-009] (fixed)
- **Fix:** Added `observerRef` to store the MutationObserver reference. Extracted the iframe `load` handler into a named function. In the `useEffect` cleanup, the observer is now disconnected via `observerRef.current.disconnect()` and the load event listener is removed via `removeEventListener`.
- **File:** `app/components/InboxComponents.tsx:176,258-290`
- **Validated:** Yes

### [FE-010] (fixed)
- **Fix:** Added a cleanup `useEffect` in both `InboxPage` (`app/page.tsx`) and `SentPage` (`app/sent/page.tsx`) that iterates over all entries in `toastTimerRef.current` and clears them on unmount, preventing state updates on unmounted components.
- **File:** `app/page.tsx:99-103`, `app/sent/page.tsx:74-78`
- **Validated:** Yes

### [FE-011] (fixed)
- **Fix:** Split the URL regex into two: `urlRegexGlobal` (with `g` flag) for `text.split()`, and `urlRegexTest` (non-global, anchored with `^...$`) for `test()`. This prevents the `lastIndex` alternating match bug that caused some URLs to render as plain text.
- **File:** `app/components/InboxComponents.tsx:301-317`
- **Validated:** Yes

### [FE-012] Hydration mismatch in FilterContext (fixed)
- **Fix:** Changed `FilterProvider` to always initialize `selectedAccountId` with `'ALL'` (matching SSR output), then read from `localStorage` in a `useEffect` to update client-side. This eliminates the hydration mismatch.
- **File:** `app/context/FilterContext.tsx:19-25`
- **Validated:** Yes

### [FE-016] (fixed)
- **Fix:** Moved the `setTotalCount` increment inside the `setEmails` updater function, where it now checks `isExistingThread` before incrementing. Only genuinely new threads (not existing thread updates) increment the count.
- **File:** `app/hooks/useMailbox.ts:339-354`
- **Validated:** Yes

### [FE-018] (fixed)
- **Fix:** Changed `handleEmailUpdated` to create new cache entry objects when updating: `globalMailboxCache[key] = { ...cached, emails: ... }` instead of mutating `cached.emails` directly. This ensures React detects changes if the cache is read elsewhere.
- **File:** `app/hooks/useMailbox.ts:377-380`
- **Validated:** Yes

### [FE-021] (fixed)
- **Fix:** Changed the CSS property-value stripping regex to require a trailing semicolon (`/[\w-]+\s*:\s*[\w#\-().,!%]+\s*;/g`), so it only strips actual CSS declarations like `color: red;` and no longer strips legitimate email content like "Date: March 16" or "Status: Active".
- **File:** `app/utils/helpers.ts:81`
- **Validated:** Yes

### [FE-022] (fixed)
- **Fix:** Added zero-division guard on the sentiment bar width calculation: `data.stats.totalReceived > 0 ? (s.value / data.stats.totalReceived) * 100 : 0`. Prevents `NaN`/`Infinity` width values when there are no received emails.
- **File:** `app/analytics/page.tsx:275`
- **Validated:** Yes

### Missing 'use client' on AddProjectModal (fixed)
- **Fix:** Added `'use client';` directive at the top of `AddProjectModal.tsx`. The component uses React hooks (`useState`, `useEffect`) and must be marked as a client component.
- **File:** `app/components/AddProjectModal.tsx:1`
- **Validated:** Yes

## Round 2 Fixes Applied

### [FE-013] (fixed)
- **Fix:** When client-side search filter is active on sent page, pagination controls are hidden and the count label shows "N results (filtering current page)" instead of misleading server-side counts.
- **File:** `app/sent/page.tsx`

### [FE-014] (fixed)
- **Fix:** Changed default `smtpPort` state from `465` to `587` to be consistent with the Gmail auto-detection in the email onChange handler. Port 587 (STARTTLS) is the modern standard.
- **File:** `app/accounts/page.tsx:70`

### [FE-019] (fixed)
- **Fix:** Removed non-functional advanced search form fields (From, To, Subject, Has the words, Doesn't have) that were not connected to any state or search logic. Replaced with a search tips panel that documents available search operators.
- **File:** `app/components/Topbar.tsx:111-138`

### [FE-020] (fixed)
- **Fix:** Replaced attachment file picker with an alert indicating "Attachments are coming soon" since attachments were collected but never sent. Removed dead attachment state, file input refs, handleFileChange, handleRemoveAttachment functions, and attachment preview UI from both ComposeModal and InlineReply.
- **File:** `app/components/ComposeModal.tsx`, `app/components/InlineReply.tsx`

### [FE-023] (fixed)
- **Fix:** Removed the fake `isLive` state that was set via a 1500ms timeout. Replaced with a derived value `const isLive = accounts.length > 0` that reflects whether accounts are actually loaded and realtime subscriptions can be active. Applied to both inbox and sent pages.
- **File:** `app/page.tsx`, `app/sent/page.tsx`

### [FE-024] (fixed)
- **Fix:** Changed `pollingInterval`, `isPollingEnabled`, and `isFocusSyncEnabled` state initializers in the inbox page to read from localStorage (matching the keys the settings page writes to). Settings changes now take effect on next page load.
- **File:** `app/page.tsx:91-107`

### [FE-025] (fixed)
- **Fix:** Added `selectedEmailRef` ref that stays in sync with `selectedEmail` state. Changed `handleEmailDeleted` to read from `selectedEmailRef.current` instead of the closure-captured `selectedEmail`, and removed `selectedEmail` from the `useCallback` dependency array. Also made cache mutations immutable.
- **File:** `app/hooks/useMailbox.ts:180,388-400`

### [FE-026] (fixed)
- **Fix:** Added TTL-based expiry to module-level `globalClientsCache`, `globalManagersCache`, and `globalClientDetailsCache` in the clients page. Caches expire after 5 minutes. Added `isClientsCacheValid()` check before using cached data, and timestamp tracking on cache writes.
- **File:** `app/clients/page.tsx:25-40`

### [FE-032] (fixed)
- **Fix:** Added TTL (30 minute default) to `saveToLocalCache` and `getFromLocalCache`. Entries are now stored with an `expiresAt` timestamp. On read, expired entries are removed and return null. Backwards-compatible with legacy entries that lack the TTL wrapper.
- **File:** `app/utils/localCache.ts`

### [FE-033] (fixed)
- **Fix:** Removed unused imports: `getAccountsAction` and `useRealtimeInbox` from `app/page.tsx`; `saveToLocalCache` and `getFromLocalCache` from `app/page.tsx`; `getAccountsAction`, `useRealtimeInbox`, `saveToLocalCache`, `getFromLocalCache`, `avatarColor`, `formatDate`, `cleanBody` from `app/sent/page.tsx`.
- **File:** `app/page.tsx`, `app/sent/page.tsx`

### [FE-034] (fixed)
- **Fix:** Created `app/constants/config.ts` with `DEFAULT_USER_ID` constant that reads from env vars with fallback. Replaced all hardcoded `'1ca1464d-1009-426e-96d5-8c5e8c84faac'` occurrences across 12 owned files: `app/page.tsx`, `app/sent/page.tsx`, `app/clients/page.tsx`, `app/projects/page.tsx`, `app/accounts/page.tsx`, `app/settings/page.tsx`, `app/analytics/page.tsx`, `app/hooks/useMailbox.ts`, `app/components/Sidebar.tsx`, `app/components/ComposeModal.tsx`, `app/components/InlineReply.tsx`, `app/components/AddProjectModal.tsx`.
- **File:** `app/constants/config.ts` and all files listed above

### [FE-036] (fixed)
- **Fix:** Removed the unused `globalSentCache` module variable and its initialization from localStorage. Also removed the now-unused `saveToLocalCache` and `getFromLocalCache` imports from sent page.
- **File:** `app/sent/page.tsx:25-30`

### [FE-037] (fixed)
- **Fix:** Added `role="tablist"` with `aria-label` to the tabs container, and `role="tab"`, `tabIndex={0}`, `aria-selected`, and `onKeyDown` (Enter/Space) handlers to each tab element. Keyboard-only and screen reader users can now navigate and activate pipeline stage tabs.
- **File:** `app/page.tsx:272-293`

### [FE-038] (fixed)
- **Fix:** Added `aria-label` attributes to icon-only buttons: sync/refresh buttons in inbox and sent pages, and back/delete/not-spam/not-interested/reply buttons in the EmailDetail component.
- **File:** `app/page.tsx:256`, `app/sent/page.tsx:153`, `app/components/InboxComponents.tsx:598-638`

### [FE-040] (fixed)
- **Fix:** Wrapped `handleChangeStage` and `handleNotInterested` in try-catch blocks with error toast notifications. On failure, users now see a toast message indicating the action failed. Also renamed the `email` parameter in `handleNotInterested` to `senderEmail` for clarity (FE-031).
- **File:** `app/page.tsx:177-200`

### [FE-041] (fixed)
- **Fix:** Changed `<style jsx global>` to `<style jsx>` (scoped) in the analytics page. Removed the global `::-webkit-scrollbar` styles that were leaking to all pages. Kept only the component-specific styles (`.premium-select:hover`, `.pulse-dot`, `@keyframes pulse`).
- **File:** `app/analytics/page.tsx:397-420`

### [FE-042] (fixed)
- **Fix:** Changed `formatDisplayDate` to parse date strings manually using `split('-')` to create a local `Date` object (`new Date(y, m-1, d)`) instead of `new Date(dateStr)` which parses as UTC midnight and can show the wrong day in negative UTC offset timezones.
- **File:** `app/components/DateRangePicker.tsx:49-52`
