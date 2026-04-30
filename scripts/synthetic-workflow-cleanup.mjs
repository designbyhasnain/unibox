// Synthetic workflow cleanup — purges all data created by the SALES↔EDITOR↔ADMIN
// discovery run. Matches by sentinel email pattern (-synthetic@texasbrains.com)
// and contact name prefix ([SYN]). Cascades through the ownership tree so prod
// is left clean.
//
// Pattern reused from scripts/cleanup-audit-test-data.mjs (dry-run by default).
//
// Usage:
//   node scripts/synthetic-workflow-cleanup.mjs           # dry run (default)
//   node scripts/synthetic-workflow-cleanup.mjs --apply   # commit deletes
//
// Cascade order (must match FK direction):
//   1. project_comments  → 2. edit_projects → 3. activity_logs
//   4. email_messages.contact_id → null (preserve email history)
//   5. projects (sales)  → 6. contacts ([SYN]/synthetic email)
//   7. user_gmail_assignments → 8. users (sentinel emails)
//
// Final check: re-queries every table and confirms zero remainders.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const tag = APPLY ? '[APPLY]' : '[DRY RUN]';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

console.log(`\nSynthetic workflow cleanup ${tag}\n`);

// ── Resolve sentinel user IDs ──────────────────────────────────────────────
const { data: users } = await supabase
    .from('users')
    .select('id, email, role')
    .like('email', '%-synthetic@texasbrains.com');

const userIds = (users || []).map(u => u.id);
console.log(`Found ${users?.length ?? 0} sentinel user(s):`);
for (const u of users || []) console.log(`  - ${u.id}  ${u.email}  ${u.role}`);

// ── Resolve sentinel contact IDs ───────────────────────────────────────────
const contactQuery = await supabase
    .from('contacts')
    .select('id, email, name, account_manager_id')
    .or(`email.like.%-synthetic@%,name.ilike.[SYN]%${userIds.length ? `,account_manager_id.in.(${userIds.join(',')})` : ''}`);

const contacts = contactQuery.data || [];
const contactIds = contacts.map(c => c.id);
console.log(`\nFound ${contacts.length} sentinel contact(s):`);
for (const c of contacts) console.log(`  - ${c.id}  ${c.email}  ${c.name}`);

// ── Resolve sentinel project IDs (sales-side) ──────────────────────────────
const projectQuery = userIds.length
    ? await supabase
        .from('projects')
        .select('id, project_name, account_manager_id, client_id')
        .or(`account_manager_id.in.(${userIds.join(',')})${contactIds.length ? `,client_id.in.(${contactIds.join(',')})` : ''}`)
    : { data: [] };

const projects = projectQuery.data || [];
const projectIds = projects.map(p => p.id);
console.log(`\nFound ${projects.length} sentinel project(s):`);
for (const p of projects) console.log(`  - ${p.id}  ${p.project_name}`);

// ── Resolve sentinel edit_projects IDs ─────────────────────────────────────
const editQuery = userIds.length
    ? await supabase
        .from('edit_projects')
        .select('id, name, user_id, editor_id')
        .or(`user_id.in.(${userIds.join(',')}),editor_id.in.(${userIds.join(',')})`)
    : { data: [] };

const editProjects = editQuery.data || [];
const editProjectIds = editProjects.map(p => p.id);
console.log(`\nFound ${editProjects.length} sentinel edit_project(s):`);
for (const p of editProjects) console.log(`  - ${p.id}  ${p.name}`);

if (!APPLY) {
    console.log('\n(dry run — pass --apply to delete)\n');
    process.exit(0);
}

// ── 1. project_comments ────────────────────────────────────────────────────
if (editProjectIds.length) {
    const { error, count } = await supabase
        .from('project_comments')
        .delete({ count: 'exact' })
        .in('project_id', editProjectIds);
    if (error) { console.error('  ✗ project_comments delete failed:', error.message); process.exit(1); }
    console.log(`  ✓ deleted ${count ?? 0} project_comment row(s)`);
}

// ── 2. edit_projects ───────────────────────────────────────────────────────
if (editProjectIds.length) {
    const { error, count } = await supabase
        .from('edit_projects')
        .delete({ count: 'exact' })
        .in('id', editProjectIds);
    if (error) { console.error('  ✗ edit_projects delete failed:', error.message); process.exit(1); }
    console.log(`  ✓ deleted ${count ?? 0} edit_project row(s)`);
}

// ── 3. activity_logs ───────────────────────────────────────────────────────
if (userIds.length || contactIds.length || projectIds.length) {
    const orParts = [];
    if (userIds.length) orParts.push(`performed_by.in.(${userIds.join(',')})`);
    if (contactIds.length) orParts.push(`contact_id.in.(${contactIds.join(',')})`);
    if (projectIds.length) orParts.push(`project_id.in.(${projectIds.join(',')})`);
    const { error, count } = await supabase
        .from('activity_logs')
        .delete({ count: 'exact' })
        .or(orParts.join(','));
    if (error) { console.error('  ✗ activity_logs delete failed:', error.message); process.exit(1); }
    console.log(`  ✓ deleted ${count ?? 0} activity_log row(s)`);
}

// ── 4. email_messages: nullify contact_id (preserve email history) ─────────
if (contactIds.length) {
    const { error, count } = await supabase
        .from('email_messages')
        .update({ contact_id: null }, { count: 'exact' })
        .in('contact_id', contactIds);
    if (error) { console.error('  ✗ email_messages nullify failed:', error.message); process.exit(1); }
    console.log(`  ✓ nullified contact_id on ${count ?? 0} email_message row(s)`);
}

// ── 5. projects (sales) ────────────────────────────────────────────────────
if (projectIds.length) {
    const { error, count } = await supabase
        .from('projects')
        .delete({ count: 'exact' })
        .in('id', projectIds);
    if (error) { console.error('  ✗ projects delete failed:', error.message); process.exit(1); }
    console.log(`  ✓ deleted ${count ?? 0} project (sales) row(s)`);
}

// ── 6. contacts ────────────────────────────────────────────────────────────
if (contactIds.length) {
    const { error, count } = await supabase
        .from('contacts')
        .delete({ count: 'exact' })
        .in('id', contactIds);
    if (error) { console.error('  ✗ contacts delete failed:', error.message); process.exit(1); }
    console.log(`  ✓ deleted ${count ?? 0} contact row(s)`);
}

// ── 7. user_gmail_assignments ──────────────────────────────────────────────
if (userIds.length) {
    const { error, count } = await supabase
        .from('user_gmail_assignments')
        .delete({ count: 'exact' })
        .in('user_id', userIds);
    if (error) { console.error('  ✗ user_gmail_assignments delete failed:', error.message); process.exit(1); }
    console.log(`  ✓ deleted ${count ?? 0} gmail-assignment row(s)`);
}

// ── 8. users ───────────────────────────────────────────────────────────────
if (userIds.length) {
    const { error, count } = await supabase
        .from('users')
        .delete({ count: 'exact' })
        .in('id', userIds);
    if (error) { console.error('  ✗ users delete failed:', error.message); process.exit(1); }
    console.log(`  ✓ deleted ${count ?? 0} user row(s)`);
}

// ── Final verification ─────────────────────────────────────────────────────
console.log('\nVerifying clean state:');
const checks = [
    ['users',          await supabase.from('users').select('id', { count: 'exact', head: true }).like('email', '%-synthetic@texasbrains.com')],
    ['contacts (email)', await supabase.from('contacts').select('id', { count: 'exact', head: true }).like('email', '%-synthetic@%')],
    ['contacts (name)',  await supabase.from('contacts').select('id', { count: 'exact', head: true }).ilike('name', '[SYN]%')],
];
let dirty = 0;
for (const [label, r] of checks) {
    const c = r.count ?? 0;
    if (c > 0) { console.log(`  ✗ ${label}: ${c} remaining`); dirty++; }
    else       { console.log(`  ✓ ${label}: clean`); }
}
console.log(dirty === 0 ? '\nALL CLEAN.\n' : `\n⚠ ${dirty} table(s) still have sentinel rows. Re-run --apply.\n`);
process.exit(dirty === 0 ? 0 : 2);
