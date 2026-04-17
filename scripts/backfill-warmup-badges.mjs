// Backfill warm-up failure badges on gmail_accounts.
//
// The previous warm-up run sent 198 / failed 11 but predates the code that
// writes outcomes to the DB. This script re-probes every account WITHOUT
// actually sending an email:
//   - OAUTH: refresh the access token via Google's OAuth endpoint, then hit
//     the cheap users.getProfile endpoint. Most warm-up failures surface here.
//   - MANUAL: IMAP connect + SMTP verify with the stored app password.
//
// Failures are written as last_error_message = "Warm-up: <reason>" so the
// /accounts page shows the yellow banner and CTA we shipped. Successes clear
// any stale warm-up error.
//
// Runs 5 at a time, all local, no emails sent. ~1 minute for 77 accounts.

import 'dotenv/config';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const APPLY = !process.argv.includes('--dry');
const BATCH = 5;
const prisma = new PrismaClient();
const ENC_KEY = process.env.ENCRYPTION_KEY;

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

async function probeOAuth(acc) {
    if (!acc.refreshToken) return { ok: false, reason: 'no refresh_token — reconnect required' };
    let refreshToken;
    try { refreshToken = decrypt(acc.refreshToken); }
    catch { return { ok: false, reason: 'refresh token decrypt failed' }; }

    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
        );
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const { credentials } = await oauth2Client.refreshAccessToken();
        if (!credentials.access_token) return { ok: false, reason: 'no access_token returned from refresh' };

        // Cheap liveness check
        const res = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress',
            { headers: { Authorization: `Bearer ${credentials.access_token}` } }
        );
        if (!res.ok) {
            const body = await res.text();
            return { ok: false, reason: `Gmail API ${res.status}: ${body.slice(0, 80)}` };
        }
        return { ok: true };
    } catch (e) {
        const msg = e?.message || String(e);
        return { ok: false, reason: msg.slice(0, 120) };
    }
}

async function probeManual(acc) {
    if (!acc.appPassword) return { ok: false, reason: 'no app_password stored' };
    let password;
    try { password = decrypt(acc.appPassword); }
    catch { return { ok: false, reason: 'app_password decrypt failed' }; }

    const imapHost = acc.imapHost || 'imap.gmail.com';
    const imapPort = acc.imapPort || 993;
    const smtpHost = acc.smtpHost || 'smtp.gmail.com';
    const smtpPort = acc.smtpPort || 465;

    // IMAP test
    const imap = new ImapFlow({
        host: imapHost, port: imapPort, secure: Number(imapPort) === 993,
        auth: { user: acc.email, pass: password }, logger: false,
    });
    try {
        await imap.connect();
        await imap.logout();
    } catch (e) {
        return { ok: false, reason: `IMAP: ${(e?.message || String(e)).slice(0, 100)}` };
    }

    // SMTP test
    const transporter = nodemailer.createTransport({
        host: smtpHost, port: smtpPort, secure: Number(smtpPort) === 465,
        auth: { user: acc.email, pass: password },
    });
    try {
        await transporter.verify();
    } catch (e) {
        return { ok: false, reason: `SMTP: ${(e?.message || String(e)).slice(0, 100)}` };
    }
    return { ok: true };
}

async function main() {
    console.log(`\n${APPLY ? '[APPLY]' : '[DRY RUN]'} Warm-up badge backfill\n`);

    const accounts = await prisma.gmailAccount.findMany({
        select: {
            id: true, email: true, connectionMethod: true, status: true,
            accessToken: true, refreshToken: true, appPassword: true,
            smtpHost: true, smtpPort: true, imapHost: true, imapPort: true,
            last_error_message: true,
        },
        orderBy: { email: 'asc' },
    });

    console.log(`Probing ${accounts.length} accounts in batches of ${BATCH}…\n`);

    let failed = 0;
    let cleared = 0;
    const failures = [];

    async function handleOne(acc) {
        const result = acc.connectionMethod === 'OAUTH' ? await probeOAuth(acc) : await probeManual(acc);
        if (result.ok) {
            // Clear any prior warm-up error; leave other errors (e.g. token revoked) alone.
            if (acc.last_error_message?.startsWith('Warm-up:')) {
                if (APPLY) {
                    await prisma.gmailAccount.update({
                        where: { id: acc.id },
                        data: { last_error_message: null, last_error_at: null },
                    });
                }
                cleared++;
                console.log(`  ok   ${acc.email}  (cleared stale Warm-up error)`);
            } else {
                console.log(`  ok   ${acc.email}`);
            }
        } else {
            failed++;
            failures.push({ email: acc.email, method: acc.connectionMethod, reason: result.reason });
            if (APPLY) {
                await prisma.gmailAccount.update({
                    where: { id: acc.id },
                    data: {
                        last_error_message: `Warm-up: ${result.reason}`,
                        last_error_at: new Date(),
                    },
                });
            }
            console.log(`  FAIL ${acc.email}  (${acc.connectionMethod})  ${result.reason}`);
        }
    }

    for (let i = 0; i < accounts.length; i += BATCH) {
        const batch = accounts.slice(i, i + BATCH);
        await Promise.all(batch.map(handleOne));
    }

    console.log('\n--- Summary ---');
    console.log(`Probed  : ${accounts.length}`);
    console.log(`Failed  : ${failed}`);
    console.log(`Cleared : ${cleared} (success runs that removed stale warm-up errors)`);
    if (failures.length > 0) {
        console.log('\nFailed accounts:');
        for (const f of failures) console.log(`  - ${f.email.padEnd(40)} ${f.method.padEnd(6)} ${f.reason}`);
    }
    if (!APPLY) console.log('\nDRY RUN — no DB writes. Re-run without --dry to persist.');

    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error('Fatal:', e);
    await prisma.$disconnect();
    process.exit(1);
});
