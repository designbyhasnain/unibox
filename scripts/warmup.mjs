// Gmail Account Warm-Up (Local only — do NOT run on Vercel)
//
// Uses Prisma to fetch ACTIVE Gmail accounts (both OAuth and Manual/SMTP),
// then sends 3 unique professional emails from each account to
// designsbyhasnain@gmail.com with a strict 60-second pause between accounts.
// Random reference IDs in the footer guarantee every email body is unique.
//
// Usage:  node scripts/warmup.mjs            (LIVE)
//         node scripts/warmup.mjs --dry      (DRY RUN — no emails sent)
//
// Total run time: ~77 accounts * 60s + send time ≈ 80 minutes.

import 'dotenv/config';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';

// Load .env.local too (some projects split env files)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// ── Config ──────────────────────────────────────────────────────────────────
const TARGET_EMAIL = 'designsbyhasnain@gmail.com';
const DELAY_BETWEEN_ACCOUNTS_MS = 60_000; // strict 60s between accounts
const DELAY_BETWEEN_EMAILS_MS = 3_000;    // 3s between emails within one account
const DRY_RUN = process.argv.includes('--dry');

const prisma = new PrismaClient();

// ── Encryption (mirrors src/utils/encryption.ts — AES-256-GCM) ──────────────
const ENC_KEY = process.env.ENCRYPTION_KEY;
if (!ENC_KEY && !DRY_RUN) {
    console.error('ENCRYPTION_KEY missing from env. Cannot decrypt credentials.');
    process.exit(1);
}

function decrypt(encrypted) {
    const parts = encrypted.split(':');
    const [ivHex, authTagHex, cipherHex] = parts;
    if (!ivHex || !authTagHex || !cipherHex) throw new Error('Invalid encrypted format');
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(ENC_KEY, 'hex'),
        Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let out = decipher.update(cipherHex, 'hex', 'utf8');
    out += decipher.final('utf8');
    return out;
}

// ── Email Templates ─────────────────────────────────────────────────────────
// Each returns body with a unique reference ID so no two sends are identical.
function randomRef() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function buildTemplates(fromEmail, accountIndex) {
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const prefix = `WU-${String(accountIndex).padStart(3, '0')}`;

    const footer = (slot) => `
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="font-size:11px;color:#999">
            Sent from ${fromEmail} · ${ts} · Ref: ${prefix}-${slot}-${randomRef()}
        </p>`;

    return [
        {
            subject: `Project Status Update — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            body: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333">
                <p>Hi team,</p>
                <p>Quick update on current project status. All deliverables are tracking on schedule. Please review the latest assets when you get a chance and let me know if anything needs adjustment.</p>
                <p>Looking forward to syncing up this week.</p>
                <p>Best regards</p>
                ${footer('A')}
            </div>`,
        },
        {
            subject: 'Weekly Team Sync — Notes & Action Items',
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
                ${footer('B')}
            </div>`,
        },
        {
            subject: 'Quick Follow-Up — Pending Items',
            body: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333">
                <p>Hi there,</p>
                <p>Just a quick follow-up on the items we discussed recently. Wanted to make sure nothing falls through the cracks. If you have any updates or need anything from my end, please don't hesitate to reach out.</p>
                <p>Have a great rest of the week!</p>
                <p>Cheers</p>
                ${footer('C')}
            </div>`,
        },
    ];
}

// ── OAuth Gmail Send ────────────────────────────────────────────────────────
async function sendViaGmailOAuth(accessToken, fromEmail, to, subject, body) {
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
        );
        oauth2Client.setCredentials({ access_token: accessToken });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const raw = Buffer.from([
            `From: ${fromEmail}`,
            `To: ${to}`,
            `Subject: ${utf8Subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=utf-8',
            '',
            body,
        ].join('\r\n'))
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw },
        });
        return { success: true, messageId: res.data.id || undefined };
    } catch (err) {
        return { success: false, error: err?.message || String(err) };
    }
}

// ── OAuth Token Refresh ─────────────────────────────────────────────────────
async function refreshAccessToken(accountId, encryptedRefreshToken) {
    const refreshToken = decrypt(encryptedRefreshToken);
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    const newAccessToken = credentials.access_token;
    if (!newAccessToken) throw new Error('No access_token returned from refresh');

    await prisma.gmailAccount.update({
        where: { id: accountId },
        data: { accessToken: newAccessToken },
    });
    return newAccessToken;
}

// ── SMTP Manual Send (nodemailer) ───────────────────────────────────────────
async function sendViaSMTP(account, to, subject, body) {
    try {
        const smtpHost = account.smtpHost || 'smtp.gmail.com';
        const smtpPort = account.smtpPort || 465;
        const password = decrypt(account.appPassword);

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: Number(smtpPort) === 465,
            auth: { user: account.email, pass: password },
        });

        const info = await transporter.sendMail({
            from: account.email,
            to,
            subject,
            html: body,
        });
        return { success: true, messageId: info.messageId };
    } catch (err) {
        return { success: false, error: err?.message || String(err) };
    }
}

// ── Utilities ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function progressBar(current, total, width = 30) {
    const pct = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${pct}%`;
}

function formatDuration(ms) {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    const startedAt = Date.now();

    console.log('\n==================================================');
    console.log('       Gmail Account Warm-Up Agent');
    console.log(`       Target: ${TARGET_EMAIL}`);
    console.log(`       Mode:   ${DRY_RUN ? 'DRY RUN (no emails sent)' : 'LIVE — sending emails'}`);
    console.log('==================================================\n');

    // Include both ACTIVE and SYNCING (transient state) so we catch healthy
    // manual accounts currently in a sync pass.
    const accounts = await prisma.gmailAccount.findMany({
        where: {
            status: { in: ['ACTIVE', 'SYNCING'] },
        },
        select: {
            id: true,
            email: true,
            accessToken: true,
            refreshToken: true,
            appPassword: true,
            connectionMethod: true,
            smtpHost: true,
            smtpPort: true,
        },
        orderBy: { email: 'asc' },
    });

    if (accounts.length === 0) {
        console.error('No active accounts found. Nothing to do.');
        await prisma.$disconnect();
        process.exit(0);
    }

    const oauthCount = accounts.filter(a => a.connectionMethod === 'OAUTH').length;
    const manualCount = accounts.filter(a => a.connectionMethod === 'MANUAL').length;
    const estimatedMs = accounts.length * (DELAY_BETWEEN_ACCOUNTS_MS + 3 * DELAY_BETWEEN_EMAILS_MS);
    console.log(`Found ${accounts.length} accounts (${oauthCount} OAuth, ${manualCount} Manual/SMTP).`);
    console.log(`Estimated runtime: ~${formatDuration(estimatedMs)}.\n`);

    const results = [];
    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        const num = `[Account ${String(i + 1).padStart(2)}/${accounts.length}]`;
        const templates = buildTemplates(acc.email, i + 1);

        console.log(`${num} ${progressBar(i, accounts.length)} Sending from ${acc.email} (${acc.connectionMethod})`);

        const accountResult = { email: acc.email, method: acc.connectionMethod, sent: 0, failed: 0, errors: [] };
        let token = acc.accessToken;

        for (let j = 0; j < templates.length; j++) {
            const tpl = templates[j];
            const label = `   Email ${j + 1}/3: "${tpl.subject.slice(0, 48)}"`;

            if (DRY_RUN) {
                console.log(`${label} -> [DRY RUN] skipped`);
                accountResult.sent++;
                totalSent++;
                if (j < templates.length - 1) await sleep(DELAY_BETWEEN_EMAILS_MS);
                continue;
            }

            let res;
            try {
                if (acc.connectionMethod === 'OAUTH') {
                    if (!token && acc.refreshToken) {
                        token = await refreshAccessToken(acc.id, acc.refreshToken);
                    }
                    if (!token) {
                        res = { success: false, error: 'no access_token and no refresh_token' };
                    } else {
                        res = await sendViaGmailOAuth(token, acc.email, TARGET_EMAIL, tpl.subject, tpl.body);
                        const authFailed = !res.success && /401|invalid_grant|invalid credentials|unauthorized/i.test(res.error || '');
                        if (authFailed && acc.refreshToken) {
                            token = await refreshAccessToken(acc.id, acc.refreshToken);
                            res = await sendViaGmailOAuth(token, acc.email, TARGET_EMAIL, tpl.subject, tpl.body);
                        }
                    }
                } else {
                    if (!acc.appPassword) {
                        res = { success: false, error: 'no app_password on manual account' };
                    } else {
                        res = await sendViaSMTP(acc, TARGET_EMAIL, tpl.subject, tpl.body);
                    }
                }
            } catch (e) {
                res = { success: false, error: e?.message || String(e) };
            }

            if (res.success) {
                console.log(`${label} -> OK (msg ${res.messageId})`);
                accountResult.sent++;
                totalSent++;
            } else {
                console.log(`${label} -> FAIL (${res.error})`);
                accountResult.failed++;
                accountResult.errors.push(res.error || 'unknown');
                totalFailed++;
            }

            if (j < templates.length - 1) await sleep(DELAY_BETWEEN_EMAILS_MS);
        }

        results.push(accountResult);

        // 60s safe delay between accounts (skip after the last one)
        if (i < accounts.length - 1) {
            console.log(`   Waiting ${DELAY_BETWEEN_ACCOUNTS_MS / 1000}s before next account...\n`);
            await sleep(DELAY_BETWEEN_ACCOUNTS_MS);
        }
    }

    const elapsed = Date.now() - startedAt;
    console.log(`\n[Account ${accounts.length}/${accounts.length}] ${progressBar(accounts.length, accounts.length)} done.\n`);

    console.log('==================================================');
    console.log('                   SUMMARY');
    console.log('==================================================');
    console.log(`Accounts processed : ${accounts.length}`);
    console.log(`Emails sent        : ${totalSent}`);
    console.log(`Emails failed      : ${totalFailed}`);
    console.log(`Elapsed            : ${formatDuration(elapsed)}`);

    const failed = results.filter(r => r.failed > 0);
    if (failed.length > 0) {
        console.log('\nAccounts with failures:');
        for (const r of failed) {
            console.log(`  - ${r.email} (${r.method}, ${r.failed} failed): ${r.errors.slice(0, 2).join(' | ')}`);
        }
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('\nFatal error:', err);
    await prisma.$disconnect();
    process.exit(1);
});
