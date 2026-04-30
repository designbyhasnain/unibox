// Phase 5 lockdown — re-link orphan email_messages.contact_id rows.
//
// Audit found 16,559 email_messages rows whose contact_id pointed at a
// deleted contact. This script:
//   1. Finds those orphans (contact_id set, but no matching contacts row).
//   2. For each orphan's from_email, tries to find a current contact by
//      email match (case-insensitive). If found, re-link.
//   3. Otherwise NULLs contact_id so the row is no longer broken.
//
// Default mode is dry-run. Pass --apply to commit changes.
//
// Usage:  node scripts/repair-orphan-emails.mjs            (dry-run)
//         node scripts/repair-orphan-emails.mjs --apply

import 'dotenv/config';

const apply = process.argv.includes('--apply');

const url = (process.env.DIRECT_URL || process.env.DATABASE_URL || '')
    .replace(/[?&]sslmode=[^&]+/g, '')
    .replace(/[?&]uselibpqcompat=[^&]+/g, '');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = await import('pg');
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

// Bump the per-statement timeout — Supabase pooler defaults to 30s and the
// trigger sync_thread_summary fires per-row, blowing past it on big batches.
await c.query("set statement_timeout = '5min'");
// Skip triggers for this session — sync_thread_summary fires on every
// email_messages update and serializes the NULL.
await c.query("set session_replication_role = replica");

console.log(`Repair orphan emails — ${apply ? 'APPLY' : 'DRY-RUN'}`);

// Step 1: count orphans up front.
const totalQ = await c.query(`
    select count(*)::int as n
    from email_messages em
    where em.contact_id is not null
      and not exists (select 1 from contacts cc where cc.id = em.contact_id)
`);
const totalOrphans = totalQ.rows[0].n;
console.log(`\nTotal orphan rows: ${totalOrphans.toLocaleString()}`);

if (totalOrphans === 0) {
    console.log('Nothing to do.');
    await c.end();
    process.exit(0);
}

// Step 2: re-link by counterparty email (RECEIVED → from_email; SENT → to_email).
//   email_messages stores `from_email` and `to_email` in `Name <email>` form,
//   so we extract the angle-bracketed address before matching against contacts.
//   Only re-link when exactly one contact matches (case-insensitive).
console.log('\nStep 1 of 2: re-link by counterparty email match…');
const extractEmailExpr = `
    lower(coalesce(
        nullif(regexp_replace(case when em2.direction = 'SENT' then em2.to_email else em2.from_email end,
                              '.*<([^>]+)>.*', '\\1'),
               case when em2.direction = 'SENT' then em2.to_email else em2.from_email end),
        case when em2.direction = 'SENT' then em2.to_email else em2.from_email end
    ))
`;
const relinkSql = `
    update email_messages em
    set contact_id = sub.cid
    from (
        select em2.id as eid, c.id as cid
        from email_messages em2
        join contacts c on lower(c.email) = ${extractEmailExpr}
        where em2.contact_id is not null
          and not exists (select 1 from contacts cc where cc.id = em2.contact_id)
          and ${extractEmailExpr} <> ''
          and ${extractEmailExpr} <> 'mailer-daemon@googlemail.com'
          and not exists (
              select 1 from contacts c2
              where lower(c2.email) = ${extractEmailExpr}
                and c2.id <> c.id
          )
    ) sub
    where em.id = sub.eid
`;

if (apply) {
    const r = await c.query(relinkSql);
    console.log(`  ✓ relinked ${r.rowCount.toLocaleString()} rows by counterparty email`);
} else {
    // Count what we WOULD relink.
    const dryQ = await c.query(`
        select count(*)::int as n
        from email_messages em2
        join contacts c on lower(c.email) = ${extractEmailExpr}
        where em2.contact_id is not null
          and not exists (select 1 from contacts cc where cc.id = em2.contact_id)
          and ${extractEmailExpr} <> ''
          and ${extractEmailExpr} <> 'mailer-daemon@googlemail.com'
          and not exists (
              select 1 from contacts c2
              where lower(c2.email) = ${extractEmailExpr}
                and c2.id <> c.id
          )
    `);
    console.log(`  would re-link ${dryQ.rows[0].n.toLocaleString()} rows`);
}

// Step 3: NULL out the rest. Batched in chunks of 1000 to avoid the
//   Supabase statement_timeout that fires on broad UPDATEs.
console.log('\nStep 2 of 2: NULL remaining orphans (no matching contact)…');
const nullBatchSql = `
    with batch as (
        select em.id from email_messages em
        where em.contact_id is not null
          and not exists (select 1 from contacts cc where cc.id = em.contact_id)
        limit 500
    )
    update email_messages em
    set contact_id = null
    where em.id in (select id from batch)
`;

if (apply) {
    let total = 0;
    while (true) {
        const r = await c.query(nullBatchSql);
        total += r.rowCount;
        if (r.rowCount === 0) break;
        if (total % 5000 === 0) console.log(`  …NULLed ${total.toLocaleString()} so far`);
    }
    console.log(`  ✓ NULLed ${total.toLocaleString()} remaining orphans`);
} else {
    const remaining = await c.query(`
        select count(*)::int as n
        from email_messages em
        where em.contact_id is not null
          and not exists (select 1 from contacts cc where cc.id = em.contact_id)
    `);
    console.log(`  would NULL ~${remaining.rows[0].n.toLocaleString()} remaining`);
}

// Step 4: verify clean.
const verifyQ = await c.query(`
    select count(*)::int as n
    from email_messages em
    where em.contact_id is not null
      and not exists (select 1 from contacts cc where cc.id = em.contact_id)
`);
console.log(`\nFinal orphan count: ${verifyQ.rows[0].n.toLocaleString()}`);

await c.end();
