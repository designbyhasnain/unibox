// Phase 8 — drop the 7 redundant email_messages indexes flagged by Phase 6
// DBA + Phase 7 Architect audits. Picks chosen by actual scan count and
// overlap with higher-traffic siblings:
//
//   idx_email_messages_inbox_v2                              108 scans  →  25 MB
//   email_messages_gmail_account_id_is_spam_sent_at_idx        8 scans  →  10 MB
//   idx_emails_account_tracked_sent                            5 scans  →  7.8 MB
//   idx_emails_delivered_at                                    1 scan   →  2.7 MB
//   idx_email_messages_email_type                             44 scans  →  2.1 MB
//   idx_email_messages_combined_list                         192 scans  →  15 MB
//   idx_email_messages_snippet_trgm                          145 scans  →  128 MB ← biggest waste
//
// Total: ~190 MB returned, ~10% of the 1 GB table size + 7 fewer index
// targets per insert/update.
//
// CONCURRENTLY = no exclusive lock on the table during the drop.
// Run:  node scripts/drop-redundant-email-indexes.mjs

import 'dotenv/config';
const url = (process.env.DIRECT_URL || '').replace(/[?&]sslmode=[^&]+/g, '');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = await import('pg');
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("set statement_timeout = '5min'");

const drops = [
    'idx_email_messages_inbox_v2',
    'email_messages_gmail_account_id_is_spam_sent_at_idx',
    'idx_emails_account_tracked_sent',
    'idx_emails_delivered_at',
    'idx_email_messages_email_type',
    'idx_email_messages_combined_list',
    'idx_email_messages_snippet_trgm',
];

for (const idx of drops) {
    const start = Date.now();
    try {
        await c.query(`drop index concurrently if exists public.${idx}`);
        console.log(`  ✓ dropped ${idx} — ${Date.now()-start}ms`);
    } catch (err) {
        console.log(`  ✗ ${idx} — ${err.message.slice(0, 100)}`);
    }
}

// Verify final count
const r = await c.query(`select count(*)::int as n from pg_indexes where schemaname='public' and tablename='email_messages'`);
console.log(`\nemail_messages now has ${r.rows[0].n} indexes (was 25).`);

await c.end();
