// Database Maintenance Utility (local-only, do NOT run on Vercel)
//
// Four safe phases with explicit BEFORE/AFTER counts and a dry-run default.
//
//   1. Reassign Abdur Rehman's projects to the current admin.
//   2. Link orphan emails to contacts by email match (direction-aware).
//   3. Link orphan projects to contacts via source_email_id lookup.
//   4. Deactivate Abdur Rehman (crm_status=REVOKED). We never hard-delete a
//      user because onDelete: Cascade on gmail_accounts would wipe real mail.
//
// Usage:
//   node scripts/db-maintenance.mjs            # DRY RUN — prints what would change
//   node scripts/db-maintenance.mjs --apply    # apply the changes
//
// Env:
//   ADMIN_EMAIL — target admin to reassign projects to. Defaults to
//                 mustafakamran5@gmail.com (from memory). Override for safety.
//   TARGET_EMAIL — user to reassign + deactivate. Defaults to
//                  abdurrehmanyousufoutlook@gmail.com.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'mustafakamran5@gmail.com';
const TARGET_EMAIL = process.env.TARGET_EMAIL || 'abdurrehmanyousufoutlook@gmail.com';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const line = (c = '-') => console.log(c.repeat(78));
const tag = APPLY ? '[APPLY]' : '[DRY RUN]';

console.log('\n================================================================');
console.log('  Database Maintenance Utility ' + tag);
console.log('================================================================');
console.log(`  admin  : ${ADMIN_EMAIL}`);
console.log(`  target : ${TARGET_EMAIL}`);
console.log();

// ── Resolve users ───────────────────────────────────────────────────────────
const { data: admin } = await supabase.from('users').select('id, name, email, role, crm_status')
    .eq('email', ADMIN_EMAIL).maybeSingle();
const { data: target } = await supabase.from('users').select('id, name, email, role, crm_status')
    .eq('email', TARGET_EMAIL).maybeSingle();

if (!admin) { console.error(`ERROR: admin ${ADMIN_EMAIL} not found in users`); process.exit(1); }
if (!target) { console.error(`ERROR: target ${TARGET_EMAIL} not found in users`); process.exit(1); }
if (admin.id === target.id) { console.error('ERROR: admin and target are the same user'); process.exit(1); }
if (admin.role !== 'ADMIN' && admin.role !== 'ACCOUNT_MANAGER') {
    console.error(`ERROR: ${ADMIN_EMAIL} is not an admin (role=${admin.role})`);
    process.exit(1);
}

console.log(`admin  ${admin.id}  ${admin.name || admin.email}  role=${admin.role} status=${admin.crm_status}`);
console.log(`target ${target.id}  ${target.name || target.email}  role=${target.role} status=${target.crm_status}`);
line();

// ── Phase 1: Reassign projects ───────────────────────────────────────────────
console.log('\n[1] Reassign projects from target -> admin');
const { count: projCountBefore } = await supabase.from('projects').select('id', { count: 'exact', head: true })
    .eq('account_manager_id', target.id);
const { data: projSum } = await supabase.from('projects').select('project_value, paid_status')
    .eq('account_manager_id', target.id);
const totalVal = (projSum || []).reduce((s, p) => s + (p.project_value || 0), 0);
const paidVal = (projSum || []).filter(p => p.paid_status === 'PAID').reduce((s, p) => s + (p.project_value || 0), 0);
console.log(`    Projects currently owned by target: ${projCountBefore ?? 0}`);
console.log(`    Total value: $${Math.round(totalVal).toLocaleString()}  Paid: $${Math.round(paidVal).toLocaleString()}`);

if (APPLY && (projCountBefore ?? 0) > 0) {
    const { error: reassignErr, count } = await supabase
        .from('projects')
        .update({ account_manager_id: admin.id }, { count: 'exact' })
        .eq('account_manager_id', target.id);
    if (reassignErr) { console.error(`    FAILED: ${reassignErr.message}`); process.exit(1); }
    console.log(`    Reassigned: ${count ?? 0}`);
}

// ── Phase 2: Link orphan emails to contacts ─────────────────────────────────
console.log('\n[2] Link orphan emails to contacts by email match');

const { count: orphanEmailsBefore } = await supabase.from('email_messages')
    .select('id', { count: 'exact', head: true })
    .is('contact_id', null);
console.log(`    Orphan emails (contact_id IS NULL): ${orphanEmailsBefore ?? 0}`);

// We process in batches of 500 to stay under PostgREST payload limits.
// Strategy:
//   - For direction=RECEIVED, the external contact is in `from_email`.
//   - For direction=SENT, the external contact is in `to_email`.
//   - Both fields may contain RFC 2822 "Name <addr>" formatting; extract the address.
function extractAddr(raw) {
    if (!raw) return '';
    const m = String(raw).match(/<([^>]+)>/);
    return (m ? m[1] : raw).toLowerCase().trim();
}

let linkedTotal = 0;
const PAGE = 500;

// Strategy: fetch ALL orphan rows ONCE (5k rows is trivial), then process in
// batches without re-querying. Previous version re-queried with `.range(0, N)`
// each iteration — rows whose addresses don't match any contact never disappear
// from the query and kept re-appearing → infinite loop.
const allOrphans = [];
let from = 0;
while (true) {
    const { data: batch } = await supabase
        .from('email_messages')
        .select('id, direction, from_email, to_email')
        .is('contact_id', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
    if (!batch || batch.length === 0) break;
    allOrphans.push(...batch);
    from += batch.length;
    if (batch.length < PAGE) break;
}
console.log(`    Fetched ${allOrphans.length} orphan rows (one-shot scan)`);

// Extract candidate addresses per direction
const addrPairs = allOrphans.map(o => ({
    id: o.id,
    addr: o.direction === 'SENT' ? extractAddr(o.to_email) : extractAddr(o.from_email),
})).filter(p => p.addr && p.addr.includes('@'));

const uniqueAddrs = [...new Set(addrPairs.map(p => p.addr))];
console.log(`    Unique candidate addresses: ${uniqueAddrs.length}`);

// Look up matching contacts in chunks (PostgREST caps IN lists around ~1000)
const contactMap = new Map();
for (let i = 0; i < uniqueAddrs.length; i += 500) {
    const chunk = uniqueAddrs.slice(i, i + 500);
    const { data: contacts } = await supabase.from('contacts').select('id, email').in('email', chunk);
    for (const c of contacts || []) contactMap.set(c.email.toLowerCase(), c.id);
}
console.log(`    Matched to contacts: ${contactMap.size} addresses`);

// Group orphan ids by target contact_id for batched updates
const updates = new Map();
for (const p of addrPairs) {
    const cid = contactMap.get(p.addr);
    if (!cid) continue;
    if (!updates.has(cid)) updates.set(cid, []);
    updates.get(cid).push(p.id);
}
const wouldLink = [...updates.values()].reduce((s, arr) => s + arr.length, 0);
console.log(`    Would link: ${wouldLink}`);

if (!APPLY) {
    console.log(`    Dry run — no updates.`);
} else {
    for (const [cid, ids] of updates) {
        // Chunk each contact's ids to respect payload limits
        for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            const { error } = await supabase.from('email_messages').update({ contact_id: cid }).in('id', chunk);
            if (error) { console.error(`    FAILED batch (contact ${cid}): ${error.message}`); break; }
            linkedTotal += chunk.length;
        }
    }
    console.log(`    Applied: ${linkedTotal}`);
}

if (APPLY) {
    const { count: orphanEmailsAfter } = await supabase.from('email_messages')
        .select('id', { count: 'exact', head: true })
        .is('contact_id', null);
    console.log(`    Before: ${orphanEmailsBefore ?? 0}  Linked: ${linkedTotal}  After: ${orphanEmailsAfter ?? 0}`);
}

// ── Phase 3: Link orphan projects via source_email_id ───────────────────────
console.log('\n[3] Link orphan projects via source_email_id');
const { count: orphanProjectsBefore } = await supabase.from('projects')
    .select('id', { count: 'exact', head: true })
    .is('client_id', null);
console.log(`    Orphan projects (client_id IS NULL): ${orphanProjectsBefore ?? 0}`);

const { data: orphanProjects } = await supabase.from('projects')
    .select('id, source_email_id, person')
    .is('client_id', null);

const withSource = (orphanProjects || []).filter(p => p.source_email_id);
console.log(`    With source_email_id: ${withSource.length}`);

let projLinked = 0;
if (withSource.length > 0) {
    // Bulk lookup email → contact_id
    const emailIds = [...new Set(withSource.map(p => p.source_email_id))];
    const emailContactMap = new Map();
    // Batch in chunks of 500 for safety
    for (let i = 0; i < emailIds.length; i += 500) {
        const chunk = emailIds.slice(i, i + 500);
        const { data: emails } = await supabase.from('email_messages')
            .select('id, contact_id').in('id', chunk).not('contact_id', 'is', null);
        for (const e of emails || []) emailContactMap.set(e.id, e.contact_id);
    }

    const linkableProjects = withSource
        .filter(p => emailContactMap.has(p.source_email_id))
        .map(p => ({ id: p.id, clientId: emailContactMap.get(p.source_email_id) }));
    console.log(`    Resolvable via source email -> contact: ${linkableProjects.length}`);

    if (APPLY && linkableProjects.length > 0) {
        // Group by client_id and batch updates
        const byClient = new Map();
        for (const lp of linkableProjects) {
            if (!byClient.has(lp.clientId)) byClient.set(lp.clientId, []);
            byClient.get(lp.clientId).push(lp.id);
        }
        for (const [clientId, ids] of byClient) {
            const { error } = await supabase.from('projects').update({ client_id: clientId }).in('id', ids);
            if (error) { console.error(`    FAILED: ${error.message}`); break; }
            projLinked += ids.length;
        }
        console.log(`    Linked: ${projLinked}`);
    }
}

if (APPLY) {
    const { count: orphanProjectsAfter } = await supabase.from('projects')
        .select('id', { count: 'exact', head: true })
        .is('client_id', null);
    console.log(`    Before: ${orphanProjectsBefore ?? 0}  Linked: ${projLinked}  After: ${orphanProjectsAfter ?? 0}`);
}

// ── Phase 4: Deactivate target user ─────────────────────────────────────────
console.log('\n[4] Deactivate target user');
console.log(`    Current crm_status: ${target.crm_status}`);
if (target.crm_status === 'REVOKED') {
    console.log(`    Already revoked — nothing to do.`);
} else if (APPLY) {
    const { error } = await supabase.from('users')
        .update({ crm_status: 'REVOKED' })
        .eq('id', target.id);
    if (error) { console.error(`    FAILED: ${error.message}`); process.exit(1); }
    console.log(`    Set crm_status = REVOKED`);
} else {
    console.log(`    Would set crm_status = REVOKED`);
}

line();
if (!APPLY) {
    console.log('\nDRY RUN complete. Re-run with --apply to execute.');
} else {
    console.log('\nAPPLY complete.');
}

process.exit(0);
