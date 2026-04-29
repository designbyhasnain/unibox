// Single-Recipient Deliverability Test (Local only — do NOT run on Vercel)
//
// Sends ONE unique email from every ACTIVE Gmail / IMAP+SMTP account to a
// target mailbox (default: syedhamzaa@gmail.com) to test pure domain
// deliverability across the sending fleet.
//
// Critical design choices:
//   • 120-second delay between accounts (avoid botnet flagging).
//   • Every subject + body is generated fresh by Groq llama-3.1-8b-instant.
//   • NO tracking pixels, NO link rewriting, NO DB sync — raw send only.
//   • Writes no activity_log, no email_messages row, no contact touch.
//
// Usage:
//   node scripts/spam-check-single.mjs             (LIVE — sends for real)
//   node scripts/spam-check-single.mjs --dry       (DRY RUN — no sends, no Groq)
//   node scripts/spam-check-single.mjs --to=x@y.z  (override target)
//
// Runtime estimate: ~N accounts × (120s delay + ~2s send) — for 62 active
// accounts that's ~125 minutes. Keep your laptop awake.

import 'dotenv/config';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// ── Config ──────────────────────────────────────────────────────────────────
const argTo = process.argv.find(a => a.startsWith('--to='));
const TARGET_EMAIL = argTo ? argTo.slice(5) : 'syedhamzaa@gmail.com';
const DELAY_BETWEEN_ACCOUNTS_MS = 120_000; // 2 min
const DRY_RUN = process.argv.includes('--dry');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.1-8b-instant';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const prisma = new PrismaClient();

// ── Encryption (mirrors src/utils/encryption.ts — AES-256-GCM) ──────────────
const ENC_KEY = process.env.ENCRYPTION_KEY;
if (!ENC_KEY && !DRY_RUN) {
    console.error('ENCRYPTION_KEY missing from env. Cannot decrypt credentials.');
    process.exit(1);
}
if (!GROQ_API_KEY && !DRY_RUN) {
    console.error('GROQ_API_KEY missing from env. This script requires Groq for AI content.');
    process.exit(1);
}

function decrypt(encrypted) {
    const [ivHex, authTagHex, cipherHex] = encrypted.split(':');
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

// ── AI Content Generation (Groq llama-3.1-8b-instant) ───────────────────────
// Seed topics to coax variety out of the model even across 60+ calls.
const TOPIC_POOL = [
    'checking in to see how things are going on your end',
    'a quick thought after our last exchange',
    'sharing a small update about my schedule this week',
    'asking a simple question about next steps',
    'following up loosely, no pressure',
    'mentioning a resource I thought might help',
    'confirming a detail before I forget',
    'sending a brief hello between meetings',
    'wondering if you had a chance to look at the notes',
    'flagging something minor that came up today',
    'just wanted to drop a quick line',
    'a short reflection after the week so far',
    'clarifying one small point from earlier',
    'sharing availability for a call if useful',
    'a casual follow-up on an open item',
];

const SYSTEM_PROMPT = `You are a human writing a short, casual, one-off email to a friend or loose acquaintance. The email must feel like a real person typed it — natural rhythm, mild imperfection, contractions, no marketing language, no generic opener like "I hope this email finds you well", no signature block.

Output STRICT JSON with exactly two keys:
{"subject":"...","body":"..."}

Rules:
- subject: 4-8 words, lowercase or sentence case, no emojis, no all-caps.
- body: 2-3 short paragraphs in plain text (NOT HTML). 50-120 words total. End with a brief sign-off like "thanks" or "cheers" or "catch up soon" on its own line. Do NOT include a name.
- Absolutely NO marketing phrases, NO "reaching out", NO "I hope this finds you well", NO call-to-action buttons.
- Every generation must be unique in subject and body — vary tone, phrasing, sentence structure.`;

async function generateEmailContent(accountIndex, senderEmail) {
    const topic = TOPIC_POOL[Math.floor(Math.random() * TOPIC_POOL.length)];
    const nonce = crypto.randomBytes(3).toString('hex');
    const userPrompt = `Write email #${accountIndex} from a person whose address is ${senderEmail}. The loose topic this time is: "${topic}". Variation key (ignore semantically, only use to ensure uniqueness): ${nonce}.`;

    if (DRY_RUN) {
        return {
            subject: `[DRY] test about ${topic.slice(0, 20)}`,
            body: `DRY RUN body for account ${accountIndex} sender ${senderEmail} topic "${topic}" nonce ${nonce}`,
        };
    }

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(GROQ_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: GROQ_MODEL,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: userPrompt },
                    ],
                    max_tokens: 400,
                    temperature: 0.95,
                    response_format: { type: 'json_object' },
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
            }
            const data = await res.json();
            const raw = (data?.choices?.[0]?.message?.content || '').trim();
            const parsed = JSON.parse(raw);
            if (!parsed.subject || !parsed.body) throw new Error('missing subject/body in Groq output');
            return { subject: String(parsed.subject).trim(), body: String(parsed.body).trim() };
        } catch (err) {
            if (attempt === 1) throw err;
            console.log(`   Groq retry (${err?.message || err})`);
            await sleep(2000);
        }
    }
    throw new Error('unreachable');
}

// Plain-text to minimal HTML (preserve paragraphs, no tracking artifacts).
function plainToHtml(text) {
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const paragraphs = escaped.split(/\n\s*\n/).map(p => p.replace(/\n/g, '<br>'));
    return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.5">${
        paragraphs.map(p => `<p>${p}</p>`).join('')
    }</div>`;
}

// ── OAuth Gmail Send (no tracking, no DB sync) ──────────────────────────────
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

// ── SMTP Manual Send (no tracking, no DB sync) ──────────────────────────────
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
    console.log('  Single-Recipient Deliverability Test');
    console.log(`  Target : ${TARGET_EMAIL}`);
    console.log(`  Mode   : ${DRY_RUN ? 'DRY RUN (no sends, no Groq)' : 'LIVE — sending real emails'}`);
    console.log(`  Delay  : ${DELAY_BETWEEN_ACCOUNTS_MS / 1000}s between accounts`);
    console.log(`  Tracking: DISABLED (raw send, no DB sync)`);
    console.log('==================================================\n');

    const accounts = await prisma.gmailAccount.findMany({
        where: { status: { in: ['ACTIVE', 'SYNCING'] } },
        select: {
            id: true,
            email: true,
            status: true,
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
        console.error('No ACTIVE or SYNCING accounts found. Nothing to do.');
        await prisma.$disconnect();
        process.exit(0);
    }

    const oauthCount = accounts.filter(a => a.connectionMethod === 'OAUTH').length;
    const manualCount = accounts.filter(a => a.connectionMethod === 'MANUAL').length;
    const activeCount = accounts.filter(a => a.status === 'ACTIVE').length;
    const syncingCount = accounts.filter(a => a.status === 'SYNCING').length;
    const estimatedMs = (accounts.length - 1) * DELAY_BETWEEN_ACCOUNTS_MS + accounts.length * 3000;
    console.log(`Found ${accounts.length} accounts — ${activeCount} ACTIVE + ${syncingCount} SYNCING (${oauthCount} OAuth, ${manualCount} Manual/SMTP).`);
    console.log(`Estimated runtime: ~${formatDuration(estimatedMs)}.\n`);

    const results = [];
    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        const num = `[Account ${String(i + 1).padStart(2)}/${accounts.length}]`;
        const remaining = accounts.length - (i + 1);

        console.log(`${num} ${progressBar(i, accounts.length)} ${acc.email} (${acc.connectionMethod}) — ${remaining} left after this`);

        let subject, bodyText;
        try {
            const gen = await generateEmailContent(i + 1, acc.email);
            subject = gen.subject;
            bodyText = gen.body;
            console.log(`   AI subject: "${subject}"`);
        } catch (err) {
            console.log(`   AI generation FAILED: ${err?.message || err} — skipping this account`);
            results.push({ email: acc.email, method: acc.connectionMethod, sent: 0, failed: 1, error: `Groq: ${err?.message || err}` });
            totalFailed++;
            if (i < accounts.length - 1) {
                console.log(`   Waiting ${DELAY_BETWEEN_ACCOUNTS_MS / 1000}s before next account...\n`);
                await sleep(DELAY_BETWEEN_ACCOUNTS_MS);
            }
            continue;
        }

        const bodyHtml = plainToHtml(bodyText);

        if (DRY_RUN) {
            console.log(`   -> [DRY RUN] would send to ${TARGET_EMAIL}`);
            results.push({ email: acc.email, method: acc.connectionMethod, sent: 1, failed: 0 });
            totalSent++;
            if (i < accounts.length - 1) {
                console.log(`   Waiting ${DELAY_BETWEEN_ACCOUNTS_MS / 1000}s before next account...\n`);
                await sleep(DELAY_BETWEEN_ACCOUNTS_MS);
            }
            continue;
        }

        let res;
        let token = acc.accessToken;
        try {
            if (acc.connectionMethod === 'OAUTH') {
                if (!token && acc.refreshToken) {
                    token = await refreshAccessToken(acc.id, acc.refreshToken);
                }
                if (!token) {
                    res = { success: false, error: 'no access_token and no refresh_token' };
                } else {
                    res = await sendViaGmailOAuth(token, acc.email, TARGET_EMAIL, subject, bodyHtml);
                    const authFailed = !res.success && /401|invalid_grant|invalid credentials|unauthorized/i.test(res.error || '');
                    if (authFailed && acc.refreshToken) {
                        token = await refreshAccessToken(acc.id, acc.refreshToken);
                        res = await sendViaGmailOAuth(token, acc.email, TARGET_EMAIL, subject, bodyHtml);
                    }
                }
            } else {
                if (!acc.appPassword) {
                    res = { success: false, error: 'no app_password on manual account' };
                } else {
                    res = await sendViaSMTP(acc, TARGET_EMAIL, subject, bodyHtml);
                }
            }
        } catch (e) {
            res = { success: false, error: e?.message || String(e) };
        }

        if (res.success) {
            console.log(`   -> OK (msg ${res.messageId})`);
            results.push({ email: acc.email, method: acc.connectionMethod, sent: 1, failed: 0 });
            totalSent++;
        } else {
            console.log(`   -> FAIL (${res.error})`);
            results.push({ email: acc.email, method: acc.connectionMethod, sent: 0, failed: 1, error: res.error });
            totalFailed++;
        }

        if (i < accounts.length - 1) {
            const eta = Math.round((accounts.length - i - 1) * DELAY_BETWEEN_ACCOUNTS_MS / 1000 / 60);
            console.log(`   Waiting ${DELAY_BETWEEN_ACCOUNTS_MS / 1000}s before next account (~${eta}m left)...\n`);
            await sleep(DELAY_BETWEEN_ACCOUNTS_MS);
        }
    }

    const elapsed = Date.now() - startedAt;
    console.log(`\n[Account ${accounts.length}/${accounts.length}] ${progressBar(accounts.length, accounts.length)} done.\n`);

    console.log('==================================================');
    console.log('                   SUMMARY');
    console.log('==================================================');
    console.log(`Target             : ${TARGET_EMAIL}`);
    console.log(`Accounts processed : ${accounts.length}`);
    console.log(`Emails sent OK     : ${totalSent}`);
    console.log(`Emails failed      : ${totalFailed}`);
    console.log(`Elapsed            : ${formatDuration(elapsed)}`);

    const failed = results.filter(r => r.failed > 0);
    if (failed.length > 0) {
        console.log('\nAccounts with failures:');
        for (const r of failed) {
            console.log(`  - ${r.email} (${r.method}): ${r.error}`);
        }
    }

    console.log('\nNow check the target inbox for placement: Inbox / Promotions / Spam / Missing.');

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('\nFatal error:', err);
    await prisma.$disconnect();
    process.exit(1);
});
