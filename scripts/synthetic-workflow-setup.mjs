// Synthetic workflow setup — creates 3 sentinel users for the SALES↔EDITOR↔ADMIN
// discovery run. Idempotent: re-running updates password + role on existing rows
// rather than inserting duplicates.
//
// Pattern reused from scripts/set-role-admin.mjs (Supabase service-role client)
// and app/api/auth/set-password/route.ts:45 (bcryptjs 12 rounds).
//
// Usage:
//   node scripts/synthetic-workflow-setup.mjs
//
// Output (success):
//   - prints created/updated user IDs
//   - exits 0
//
// Cleanup is paired with scripts/synthetic-workflow-cleanup.mjs (run with --apply).

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}
const supabase = createClient(url, key);

const PASSWORD = 'Synthetic-2026';
const SENTINELS = [
    { email: 'test-sales-synthetic@texasbrains.com',  name: '[SYN] Sales Tester',  role: 'SALES' },
    { email: 'test-editor-synthetic@texasbrains.com', name: '[SYN] Editor Tester', role: 'VIDEO_EDITOR' },
    { email: 'test-admin-synthetic@texasbrains.com',  name: '[SYN] Admin Tester',  role: 'ADMIN' },
];

console.log('\nSynthetic workflow setup — creating 3 sentinel users\n');

const passwordHash = await bcrypt.hash(PASSWORD, 12);

const results = [];
for (const sentinel of SENTINELS) {
    const existing = await supabase
        .from('users')
        .select('id, email, role')
        .eq('email', sentinel.email)
        .maybeSingle();

    if (existing.data) {
        // Update password + role (idempotent re-runs).
        const upd = await supabase
            .from('users')
            .update({ password: passwordHash, role: sentinel.role, name: sentinel.name, crm_status: 'ACTIVE' })
            .eq('id', existing.data.id)
            .select('id, email, role')
            .single();
        if (upd.error) {
            console.error(`  ✗ update failed for ${sentinel.email}:`, upd.error.message);
            process.exit(1);
        }
        console.log(`  ✓ updated  ${upd.data.id}  ${upd.data.email}  ${upd.data.role}`);
        results.push(upd.data);
    } else {
        const ins = await supabase
            .from('users')
            .insert({
                email: sentinel.email,
                name: sentinel.name,
                role: sentinel.role,
                password: passwordHash,
                crm_status: 'ACTIVE',
            })
            .select('id, email, role')
            .single();
        if (ins.error) {
            console.error(`  ✗ insert failed for ${sentinel.email}:`, ins.error.message);
            process.exit(1);
        }
        console.log(`  ✓ inserted ${ins.data.id}  ${ins.data.email}  ${ins.data.role}`);
        results.push(ins.data);
    }
}

console.log(`\nSentinels ready (password: ${PASSWORD}). Hand off to the browser-driven run.\n`);
console.log('Cleanup when done:  node scripts/synthetic-workflow-cleanup.mjs --apply\n');
