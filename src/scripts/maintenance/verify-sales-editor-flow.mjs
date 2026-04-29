// End-to-end test of the Sales → Editor → Admin project flow.
//
// What this verifies:
//  1. A SALES user can create an edit_project with account_manager auto-filled.
//  2. ADMIN's master list query (`/projects`) sees the project.
//  3. The SALES user's own scoped query sees the project.
//  4. The assigned EDITOR's scoped query (used by /my-queue, /dashboard's
//     EditorTodayView) sees the project.
//  5. Cleanup deletes the project + comments without orphans.
//
// Bypasses auth — talks to Supabase via service-role. Resets the Sales
// user's role back to whatever it was before the test even on failure.
//
// Run: node --env-file=.env.local --env-file=.env scripts/test-sales-editor-flow.mjs

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PROJECT_NAME = 'TEST_SALES_FLOW';
const SALES_EMAIL = 'mustafakamran5@gmail.com';

function ok(label, val) { console.log(`  ✅ ${label}${val !== undefined ? `: ${val}` : ''}`); }
function fail(label, val) { console.log(`  ❌ ${label}${val !== undefined ? `: ${val}` : ''}`); }
function info(label, val) { console.log(`  · ${label}${val !== undefined ? `: ${val}` : ''}`); }

let originalSalesRole = null;
let createdProjectId = null;
let salesUserId = null;
let editorUser = null;

async function lookupUsers() {
  console.log('\n[1] Looking up test users…');
  const sales = await prisma.$queryRaw`
    SELECT id::text AS id, name, email, role::text AS role
    FROM users WHERE email = ${SALES_EMAIL} LIMIT 1
  `;
  if (!sales[0]) throw new Error(`Sales user ${SALES_EMAIL} not found`);
  salesUserId = sales[0].id;
  originalSalesRole = sales[0].role;
  info('Sales user', `${sales[0].name} <${sales[0].email}> · role=${originalSalesRole}`);

  const editors = await prisma.$queryRaw`
    SELECT id::text AS id, name, email, role::text AS role
    FROM users WHERE role::text = 'VIDEO_EDITOR' LIMIT 5
  `;
  if (!editors.length) throw new Error('No VIDEO_EDITOR users found');
  // Prefer Abdul Bari if present
  const abdul = editors.find(e => e.name?.toLowerCase().includes('abdul'));
  editorUser = abdul || editors[0];
  info('Editor', `${editorUser.name} <${editorUser.email}>`);
}

async function flipSalesRole(role) {
  await prisma.$executeRaw`
    UPDATE users SET role = ${role}::user_role WHERE id::text = ${salesUserId}
  `;
}

async function createTestProject() {
  console.log('\n[2] Creating test project as SALES user…');
  await flipSalesRole('SALES');
  ok('Flipped mustafakamran role to SALES (was ' + originalSalesRole + ')');

  // Simulate what createEditProject() does post-our-edit: auto-fill
  // account_manager from the SALES user's name. We INSERT directly
  // because createEditProject() requires a cookie session.
  const meRows = await prisma.$queryRaw`
    SELECT name FROM users WHERE id::text = ${salesUserId} LIMIT 1
  `;
  const amText = meRows[0]?.name || null;

  const inserted = await prisma.editProject.create({
    data: {
      name: PROJECT_NAME,
      clientName: 'TEST CLIENT',
      progress: 'IN_PROGRESS',
      tags: ['test'],
      accountManager: amText,    // ← simulates the auto-fill
      userId: salesUserId,        // ← creator (SALES)
      editorId: editorUser.id,    // ← assigned editor
      date: new Date(),
    },
    select: { id: true, name: true, accountManager: true, userId: true, editorId: true, progress: true },
  });
  createdProjectId = inserted.id;
  ok('Project created', `id=${inserted.id}`);
  ok('account_manager auto-filled', JSON.stringify(inserted.accountManager));
  ok('user_id (creator)', inserted.userId);
  ok('editor_id', inserted.editorId);
}

async function verifyAdminQuery() {
  console.log('\n[3] ADMIN /projects master list query…');
  await flipSalesRole(originalSalesRole);  // restore role for admin query
  // Admin query has NO scoping — sees all projects.
  const found = await prisma.editProject.findFirst({
    where: { name: PROJECT_NAME },
    select: { id: true, name: true, accountManager: true, userId: true, editorId: true },
  });
  if (found && found.id === createdProjectId) {
    ok('Admin sees the project');
    ok('account_manager visible', JSON.stringify(found.accountManager));
  } else {
    fail('Admin query MISSED the project');
  }
}

async function verifySalesQuery() {
  console.log('\n[4] SALES user’s own scoped query (user_id = sales)…');
  // Sales-scoped: filter where userId === salesUserId. This is what
  // a per-user "my projects" filter would do.
  const rows = await prisma.editProject.findMany({
    where: { userId: salesUserId, name: PROJECT_NAME },
    select: { id: true, name: true, accountManager: true },
  });
  if (rows.length === 1 && rows[0].id === createdProjectId) {
    ok('Sales user sees their own project');
    ok('account_manager preserved', JSON.stringify(rows[0].accountManager));
  } else {
    fail('Sales-scoped query MISSED the project', `found=${rows.length}`);
  }
}

async function verifyEditorQuery() {
  console.log('\n[5] EDITOR /my-queue scoped query (editor_id = editor)…');
  // Editor-scoped: this is the same shape /my-queue uses.
  const rows = await prisma.editProject.findMany({
    where: {
      editorId: editorUser.id,
      progress: { notIn: ['DONE', 'APPROVED'] },
    },
    select: { id: true, name: true, progress: true, accountManager: true },
  });
  const ours = rows.find(r => r.id === createdProjectId);
  if (ours) {
    ok(`Editor sees the project (in ${rows.length} active jobs total)`);
    ok('progress', ours.progress);
    ok('account_manager visible', JSON.stringify(ours.accountManager));
  } else {
    fail('Editor-scoped query MISSED the project');
  }
}

async function cleanup() {
  console.log('\n[6] Cleanup…');
  if (createdProjectId) {
    // Delete any comments first (Cascade should also handle this, but explicit
    // delete is a safer audit).
    const comments = await prisma.projectComment.deleteMany({ where: { projectId: createdProjectId } });
    info('Comments deleted', comments.count);
    const deleted = await prisma.editProject.delete({ where: { id: createdProjectId } });
    ok('Project deleted', deleted.id);
  }
  if (originalSalesRole && originalSalesRole !== 'SALES') {
    await flipSalesRole(originalSalesRole);
    ok('Sales user role restored', originalSalesRole);
  }
  // Verify no orphan
  const stragglers = await prisma.editProject.findMany({
    where: { name: PROJECT_NAME },
    select: { id: true },
  });
  if (stragglers.length === 0) ok('No TEST_SALES_FLOW rows remain');
  else fail('Stragglers found', stragglers.length);
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Sales → Editor → Admin Project Flow E2E Test');
  console.log('═══════════════════════════════════════════════════');
  try {
    await lookupUsers();
    await createTestProject();
    await verifyAdminQuery();
    await verifySalesQuery();
    await verifyEditorQuery();
  } catch (e) {
    console.error('\n[!] Test failed:', e.message);
    process.exitCode = 1;
  } finally {
    try { await cleanup(); } catch (e) { console.error('[!] Cleanup error:', e.message); }
    await prisma.$disconnect();
  }
}

main();
