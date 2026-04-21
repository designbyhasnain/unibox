// Cleanup script — removes test data created during the 2026-04-21 QA audit.
//
// Deletes:
//   - Contact with email='test-bughunt@texasbrains.com' (Test BugHunt).
//   - Campaign(s) named 'Test Campaign' with status='ARCHIVED' (draft-archived
//     during the destructive-test pass; safe to hard-delete since no emails
//     were ever sent).
//
// Dry-run by default. Pass --apply to actually delete.
//
// Usage:
//   node scripts/cleanup-audit-test-data.mjs
//   node scripts/cleanup-audit-test-data.mjs --apply

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const tag = APPLY ? '[APPLY]' : '[DRY RUN]';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

console.log(`\nQA audit test-data cleanup ${tag}\n`);

// ── Contact: Test BugHunt ──────────────────────────────────────────────
const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, email, created_at')
    .eq('email', 'test-bughunt@texasbrains.com');

console.log(`Found ${contacts?.length ?? 0} matching contact row(s):`);
for (const c of contacts || []) console.log(`  - ${c.id}  ${c.email}  ${c.name}  ${c.created_at}`);

if (APPLY && contacts?.length) {
    const ids = contacts.map(c => c.id);
    // Preserve email history (matches removeClientsAction behaviour).
    await supabase.from('email_messages').update({ contact_id: null }).in('contact_id', ids);
    const { error } = await supabase.from('contacts').delete().in('id', ids);
    if (error) { console.error('  ✗ contact delete failed:', error.message); process.exit(1); }
    console.log(`  ✓ deleted ${ids.length} contact(s)`);
} else if (!APPLY && contacts?.length) {
    console.log('  (would delete — pass --apply)');
}

// ── Campaigns: Test Campaign (ARCHIVED) ────────────────────────────────
const { data: campaigns, error: campErr } = await supabase
    .from('campaigns')
    .select('id, name, status, created_at')
    .ilike('name', 'test campaign%');
if (campErr) console.warn('  campaign query error:', campErr.message);

console.log(`\nFound ${campaigns?.length ?? 0} test campaign(s):`);
for (const c of campaigns || []) console.log(`  - ${c.id}  "${c.name}"  status=${c.status}  ${c.created_at}`);

const deletable = (campaigns || []).filter(c =>
    c.status === 'ARCHIVED' || c.status === 'DRAFT'
);
const unsafe = (campaigns || []).filter(c => c.status !== 'ARCHIVED' && c.status !== 'DRAFT');
if (unsafe.length) {
    console.log(`  ⚠ ${unsafe.length} campaign(s) are NOT draft/archived — leaving alone.`);
}

if (APPLY && deletable.length) {
    const ids = deletable.map(c => c.id);
    // Clear child rows first (campaign_emails has FK on campaign_id).
    await supabase.from('campaign_emails').delete().in('campaign_id', ids);
    await supabase.from('campaign_contacts').delete().in('campaign_id', ids);
    await supabase.from('campaign_send_queue').delete().in('campaign_id', ids);
    await supabase.from('campaign_variants').delete().in('step_id',
        ((await supabase.from('campaign_steps').select('id').in('campaign_id', ids)).data || []).map((r) => r.id)
    );
    await supabase.from('campaign_steps').delete().in('campaign_id', ids);
    await supabase.from('campaign_analytics').delete().in('campaign_id', ids);
    const { error } = await supabase.from('campaigns').delete().in('id', ids);
    if (error) { console.error('  ✗ campaign delete failed:', error.message); process.exit(1); }
    console.log(`  ✓ deleted ${ids.length} campaign(s) + related rows`);
} else if (!APPLY && deletable.length) {
    console.log('  (would delete — pass --apply)');
}

console.log(`\nDone ${tag}\n`);
