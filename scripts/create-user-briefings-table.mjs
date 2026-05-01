// Phase 10 — pre-computed user briefings table.
//
// Each row is the most recent Jarvis daily briefing for a user, computed
// in the background by /api/cron/precompute-briefings (hourly). The
// dashboard reads from this table (~50ms) instead of waiting for Groq
// (~5s).
//
// Idempotent: CREATE IF NOT EXISTS.

import 'dotenv/config';
const url = (process.env.DIRECT_URL || '').replace(/[?&]sslmode=[^&]+/g, '');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = await import('pg');
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("set statement_timeout = '60s'");

await c.query(`
    create table if not exists public.user_briefings (
        user_id uuid primary key references public.users(id) on delete cascade,
        role text not null,
        briefing jsonb not null,
        generated_at timestamptz not null default now()
    )
`);
await c.query(`create index if not exists user_briefings_generated_at_idx on public.user_briefings (generated_at desc)`);
console.log('✓ user_briefings table + index ready');

const r = await c.query(`select count(*)::int as n from public.user_briefings`);
console.log(`  current row count: ${r.rows[0].n}`);

await c.end();
