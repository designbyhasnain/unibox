/**
 * Gmail Account Warm-Up Script
 *
 * Sends 3 unique test emails from every ACTIVE Gmail account
 * to designsbyhasnain@gmail.com with 60-second delays between accounts.
 *
 * Usage:  npx tsx scripts/warmup.ts
 * Dry run: npx tsx scripts/warmup.ts --dry
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env before any imports that use process.env
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

// ── Config ──────────────────────────────────────────────────────────────────
const TARGET_EMAIL = 'designsbyhasnain@gmail.com';
const DELAY_BETWEEN_ACCOUNTS_MS = 60_000; // 60 seconds
const DELAY_BETWEEN_EMAILS_MS = 3_000;    // 3 seconds between emails within same account
const DRY_RUN = process.argv.includes('--dry');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Encryption (mirrors src/utils/encryption.ts) ────────────────────────────
import * as crypto from 'crypto';

const ENC_KEY = process.env.ENCRYPTION_KEY!;
function decrypt(encrypted: string): string {
    const [ivHex, authTagHex, cipherHex] = encrypted.split(':');
    if (!ivHex || !authTagHex || !cipherHex) throw new Error('Invalid encrypted format');
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(ENC_KEY, 'hex'),
        Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ── Email Templates ─────────────────────────────────────────────────────────
function getTemplates(accountEmail: string, accountIndex: number) {
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const id = `WU-${accountIndex.toString().padStart(3, '0')}`;

    return [
        {
            subject: `Project Status Update — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            body: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333">
                <p>Hi team,</p>
                <p>Quick update on current project status. All deliverables are tracking on schedule. Please review the latest assets when you get a chance and let me know if anything needs adjustment.</p>
                <p>Looking forward to syncing up this week.</p>
                <p>Best regards</p>
                <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
                <p style="font-size:11px;color:#999">Sent from ${accountEmail} · ${ts} · Ref: ${id}-A</p>
            </div>`,
        },
        {
            subject: `Weekly Team Sync — Notes & Action Items`,
            body: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333">
                <p>Hello,</p>
                <p>Sharing notes from this week's team sync:</p>
                <ul>
                    <li>Reviewed upcoming deadlines and milestone targets</li>
                    <li>Discussed resource allocation for next sprint</li>
                    <li>Aligned on quality review process improvements</li>
                </ul>
                <p>Please flag any items that need follow-up before our next session.</p>
                <p>Thanks</p>
                <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
                <p style="font-size:11px;color:#999">Sent from ${accountEmail} · ${ts} · Ref: ${id}-B</p>
            </div>`,
        },
        {
            subject: `Quick Follow-Up — Pending Items`,
            body: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333">
                <p>Hi there,</p>
                <p>Just a quick follow-up on the items we discussed recently. Wanted to make sure nothing falls through the cracks. If you have any updates or need anything from my end, please don't hesitate to reach out.</p>
                <p>Have a great rest of the week!</p>
                <p>Cheers</p>
                <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
                <p style="font-size:11px;color:#999">Sent from ${accountEmail} · ${ts} · Ref: ${id}-C</p>
            </div>`,
        },
    ];
}

// ── Gmail Send (standalone, no DB sync) ─────────────────────────────────────
async function sendViaGmail(
    accessToken: string,
    fromEmail: string,
    to: string,
    subject: string,
    body: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
        );
        oauth2Client.setCredentials({ access_token: accessToken });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const raw = Buffer.from(
            [
                `From: ${fromEmail}`,
                `To: ${to}`,
                `Subject: ${utf8Subject}`,
                `MIME-Version: 1.0`,
                `Content-Type: text/html; charset=utf-8`,
                ``,
                body,
            ].join('\r\n'),
        )
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw },
        });

        return { success: true, messageId: res.data.id || undefined };
    } catch (err: any) {
        return { success: false, error: err.message || String(err) };
    }
}

// ── Token Refresh ───────────────────────────────────────────────────────────
async function refreshToken(accountId: string, encryptedRefreshToken: string): Promise<string> {
    const refreshToken = decrypt(encryptedRefreshToken);
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    const newAccessToken = credentials.access_token!;

    await supabase
        .from('gmail_accounts')
        .update({ access_token: newAccessToken })
        .eq('id', accountId);

    return newAccessToken;
}

// ── Sleep ───────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function progressBar(current: number, total: number, width = 30): string {
    const pct = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${pct}%`;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║       Gmail Account Warm-Up Agent                ║');
    console.log('║       Target: designsbyhasnain@gmail.com         ║');
    console.log(`║       Mode: ${DRY_RUN ? 'DRY RUN (no emails sent)' : 'LIVE — sending emails'}${''.padEnd(DRY_RUN ? 4 : 7)}║`);
    console.log('╚══════════════════════════════════════════════════╝\n');

    // Fetch all active accounts
    const { data: accounts, error } = await supabase
        .from('gmail_accounts')
        .select('id, email, access_token, refresh_token, status, connection_method')
        .eq('status', 'ACTIVE')
        .eq('connection_method', 'OAUTH')
        .order('email');

    if (error || !accounts) {
        console.error('❌ Failed to fetch accounts:', error?.message);
        process.exit(1);
    }

    console.log(`📧 Found ${accounts.length} active OAuth accounts\n`);

    const results: { email: string; sent: number; failed: number; errors: string[] }[] = [];
    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i]!;
        const num = `[${(i + 1).toString().padStart(2)}/${accounts.length}]`;
        const templates = getTemplates(acc.email, i + 1);

        console.log(`${num} ${progressBar(i, accounts.length)} ${acc.email}`);

        const accountResult = { email: acc.email, sent: 0, failed: 0, errors: [] as string[] };

        let token = acc.access_token;

        for (let j = 0; j < templates.length; j++) {
            const tpl = templates[j]!;
            const label = `  └─ Email ${j + 1}/3: "${tpl.subject.slice(0, 40)}..."`;

            if (DRY_RUN) {
                console.log(`${label} → [DRY RUN] skipped`);
                accountResult.sent++;
                totalSent++;
                continue;
            }

            let res = await sendViaGmail(token, acc.email, TARGET_EMAIL, tpl.subject, tpl.body);

            // Retry with refreshed token on auth failure
            if (!res.success && (res.error?.includes('401') || res.error?.includes('invalid_grant') || res.error?.includes('Invalid Credentials'))) {
                console.log(`${label} → ⚠ Token expired, refreshing...`);
                try {
                    token = await refreshToken(acc.id, acc.refresh_token);
                    res = await sendViaGmail(token, acc.email, TARGET_EMAIL, tpl.subject, tpl.body);
                } catch (refreshErr: any) {
                    res = { success: false, error: `Refresh failed: ${refreshErr.message}` };
                }
            }

            if (res.success) {
                console.log(`${label} → ✅ ${res.messageId}`);
                accountResult.sent++;
                totalSent++;
            } else {
                console.log(`${label} → ❌ ${res.error}`);
                accountResult.failed++;
                accountResult.errors.push(res.error || 'Unknown');
                totalFailed++;
            }

            if (j < templates.length - 1) await sleep(DELAY_BETWEEN_EMAILS_MS);
        }

        results.push(accountResult);

        // Delay between accounts (skip after last, skip in dry run)
        if (i < accounts.length - 1) {
            const remaining = accounts.length - i - 1;
            if (DRY_RUN) {
                console.log(`  ⏳ [DRY RUN] Skipping 60s delay (${remaining} accounts left)\n`);
            } else {
                const eta = Math.round((remaining * (DELAY_BETWEEN_ACCOUNTS_MS / 1000 + 9)) / 60);
                console.log(`  ⏳ Waiting 60s... (${remaining} accounts left, ~${eta}min ETA)\n`);
                await sleep(DELAY_BETWEEN_ACCOUNTS_MS);
            }
        }
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║                  WARM-UP COMPLETE                ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`\n  Total accounts: ${accounts.length}`);
    console.log(`  Emails sent:    ${totalSent} ✅`);
    console.log(`  Emails failed:  ${totalFailed} ❌`);

    const failed = results.filter(r => r.failed > 0);
    if (failed.length > 0) {
        console.log(`\n  ⚠ Accounts with failures:`);
        for (const f of failed) {
            console.log(`    ${f.email}: ${f.failed} failed — ${f.errors.join(', ')}`);
        }
    }

    console.log('\n  📋 Full log:');
    for (const r of results) {
        const status = r.failed === 0 ? '✅' : r.failed === 3 ? '❌' : '⚠️';
        console.log(`    ${status} ${r.email.padEnd(40)} ${r.sent}/3 sent`);
    }

    console.log('');
    process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
