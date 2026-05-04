#!/usr/bin/env node
/**
 * DNS Fixer Report
 *
 * Pulls all gmail_accounts (MANUAL only — OAuth/Workspace domains are
 * provider-managed). For each unique sender domain, runs SPF/DKIM/DMARC
 * checks. Picks the first 5 "untrusted" domains and prints copy-paste
 * DNS records the user can paste into Hostinger (or any DNS host).
 *
 * Usage:
 *   node scripts/dns-fixer-report.mjs            # report only
 *   node scripts/dns-fixer-report.mjs --all      # report all untrusted
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.
 */

import { createClient } from '@supabase/supabase-js';
import { resolveTxt, resolveCname } from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Read .env ────────────────────────────────────────────────────────
function loadEnv() {
    try {
        const text = readFileSync(join(process.cwd(), '.env'), 'utf-8');
        for (const line of text.split(/\r?\n/)) {
            const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
            if (m && !process.env[m[1]]) {
                let v = m[2];
                if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
                process.env[m[1]] = v;
            }
        }
    } catch { /* ignore */ }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}
const supa = createClient(url, key, { auth: { persistSession: false } });

// ─── DNS helpers (mirror src/actions/brandingActions.ts) ──────────────
const DKIM_SELECTORS = ['google', 'default', 'selector1', 'selector2', 's1', 's2', 'k1', 'mxvault', 'dkim', 'titan', 'dkim1', 'dkim2'];
const FREE_MAIL = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com',
    'live.com', 'msn.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com',
    'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com',
]);

async function safeTxt(name) {
    try {
        const recs = await resolveTxt(name);
        return recs.map(parts => parts.join(''));
    } catch (err) {
        if (err?.code === 'ENOTFOUND' || err?.code === 'ENODATA') return [];
        return null;
    }
}
async function safeCname(name) {
    try { return await resolveCname(name); } catch { return null; }
}

async function checkSpf(domain) {
    const recs = await safeTxt(domain);
    if (recs === null) return { status: 'unknown', record: null };
    const spf = recs.find(r => r.toLowerCase().startsWith('v=spf1'));
    return spf ? { status: 'pass', record: spf } : { status: 'fail', record: null };
}
async function checkDkim(domain) {
    for (const sel of DKIM_SELECTORS) {
        const recs = await safeTxt(`${sel}._domainkey.${domain}`);
        if (recs && recs.length) {
            const hit = recs.find(r => r.toLowerCase().includes('v=dkim1') || r.toLowerCase().includes('p='));
            if (hit) return { status: 'pass', selector: sel, record: hit };
        }
        const cname = await safeCname(`${sel}._domainkey.${domain}`);
        if (cname && cname.length) return { status: 'pass', selector: sel, record: `CNAME → ${cname[0]}` };
    }
    return { status: 'fail', selector: null, record: null };
}
async function checkDmarc(domain) {
    const recs = await safeTxt(`_dmarc.${domain}`);
    if (recs === null) return { status: 'unknown', record: null, policy: null };
    const dmarc = recs.find(r => r.toLowerCase().startsWith('v=dmarc1'));
    if (!dmarc) return { status: 'fail', record: null, policy: null };
    const m = /\bp=([a-z]+)/i.exec(dmarc);
    return { status: 'pass', record: dmarc, policy: m?.[1]?.toLowerCase() || null };
}

// ─── SMTP-host → ESP recipe table ─────────────────────────────────────
//
// Maps the smtp_host on a Manual account to the SPF mechanism + DKIM
// selector advice for the most common ESPs / hosts. Hostinger Titan,
// Google Workspace, Zoho, etc. each have specific records.
function recipeFor(smtpHost) {
    const h = (smtpHost || '').toLowerCase();
    if (h.includes('hostinger') || h.includes('titan')) {
        return {
            esp: 'Hostinger / Titan',
            spfInclude: 'include:_spf.titan.email',
            dkimNote: 'In Hostinger control panel → Email → Manage → DKIM. Click "Enable DKIM" to auto-publish a TXT record at `default._domainkey.<domain>`. The selector is `default`.',
            dkimSelector: 'default',
        };
    }
    if (h.includes('google') || h.includes('gmail.com')) {
        return {
            esp: 'Google Workspace',
            spfInclude: 'include:_spf.google.com',
            dkimNote: 'In Google Admin → Apps → Google Workspace → Gmail → Authenticate email. Generate a DKIM key (2048-bit), then add the displayed TXT record at `google._domainkey.<domain>`. Click "Start authentication" once DNS propagates.',
            dkimSelector: 'google',
        };
    }
    if (h.includes('zoho')) {
        return {
            esp: 'Zoho Mail',
            spfInclude: 'include:zohomail.com',
            dkimNote: 'In Zoho Admin → Mail → Domains → DKIM. Add a selector (e.g. `zoho`) and Zoho gives you the TXT to publish at `zoho._domainkey.<domain>`.',
            dkimSelector: 'zoho',
        };
    }
    if (h.includes('mailgun')) {
        return {
            esp: 'Mailgun',
            spfInclude: 'include:mailgun.org',
            dkimNote: 'Mailgun DKIM is auto-published at `pic._domainkey.<domain>` after you verify the sending domain in their dashboard.',
            dkimSelector: 'pic',
        };
    }
    if (h.includes('sendgrid')) {
        return {
            esp: 'SendGrid',
            spfInclude: 'include:sendgrid.net',
            dkimNote: 'SendGrid uses authenticated CNAMEs at `s1._domainkey.<domain>` and `s2._domainkey.<domain>` — add both as CNAME records pointing to the values shown in your Sender Authentication wizard.',
            dkimSelector: 's1 + s2 (CNAME)',
        };
    }
    if (h.includes('amazonaws') || h.includes('amazonses')) {
        return {
            esp: 'Amazon SES',
            spfInclude: 'include:amazonses.com',
            dkimNote: 'Easy DKIM auto-creates 3 CNAME records at `<token1>._domainkey.<domain>` (and 2 more). Get them from the SES "Verified identities" page after enabling DKIM.',
            dkimSelector: 'amazonses (CNAME)',
        };
    }
    // Generic fallback — most providers tell you the include in their docs.
    return {
        esp: smtpHost || 'Unknown SMTP host',
        spfInclude: '<paste your provider\'s SPF include from their docs>',
        dkimNote: 'Look up your provider\'s DKIM setup guide. Most ask you to publish a TXT or CNAME at `<selector>._domainkey.<domain>`.',
        dkimSelector: '<provider-specific>',
    };
}

// ─── Main ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const showAll = argv.includes('--all');

const { data: accounts, error } = await supa
    .from('gmail_accounts')
    .select('email, smtp_host, connection_method, status, display_name')
    .order('email', { ascending: true });

if (error) {
    console.error('DB error:', error.message);
    process.exit(1);
}

console.log(`\nLoaded ${accounts.length} accounts from gmail_accounts.\n`);

// Group by domain (use the first encountered smtp_host as canonical).
const byDomain = new Map();
for (const a of accounts) {
    const dom = (a.email.split('@')[1] || '').toLowerCase();
    if (!dom) continue;
    if (FREE_MAIL.has(dom)) continue;          // skip provider-managed
    // Include OAuth custom domains too — Google Workspace usually has DKIM
    // but DMARC and full SPF are often missing. Worth surfacing.
    if (!byDomain.has(dom)) {
        byDomain.set(dom, { domain: dom, smtp_host: a.smtp_host, accounts: [] });
    }
    byDomain.get(dom).accounts.push(a.email);
}

console.log(`Found ${byDomain.size} unique custom domains across MANUAL accounts. Checking DNS…\n`);

const results = [];
const domains = [...byDomain.keys()];
const BATCH = 6;
for (let i = 0; i < domains.length; i += BATCH) {
    const batch = domains.slice(i, i + BATCH);
    const checks = await Promise.all(batch.map(async d => {
        const [spf, dkim, dmarc] = await Promise.all([checkSpf(d), checkDkim(d), checkDmarc(d)]);
        return { d, spf, dkim, dmarc };
    }));
    for (const c of checks) {
        results.push({ ...byDomain.get(c.d), ...c });
    }
}

// Build "untrusted" list — anything where SPF, DKIM, OR DMARC failed.
const untrusted = results.filter(r =>
    r.spf.status !== 'pass' || r.dkim.status !== 'pass' || r.dmarc.status !== 'pass'
);
const trusted = results.length - untrusted.length;

console.log(`────────────────────────────────────────────────────────────`);
console.log(`SUMMARY`);
console.log(`────────────────────────────────────────────────────────────`);
console.log(`Domains checked   : ${results.length}`);
console.log(`Trusted (3/3 pass): ${trusted}`);
console.log(`Untrusted         : ${untrusted.length}`);
console.log('');

const targets = showAll ? untrusted : untrusted.slice(0, 5);
if (targets.length === 0) {
    console.log('🎉 No untrusted domains. Nothing to fix.');
    process.exit(0);
}

console.log(`────────────────────────────────────────────────────────────`);
console.log(`COPY-PASTE DNS RECORDS — first ${targets.length} untrusted ${showAll ? '(all)' : 'domain(s)'}`);
console.log(`────────────────────────────────────────────────────────────\n`);

for (const t of targets) {
    const r = recipeFor(t.smtp_host);
    console.log(`╔══════════════════════════════════════════════════════════`);
    console.log(`║ ${t.domain}`);
    console.log(`║ SMTP host : ${t.smtp_host || '(none)'}`);
    console.log(`║ ESP guess : ${r.esp}`);
    console.log(`║ Mailboxes : ${t.accounts.length} (${t.accounts.slice(0, 3).join(', ')}${t.accounts.length > 3 ? ', …' : ''})`);
    console.log(`╠══════════════════════════════════════════════════════════`);
    console.log(`║ Current state:`);
    console.log(`║   SPF   : ${t.spf.status}${t.spf.record ? `  → ${t.spf.record.slice(0, 70)}` : ''}`);
    console.log(`║   DKIM  : ${t.dkim.status}${t.dkim.selector ? `  (selector: ${t.dkim.selector})` : ''}`);
    console.log(`║   DMARC : ${t.dmarc.status}${t.dmarc.policy ? `  (policy: ${t.dmarc.policy})` : ''}`);
    console.log(`╚══════════════════════════════════════════════════════════`);

    if (t.spf.status !== 'pass') {
        console.log(`\n┃ ➤ FIX 1 — SPF`);
        console.log(`┃ Type   : TXT`);
        console.log(`┃ Name   : @  (root of ${t.domain})`);
        console.log(`┃ Value  : v=spf1 ${r.spfInclude} ~all`);
        console.log(`┃ TTL    : 3600`);
        console.log(`┃ Note   : If you already send from a second ESP, add its include too:`);
        console.log(`┃          v=spf1 ${r.spfInclude} include:other-esp.com ~all`);
        console.log(`┃          You can have ONLY ONE SPF TXT per domain — never two.`);
    }

    if (t.dkim.status !== 'pass') {
        console.log(`\n┃ ➤ FIX 2 — DKIM`);
        console.log(`┃ Selector : ${r.dkimSelector}`);
        console.log(`┃ Steps    : ${r.dkimNote}`);
        console.log(`┃ Verify   : Once published, this scan will turn DKIM green.`);
    }

    if (t.dmarc.status !== 'pass') {
        console.log(`\n┃ ➤ FIX 3 — DMARC`);
        console.log(`┃ Type   : TXT`);
        console.log(`┃ Name   : _dmarc  (so the full record is _dmarc.${t.domain})`);
        console.log(`┃ Value  : v=DMARC1; p=quarantine; rua=mailto:dmarc@${t.domain}; pct=100; aspf=r; adkim=r;`);
        console.log(`┃ TTL    : 3600`);
        console.log(`┃ Note   : Start with p=none for monitoring, switch to p=quarantine after a week`);
        console.log(`┃          of clean DMARC reports. p=quarantine is the minimum BIMI requires.`);
    }

    console.log('');
}

console.log(`────────────────────────────────────────────────────────────`);
console.log(`After publishing the records:`);
console.log(`  1. Wait 10–60 minutes for DNS propagation.`);
console.log(`  2. Open /accounts and click ↻ Re-check on each domain card.`);
console.log(`  3. Once all 3 pills are green, the BIMI-Selector header we`);
console.log(`     send will activate Yahoo/AOL avatars (free).`);
console.log(`  4. Gmail avatars still require a paid VMC/CMC cert — the`);
console.log(`     inline HTML signature we ship handles photo display in`);
console.log(`     Gmail without one.`);
console.log(`────────────────────────────────────────────────────────────\n`);
