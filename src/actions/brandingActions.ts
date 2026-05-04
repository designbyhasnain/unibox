'use server';

import { resolveTxt, resolveCname } from 'node:dns/promises';
import * as crypto from 'node:crypto';
import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { requireAdmin } from '../utils/accessControl';

// ─── Types ────────────────────────────────────────────────────────────────

export type DnsCheckStatus = 'pass' | 'fail' | 'unknown';

export interface DnsHealthResult {
    domain: string;
    spf: { status: DnsCheckStatus; record?: string | null; note?: string };
    dkim: { status: DnsCheckStatus; selector?: string | null; record?: string | null; note?: string };
    dmarc: { status: DnsCheckStatus; record?: string | null; policy?: string | null; note?: string };
    /** Aggregate — pass when all 3 pass; fail when any fail; unknown otherwise. */
    overall: DnsCheckStatus;
    checkedAt: string;
}

export interface BrandingRow {
    id: string;
    email: string;
    domain: string;
    isFreeMail: boolean;            // gmail.com / outlook.com / yahoo.com etc.
    connection_method: 'OAUTH' | 'MANUAL';
    status: string;
    display_name: string | null;
    profile_image: string | null;
    /** sha256(lowercase(email)) → drives Gravatar URL https://gravatar.com/avatar/{hash} */
    gravatar_hash: string;
    /** "Use my current email address instead" magic URL for Google sign-up. */
    googleSignupUrl: string;
}

// ─── Common selectors / sentinels ─────────────────────────────────────────

const COMMON_DKIM_SELECTORS = [
    'google',          // Google Workspace default
    'default',
    'selector1',       // Microsoft 365
    'selector2',
    's1',
    's2',
    'k1',              // Mailchimp
    'mxvault',
    'dkim',
];

const FREE_MAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com',
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'yahoo.com', 'yahoo.co.uk', 'ymail.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'proton.me', 'protonmail.com',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────

function gravatarHash(email: string): string {
    return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

function googleSignupMagicUrl(email: string): string {
    // Forces "Use my current email address instead" flow.
    return `https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp&email=${encodeURIComponent(email)}`;
}

function joinTxt(records: string[][]): string[] {
    // node:dns returns each TXT as an array of string chunks (per RFC 7208 §3.3).
    // Re-join chunks but keep records separate.
    return records.map(parts => parts.join(''));
}

async function safeResolveTxt(name: string): Promise<string[] | null> {
    try {
        const recs = await resolveTxt(name);
        return joinTxt(recs);
    } catch (err: any) {
        // ENOTFOUND / ENODATA = no record (treat as "fail" or "unknown" depending on check).
        // SERVFAIL / TIMEOUT = unknown.
        if (err?.code === 'ENOTFOUND' || err?.code === 'ENODATA') return [];
        return null; // unknown — DNS server failure
    }
}

async function checkSpf(domain: string): Promise<DnsHealthResult['spf']> {
    const records = await safeResolveTxt(domain);
    if (records === null) return { status: 'unknown', note: 'DNS lookup failed' };
    const spf = records.find(r => r.toLowerCase().startsWith('v=spf1'));
    if (!spf) return { status: 'fail', note: 'No SPF record' };
    return { status: 'pass', record: spf };
}

async function checkDkim(domain: string): Promise<DnsHealthResult['dkim']> {
    // Try common selectors. If any returns a v=DKIM1 record, we pass.
    for (const selector of COMMON_DKIM_SELECTORS) {
        const recs = await safeResolveTxt(`${selector}._domainkey.${domain}`);
        if (recs === null) continue;
        const hit = recs.find(r => r.toLowerCase().includes('v=dkim1') || r.toLowerCase().includes('p='));
        if (hit) return { status: 'pass', selector, record: hit };
    }
    // Also check if there's a CNAME pointing to a provider's DKIM (some hosts use CNAME).
    for (const selector of COMMON_DKIM_SELECTORS) {
        try {
            const c = await resolveCname(`${selector}._domainkey.${domain}`);
            if (c && c.length) return { status: 'pass', selector, record: `CNAME → ${c[0]}` };
        } catch { /* keep going */ }
    }
    return { status: 'fail', note: 'No DKIM TXT/CNAME found at common selectors' };
}

async function checkDmarc(domain: string): Promise<DnsHealthResult['dmarc']> {
    const records = await safeResolveTxt(`_dmarc.${domain}`);
    if (records === null) return { status: 'unknown', note: 'DNS lookup failed' };
    const dmarc = records.find(r => r.toLowerCase().startsWith('v=dmarc1'));
    if (!dmarc) return { status: 'fail', note: 'No DMARC record' };
    const policyMatch = /\bp=([a-z]+)/i.exec(dmarc);
    return { status: 'pass', record: dmarc, policy: policyMatch?.[1]?.toLowerCase() ?? null };
}

function aggregate(spf: DnsCheckStatus, dkim: DnsCheckStatus, dmarc: DnsCheckStatus): DnsCheckStatus {
    if (spf === 'pass' && dkim === 'pass' && dmarc === 'pass') return 'pass';
    if (spf === 'fail' || dkim === 'fail' || dmarc === 'fail') return 'fail';
    return 'unknown';
}

// ─── Public actions ──────────────────────────────────────────────────────

/**
 * Check SPF, DKIM, and DMARC for a single domain. Public DNS only — no
 * side effects. Anyone with admin access can call.
 */
export async function checkDomainDNSAction(domain: string): Promise<{
    success: boolean;
    result?: DnsHealthResult;
    error?: string;
}> {
    const { role } = await ensureAuthenticated();
    requireAdmin(role);

    const cleaned = (domain || '').trim().toLowerCase();
    if (!cleaned || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleaned)) {
        return { success: false, error: 'Invalid domain' };
    }

    if (FREE_MAIL_DOMAINS.has(cleaned)) {
        // We can still check — gmail.com/outlook.com etc. always pass — but
        // surfacing this is useful so the UI can render a separate "Provider-managed" badge.
        // We still run the checks for correctness.
    }

    try {
        const [spf, dkim, dmarc] = await Promise.all([
            checkSpf(cleaned),
            checkDkim(cleaned),
            checkDmarc(cleaned),
        ]);
        const result: DnsHealthResult = {
            domain: cleaned,
            spf,
            dkim,
            dmarc,
            overall: aggregate(spf.status, dkim.status, dmarc.status),
            checkedAt: new Date().toISOString(),
        };
        return { success: true, result };
    } catch (err: any) {
        return { success: false, error: err?.message || 'DNS check failed' };
    }
}

/**
 * Bulk DNS check across many domains. De-duplicates by domain (we have 77
 * accounts but maybe 30 unique domains), runs checks in parallel batches of 8.
 */
export async function checkAllDomainsAction(domains: string[]): Promise<{
    success: boolean;
    results?: Record<string, DnsHealthResult>;
    error?: string;
}> {
    const { role } = await ensureAuthenticated();
    requireAdmin(role);

    const unique = Array.from(new Set(domains.map(d => (d || '').trim().toLowerCase()).filter(Boolean)));
    const out: Record<string, DnsHealthResult> = {};
    const BATCH = 8;
    try {
        for (let i = 0; i < unique.length; i += BATCH) {
            const batch = unique.slice(i, i + BATCH);
            const results = await Promise.all(batch.map(async d => {
                const [spf, dkim, dmarc] = await Promise.all([checkSpf(d), checkDkim(d), checkDmarc(d)]);
                return { domain: d, spf, dkim, dmarc };
            }));
            for (const r of results) {
                out[r.domain] = {
                    domain: r.domain,
                    spf: r.spf,
                    dkim: r.dkim,
                    dmarc: r.dmarc,
                    overall: aggregate(r.spf.status, r.dkim.status, r.dmarc.status),
                    checkedAt: new Date().toISOString(),
                };
            }
        }
        return { success: true, results: out };
    } catch (err: any) {
        return { success: false, error: err?.message || 'Bulk DNS check failed' };
    }
}

/**
 * Returns the table backing /branding — every email account with the data
 * needed to render Gravatar status, Google Signup magic URL, and persona
 * info. DNS health is NOT included here; the client kicks that off as a
 * separate batch so the page paints fast.
 */
export async function getBrandingDashboardAction(): Promise<{
    success: boolean;
    rows?: BrandingRow[];
    error?: string;
}> {
    const { role } = await ensureAuthenticated();
    requireAdmin(role);

    const { data, error } = await supabase
        .from('gmail_accounts')
        .select('id, email, connection_method, status, display_name, profile_image')
        .order('email', { ascending: true });

    if (error) return { success: false, error: error.message };

    const rows: BrandingRow[] = (data || []).map(a => {
        const email = (a.email || '').toLowerCase();
        const domain = email.split('@')[1] || '';
        const isFreeMail = FREE_MAIL_DOMAINS.has(domain);
        return {
            id: a.id,
            email,
            domain,
            isFreeMail,
            connection_method: a.connection_method as 'OAUTH' | 'MANUAL',
            status: a.status,
            display_name: a.display_name,
            profile_image: a.profile_image,
            gravatar_hash: gravatarHash(email),
            googleSignupUrl: googleSignupMagicUrl(email),
        };
    });

    return { success: true, rows };
}

/**
 * Probe Gravatar for a list of email hashes. Gravatar returns 404 for
 * unknown hashes when called with `?d=404`. We do this server-side to
 * avoid CORS + rate-limit issues from the browser.
 *
 * Returns { hash → exists } map.
 */
export async function checkGravatarsAction(hashes: string[]): Promise<{
    success: boolean;
    results?: Record<string, boolean>;
    error?: string;
}> {
    const { role } = await ensureAuthenticated();
    requireAdmin(role);

    const unique = Array.from(new Set(hashes.filter(h => /^[a-f0-9]{64}$/i.test(h))));
    const out: Record<string, boolean> = {};
    const BATCH = 10;
    try {
        for (let i = 0; i < unique.length; i += BATCH) {
            const batch = unique.slice(i, i + BATCH);
            const results = await Promise.all(batch.map(async hash => {
                try {
                    const res = await fetch(`https://gravatar.com/avatar/${hash}?d=404&s=80`, {
                        method: 'HEAD',
                        // Gravatar is cacheable; let the platform cache.
                        cache: 'force-cache',
                    });
                    return [hash, res.status === 200] as const;
                } catch {
                    return [hash, false] as const;
                }
            }));
            for (const [h, exists] of results) out[h] = exists;
        }
        return { success: true, results: out };
    } catch (err: any) {
        return { success: false, error: err?.message || 'Gravatar check failed' };
    }
}
