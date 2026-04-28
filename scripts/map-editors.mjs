/**
 * One-shot maintenance: case-insensitively match edit_projects.editor (free-form
 * string) against active VIDEO_EDITOR users and backfill the new editor_id FK.
 *
 * Usage:
 *   node scripts/map-editors.mjs            # show what would change
 *   node scripts/map-editors.mjs --write    # apply
 *
 * Strategy:
 *   1. Pull all VIDEO_EDITOR users (id, name, email).
 *   2. For each match candidate, build a normalized lookup table:
 *        - exact name (case-insensitive trim)
 *        - first-name token (e.g. "Bilal" matches "Bilal Asad Ansari")
 *        - email local-part (e.g. "bilalasadansari" → user)
 *   3. For each edit_project with `editor` set and `editor_id` NULL, look up.
 *   4. Print a table; if --write, do the UPDATE.
 *
 * Safe to re-run — only touches rows where editor_id IS NULL.
 *
 * Requires the editor_id column to exist (run scripts/add-editor-id.sql first).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const WRITE = process.argv.includes('--write');

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function norm(s) { return (s || '').toLowerCase().trim().replace(/\s+/g, ' '); }
function firstName(s) { return norm(s).split(' ')[0] || ''; }
function emailLocal(e) { return (e || '').toLowerCase().split('@')[0] || ''; }

async function main() {
    const { data: editors, error: eErr } = await sb
        .from('users')
        .select('id, name, email, role, crm_status')
        .eq('role', 'VIDEO_EDITOR');
    if (eErr) { console.error('Failed to load editors:', eErr); process.exit(1); }

    if (!editors || editors.length === 0) {
        console.log('No VIDEO_EDITOR users found. Nothing to map.');
        return;
    }

    // Active editors only.
    const active = editors.filter(e => e.crm_status !== 'REVOKED');

    // Build lookup: every key (full name, first name, email local) → editor row.
    // First-match-wins to keep behaviour deterministic.
    const lookup = new Map();
    const addKey = (k, e) => { if (k && !lookup.has(k)) lookup.set(k, e); };
    for (const e of active) {
        addKey(norm(e.name), e);
        addKey(firstName(e.name), e);
        addKey(emailLocal(e.email), e);
    }

    const { data: projects, error: pErr } = await sb
        .from('edit_projects')
        .select('id, name, editor, editor_id, user_id')
        .not('editor', 'is', null)
        .is('editor_id', null);
    if (pErr) {
        // If the column doesn't exist yet, surface a clear hint.
        if (/column .*editor_id/i.test(pErr.message || '')) {
            console.error('editor_id column missing. Run scripts/add-editor-id.sql in the Supabase SQL editor first.');
            process.exit(2);
        }
        console.error('Failed to load projects:', pErr); process.exit(1);
    }

    const candidates = projects || [];
    console.log(`${candidates.length} candidate edit_projects with editor string and no editor_id.`);
    console.log(`${active.length} active VIDEO_EDITOR users available.`);

    let matched = 0;
    let unmatched = 0;
    const updates = [];
    const unmatchedSamples = new Map(); // editor string → count

    for (const p of candidates) {
        const tries = [norm(p.editor), firstName(p.editor)];
        let hit = null;
        for (const t of tries) { if (lookup.has(t)) { hit = lookup.get(t); break; } }
        if (hit) {
            matched++;
            updates.push({ id: p.id, name: p.name, editor: p.editor, target: hit });
        } else {
            unmatched++;
            unmatchedSamples.set(norm(p.editor), (unmatchedSamples.get(norm(p.editor)) || 0) + 1);
        }
    }

    console.log(`\n  matched   = ${matched}`);
    console.log(`  unmatched = ${unmatched}\n`);
    if (matched > 0) {
        console.log('Sample matches:');
        for (const u of updates.slice(0, 10)) {
            console.log(`  "${u.editor}" → ${u.target.name} <${u.target.email}>  (project "${u.name.slice(0, 40)}")`);
        }
    }
    if (unmatched > 0) {
        console.log('\nUnmatched editor strings (top 10 by frequency):');
        const sorted = [...unmatchedSamples.entries()].sort((a, b) => b[1] - a[1]);
        for (const [s, c] of sorted.slice(0, 10)) console.log(`  ${c}×  "${s}"`);
    }

    if (!WRITE) {
        console.log('\nDry run. Re-run with --write to apply.');
        return;
    }

    if (updates.length === 0) {
        console.log('\nNothing to write.');
        return;
    }

    console.log(`\nApplying ${updates.length} updates…`);
    let ok = 0, fail = 0;
    // Group by target for batch updates — fewer roundtrips.
    const byTarget = new Map();
    for (const u of updates) {
        const arr = byTarget.get(u.target.id) || [];
        arr.push(u.id);
        byTarget.set(u.target.id, arr);
    }
    for (const [editorId, projectIds] of byTarget.entries()) {
        const { error } = await sb.from('edit_projects').update({ editor_id: editorId }).in('id', projectIds);
        if (error) { fail += projectIds.length; console.error(`  fail ${editorId}:`, error.message); }
        else ok += projectIds.length;
    }
    console.log(`  ok=${ok}  fail=${fail}`);
}

main().catch(e => { console.error(e); process.exit(1); });
