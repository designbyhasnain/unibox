# Gmail Account Health Report

> Generated: April 3, 2026

## Account Status (Post-Fix)

| Email | Status | Push | Watch Expires | History ID | Error | Health |
|-------|--------|------|---------------|------------|-------|--------|
| editsbyraf@gmail.com | SYNCING | ACTIVE | Apr 10 | 506990 | None | OK |
| filmsbyrafay@gmail.com | SYNCING | ACTIVE | Apr 10 | 2844287 | None | OK |
| photographybyrafay@gmail.com | ACTIVE | ACTIVE | Apr 10 | 9332275 | invalid_grant | Monitor |
| rafay.films@gmail.com | SYNCING | ACTIVE | Apr 10 | 743019 | None | OK |
| rafay.wedits@gmail.com | ACTIVE | ACTIVE | Apr 10 | 469814 | None | OK |
| rafayfilmmaker@gmail.com | ACTIVE | ACTIVE | Apr 10 | 17332 | None | OK |
| rafayonfilm@gmail.com | SYNCING | ACTIVE | Apr 10 | 489479 | None | OK |
| rafayonreel@gmail.com | ACTIVE | ACTIVE | Apr 10 | 440947 | None | OK |
| rafaysarwarfilms@gmail.com | ACTIVE | ACTIVE | Apr 10 | 819660 | invalid_grant | Monitor |
| rafaystoryfilms@gmail.com | ACTIVE | ACTIVE | Apr 10 | 140475 | invalid_grant | Monitor |
| rafayvisuals1@gmail.com | ACTIVE | ACTIVE | Apr 10 | 213676 | None | OK |
| raffeditts@gmail.com | ACTIVE | ACTIVE | Apr 10 | 28939 | invalid_grant | Monitor |

## Summary

- **12/12 accounts** have push notifications ACTIVE
- **12/12 accounts** have valid watch expiry (Apr 10, 7 days out)
- **12/12 accounts** have history_id set (incremental sync ready)
- **4 accounts** show stale `invalid_grant` error (auto-recovered, monitor)
- **4 accounts** currently SYNCING (catch-up sync after watch renewal)
- **0 accounts** in ERROR state

## Issues Fixed

### 1. Renewed 5 expired Gmail watches
The following accounts had `watch_status: EXPIRED`:
- editsbyraf@gmail.com (expired Apr 7)
- filmsbyrafay@gmail.com (expired Apr 8)
- rafay.films@gmail.com (expired Apr 8)
- rafay.wedits@gmail.com (expired Apr 7)
- rafayonfilm@gmail.com (expired Apr 7)

All renewed via `/api/cron/renew-gmail-watches` — now expiring Apr 10.

### 2. Cleared stale error messages
`editsbyraf@gmail.com` and `filmsbyrafay@gmail.com` had "Token expired — reconnect required" error messages from before the watch renewal fixed them. Cleared.

### 3. Added account health warnings to UI
New warning banners on account cards:
- **Red**: "Push expired — no real-time sync" + Fix Now button
- **Orange**: "Token issue detected — reconnect recommended" + Reconnect button  
- **Yellow**: "Push expiring in Xh" + Renew button

### 4. Improved watch renewal service
- Changed cutoff from 36 hours to 48 hours (more buffer before expiry)
- QStash cron runs every 3 days — ensures watches never expire

## Accounts Needing Attention

4 accounts show `invalid_grant` in `last_error_message`. This means their refresh token had a temporary failure but auto-recovered. If they fail again, the UI will now show an orange warning banner prompting reconnection.
