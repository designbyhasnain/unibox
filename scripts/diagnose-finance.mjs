import 'dotenv/config';
const url = (process.env.DIRECT_URL || '').replace(/[?&]sslmode=[^&]+/g, '');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = await import('pg');
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("set statement_timeout = '60s'");

const time = async (label, sql) => {
    const t = Date.now();
    try {
        const r = await c.query(sql);
        console.log(`  ${label}: ${Date.now()-t}ms — ${JSON.stringify(r.rows[0]).slice(0,80)}`);
    } catch (e) {
        console.log(`  ${label}: TIMEOUT after ${Date.now()-t}ms — ${e.message.slice(0,80)}`);
    }
};

console.log('Timing variations:');
await time('count(*) on projects', 'select count(*)::int as n from projects');
await time('count + date filter', `select count(*)::int as n from projects where created_at >= '2025-01-01' and created_at <= '2026-12-31'`);
await time('sum(project_value)', `select sum(project_value)::float as v from projects where created_at >= '2025-01-01' and created_at <= '2026-12-31'`);
await time('count(*) on contacts', 'select count(*)::int as n from contacts');
await time('LEFT JOIN contacts (limit 50)', `select count(*)::int as n from (select p.id from projects p left join contacts c on c.id = p.client_id where p.paid_status <> 'PAID' and p.created_at >= '2025-01-01' limit 50) sub`);
await time('aging days30plus', `select count(*)::int as n from projects where paid_status <> 'PAID' and due_date < now() - interval '30 days'`);

console.log('\nWith session_replication_role=replica (skip triggers):');
await c.query("set session_replication_role = replica");
await time('full v2 RPC', `select get_finance_summary('2025-01-01'::timestamptz, '2026-12-31'::timestamptz) as v`);

await c.end();
