# Domain Email Accounts Report

> Date: April 3, 2026

## Account Inventory

### Gmail Accounts (12) — All Working

| Email | Type | Status | Push | Last Sync | Emails |
|-------|------|--------|------|-----------|--------|
| editsbyraf@gmail.com | OAuth | ACTIVE | ACTIVE (Apr 10) | 11:08 today | Many |
| filmsbyrafay@gmail.com | OAuth | ACTIVE | ACTIVE (Apr 10) | 11:08 today | Many |
| photographybyrafay@gmail.com | OAuth | ACTIVE | ACTIVE (Apr 10) | 11:08 today | Many |
| rafay.films@gmail.com | OAuth | ACTIVE | ACTIVE (Apr 10) | 11:08 today | Many |
| rafay.wedits@gmail.com | OAuth | ACTIVE | ACTIVE (Apr 10) | 11:08 today | Many |
| rafayfilmmaker@gmail.com | OAuth | ACTIVE | ACTIVE (Apr 10) | 11:08 today | Many |
| rafayonfilm@gmail.com | OAuth | ACTIVE | ACTIVE (Apr 10) | 11:08 today | Many |
| rafayonreel@gmail.com | OAuth | ACTIVE | ACTIVE (Apr 10) | 11:08 today | Many |
| rafaysarwarfilms@gmail.com | OAuth | ACTIVE | ACTIVE (Apr 10) | 11:08 today | Many |
| rafaystoryfilms@gmail.com | OAuth | ACTIVE | ACTIVE (Apr 10) | 11:08 today | Many |
| rafayvisuals1@gmail.com | OAuth | ACTIVE | ACTIVE (Apr 10) | 11:08 today | Many |
| raffeditts@gmail.com | OAuth | ACTIVE | ACTIVE (Apr 10) | 11:08 today | Many |

### Domain Accounts (16) — @filmsbyrafay.com — IMAP/SMTP

| Email | Type | Status | IMAP Test | Inbox | Synced Emails | Issue |
|-------|------|--------|-----------|-------|---------------|-------|
| cinematic@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Never synced |
| color@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Never synced |
| creator@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Never synced |
| cuts@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Never synced |
| director@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Never synced |
| frame@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Never synced |
| motion@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Never synced |
| postproduction@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Never synced |
| rafay.edit@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Never synced |
| rafay.s@filmsbyrafay.com | IMAP | ACTIVE | OK | 3 | 0 | Never synced |
| rafay.work@filmsbyrafay.com | IMAP | ACTIVE | OK | 2 | 0 | Never synced |
| rafay@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Was stuck SYNCING — fixed |
| sequence@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Never synced |
| team@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Never synced |
| vision@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Never synced |
| work@filmsbyrafay.com | IMAP | ACTIVE | OK | 1 | 0 | Never synced |

## Test Results

### IMAP Connection Test: 16/16 PASS
All accounts successfully connect to `mail.filmsbyrafay.com:993` via SSL with encrypted app passwords.

### Issues Found and Fixed

1. **rafay@filmsbyrafay.com stuck in SYNCING state** — Reset to ACTIVE. The initial sync attempt timed out or crashed at 83% progress, leaving it permanently stuck. Our earlier stale-SYNCING recovery fix (from the email sync fix commit) will prevent this from happening again.

### Root Cause: Never Synced

All 16 domain accounts have `last_synced_at: null` and 0 synced emails. The initial sync was never triggered after the accounts were connected. This is expected behavior — IMAP accounts don't have push notifications, so they only sync:
- On initial connect (if the connect flow triggers it)
- When user clicks "Re-sync" on the Accounts page
- Via the "Sync All" button

### Action Required

**To sync all domain accounts, go to the Accounts page and click "Sync All" (top-right button).** This will trigger `syncManualEmails()` for each IMAP account, which:
1. Connects via IMAP to `mail.filmsbyrafay.com:993`
2. Scans INBOX, Sent, Spam, Trash, Drafts
3. Imports the last 6 months of emails
4. Updates `last_synced_at` timestamp

No code changes needed — the accounts are properly configured and working. They just need their first sync triggered from the UI.

### IMAP vs Gmail Feature Comparison

| Feature | Gmail (OAuth) | IMAP (Domain) |
|---------|:---:|:---:|
| Push notifications (real-time) | Yes | No |
| Background polling | Via webhook + cron | Manual only |
| Email sending | Gmail API | SMTP |
| Auto-sync | Every 2 min (webhooks) | On-demand only |
| Tracking pixels | Yes | Yes |
| Campaign sending | Yes | Yes |

### Configuration Details

All domain accounts use:
- **IMAP Host:** mail.filmsbyrafay.com
- **IMAP Port:** 993 (SSL)
- **SMTP Host:** mail.filmsbyrafay.com
- **SMTP Port:** 465 (SSL)
- **Auth:** Email + encrypted app password
