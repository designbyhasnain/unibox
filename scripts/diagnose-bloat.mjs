import 'dotenv/config';
const url = (process.env.DIRECT_URL || '').replace(/[?&]sslmode=[^&]+/g, '');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = await import('pg');
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("set statement_timeout = '60s'");

console.log('Bloat / stats / dead tuples on hot tables:');
const r = await c.query(`
    select schemaname, relname,
           n_live_tup, n_dead_tup,
           pg_size_pretty(pg_relation_size(format('%I.%I', schemaname, relname)::regclass)) as table_size,
           pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)) as total_size,
           round(100 * n_dead_tup::numeric / nullif(n_live_tup + n_dead_tup, 0), 1) as dead_pct,
           last_vacuum, last_autovacuum, last_analyze
    from pg_stat_user_tables
    where schemaname = 'public'
      and relname in ('contacts', 'projects', 'email_messages', 'email_threads', 'activity_logs')
    order by n_dead_tup desc nulls last
`);
for (const row of r.rows) {
    console.log(' ', row.relname, `→ ${row.n_live_tup} live / ${row.n_dead_tup} dead (${row.dead_pct}%) — ${row.total_size}`);
    console.log(`     last_vacuum: ${row.last_vacuum}  last_analyze: ${row.last_analyze}`);
}

await c.end();
