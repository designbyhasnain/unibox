import 'dotenv/config';
const url = (process.env.DIRECT_URL || '').replace(/[?&]sslmode=[^&]+/g, '');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = await import('pg');
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("set statement_timeout = '30s'");

console.log('All indexes on email_messages:');
const r = await c.query(`
    select i.indexname, i.indexdef, pg_size_pretty(pg_relation_size(format('public.%I', i.indexname)::regclass)) as size,
           coalesce(s.idx_scan, 0)::bigint as scan_count
    from pg_indexes i
    left join pg_stat_user_indexes s on s.indexrelname = i.indexname
    where i.schemaname = 'public' and i.tablename = 'email_messages'
    order by scan_count desc
`);
for (const row of r.rows) {
    console.log(`  ${row.indexname.padEnd(60)}  scans=${String(row.scan_count).padEnd(10)} size=${row.size}`);
    console.log(`    ${row.indexdef}`);
}

await c.end();
