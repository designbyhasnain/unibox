// Phase 7 Speed Sprint — VACUUM ANALYZE the hot tables.
//
// Diagnostics showed pg_stat_user_tables.last_vacuum was Feb 25 2026
// (2 months ago) for contacts/email_messages/email_threads/activity_logs,
// and NEVER for projects. Stale statistics caused the planner to pick
// pathological plans (35s count(*) on a 13k-row contacts table). This
// script forces an explicit VACUUM ANALYZE so subsequent queries get
// fresh planner stats.
//
// Run:  node scripts/vacuum-analyze-hot-tables.mjs

import 'dotenv/config';
const url = (process.env.DIRECT_URL || '').replace(/[?&]sslmode=[^&]+/g, '');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = await import('pg');
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
// VACUUM cannot run inside a transaction; supabase pooler is in
// transaction-mode by default. We're using the session-mode pool
// (port 5432) here.
await c.query("set statement_timeout = '10min'");

const tables = ['contacts', 'projects', 'email_messages', 'email_threads', 'activity_logs', 'users'];

for (const t of tables) {
    const start = Date.now();
    try {
        await c.query(`vacuum analyze public.${t}`);
        console.log(`  ✓ vacuum analyze ${t} — ${Date.now()-start}ms`);
    } catch (e) {
        console.log(`  ✗ vacuum analyze ${t} — ${e.message.slice(0, 80)}`);
    }
}

await c.end();
console.log('Done.');
