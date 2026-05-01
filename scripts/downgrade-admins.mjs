// Phase 7 lockdown: downgrade OAuth-derived ADMINs to SALES.
// Keep only the 3 real humans flagged in Phase 5 Phase E.
//
// Uses a direct pg connection with statement_timeout=2min and triggers
// disabled (session_replication_role=replica) to dodge the Supabase pooler's
// transaction-mode timeout.
//
// Run once:  node scripts/downgrade-admins.mjs

import 'dotenv/config';

const KEEP_ADMIN = new Set([
    'mustafakamran5@gmail.com',
    'designsbyhasnain@gmail.com',
    'hasnainsiddike6@gmail.com',
]);

const url = (process.env.DIRECT_URL || process.env.DATABASE_URL || '')
    .replace(/[?&]sslmode=[^&]+/g, '')
    .replace(/[?&]uselibpqcompat=[^&]+/g, '');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = await import('pg');
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("set statement_timeout = '2min'");
await c.query("set session_replication_role = replica");

const before = (await c.query(
    `select id, email, role from public.users where role in ('ADMIN', 'ACCOUNT_MANAGER') order by email`
)).rows;

console.log(`Before — ${before.length} admins/account_managers:`);
for (const u of before) console.log(`  ${u.role.padEnd(17)} ${u.email}`);

const toDowngrade = before.filter(u => !KEEP_ADMIN.has(u.email));
console.log(`\nDowngrading ${toDowngrade.length} users → SALES`);

for (const u of toDowngrade) {
    try {
        await c.query(`update public.users set role = 'SALES', updated_at = now() where id = $1`, [u.id]);
        console.log(`  ✓ ${u.email}`);
    } catch (err) {
        console.log(`  ✗ ${u.email} — ${err.message}`);
    }
}

await c.query("set session_replication_role = origin");

const after = (await c.query(
    `select email, role from public.users where role in ('ADMIN', 'ACCOUNT_MANAGER') order by email`
)).rows;
console.log(`\nAfter — ${after.length} admins/account_managers:`);
for (const u of after) console.log(`  ${u.role.padEnd(17)} ${u.email}`);

await c.end();
