'use client';

/**
 * Phase 15 — Branding Magic Links.
 *
 * One-click links to the right photo-upload destination per address type.
 * Eliminates the "wait, where do I go?" tax that's been blocking adoption
 * of the Gravatar / Google profile guidance for weeks.
 *
 * Three flows:
 *   - @gmail.com / @googlemail.com  → myaccount.google.com/personal-info
 *   - Custom domain                  → "Create Google Account for this email"
 *                                      (free, doesn't require Gmail address —
 *                                      gives the address a Google profile that
 *                                      Gmail recipients will use for the avatar)
 *                                    + Gravatar (covers Apple Mail / Outlook / Yahoo)
 */
import React from 'react';

interface Props {
    email: string;
    senderName?: string;
}

export default function BrandingMagicLinks({ email, senderName }: Props) {
    const isGmail = /@(gmail\.com|googlemail\.com)$/i.test(email);
    const md5 = useMd5(email);

    const copy = async (text: string) => {
        try { await navigator.clipboard.writeText(text); } catch {}
    };

    return (
        <div style={{
            border: '1px solid var(--hairline-soft)',
            borderRadius: 10,
            padding: 14,
            background: 'var(--surface-2)',
            fontSize: 13,
            color: 'var(--ink-2)',
        }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--ink)' }}>
                Branding setup for <code>{email}</code>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 10 }}>
                One-click destinations to lock the photo. The owner needs to be signed in to that email&apos;s account to actually save changes — we can&apos;t do this for them.
            </div>

            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                {isGmail ? (
                    <li>
                        <strong>Set Google profile photo</strong> →{' '}
                        <a href="https://myaccount.google.com/personal-info" target="_blank" rel="noopener noreferrer">
                            myaccount.google.com/personal-info
                        </a>
                        {' '}<button type="button" onClick={() => copy(email)} style={pill}>Copy email</button>
                        <div style={hint}>The owner signs in as {email} → uploads photo. Gmail recipients see it within a few hours.</div>
                    </li>
                ) : (
                    <>
                        <li>
                            <strong>Create a Google Account for this address</strong> →{' '}
                            <a href={`https://accounts.google.com/signup?email=${encodeURIComponent(email)}&continue=${encodeURIComponent('https://myaccount.google.com/personal-info')}`} target="_blank" rel="noopener noreferrer">
                                accounts.google.com/signup
                            </a>
                            {' '}<button type="button" onClick={() => copy(email)} style={pill}>Copy email</button>
                            <div style={hint}>
                                On the signup page, click <em>&quot;Use my current email address instead&quot;</em>, paste {email},
                                verify via the code Google emails. Then upload a photo at myaccount.google.com.
                                <br />
                                <strong>This is the only free path to Gmail-recipient avatars on custom domains.</strong>
                            </div>
                        </li>
                        <li style={{ marginTop: 10 }}>
                            <strong>Register on Gravatar</strong> →{' '}
                            <a href="https://gravatar.com/profile/avatars" target="_blank" rel="noopener noreferrer">
                                gravatar.com/profile/avatars
                            </a>
                            {' '}<button type="button" onClick={() => copy(email)} style={pill}>Copy email</button>
                            {md5 && (
                                <>
                                    {' '}<button type="button" onClick={() => copy(md5)} style={pill}>Copy MD5</button>
                                </>
                            )}
                            <div style={hint}>
                                Apple Mail / Outlook on the web / Yahoo Mail look up sender photos by MD5(email) on Gravatar.
                                Doesn&apos;t affect Gmail.
                            </div>
                        </li>
                    </>
                )}
            </ol>
        </div>
    );
}

const pill: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: 11,
    border: '1px solid var(--hairline)',
    borderRadius: 12,
    background: 'var(--shell)',
    color: 'var(--ink-2)',
    cursor: 'pointer',
    marginLeft: 6,
};
const hint: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--ink-muted)',
    marginTop: 4,
    marginLeft: 0,
    lineHeight: 1.5,
};

/**
 * Tiny synchronous MD5 — Gravatar's hash format. We only need to hash a
 * lowercase email (small input), so a from-scratch implementation is
 * acceptable. Adapted from the public-domain JS MD5 reference.
 */
function useMd5(email: string): string | null {
    try {
        return md5(email.trim().toLowerCase());
    } catch {
        return null;
    }
}

// Public-domain MD5 — accepts a string, returns hex digest. Roughly 60 lines.
function md5(s: string): string {
    function rh(num: number) {
        let s = '', j = 0;
        for (; j <= 3; j++) s += ((num >> (j * 8 + 4)) & 0x0F).toString(16) + ((num >> (j * 8)) & 0x0F).toString(16);
        return s;
    }
    function ad(x: number, y: number) {
        const l = (x & 0xFFFF) + (y & 0xFFFF);
        const m = (x >> 16) + (y >> 16) + (l >> 16);
        return (m << 16) | (l & 0xFFFF);
    }
    function rl(n: number, c: number) { return (n << c) | (n >>> (32 - c)); }
    function cm(q: number, a: number, b: number, x: number, s: number, t: number) { return ad(rl(ad(ad(a, q), ad(x, t)), s), b); }
    function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cm((b & c) | (~b & d), a, b, x, s, t); }
    function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cm((b & d) | (c & ~d), a, b, x, s, t); }
    function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cm(b ^ c ^ d, a, b, x, s, t); }
    function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cm(c ^ (b | ~d), a, b, x, s, t); }
    function cv(s: string) {
        const n = s.length;
        const len = ((n + 8) >> 6) + 1;
        const blks = new Array<number>(len * 16).fill(0);
        let i = 0;
        for (; i < n; i++) blks[i >> 2]! |= s.charCodeAt(i) << ((i % 4) * 8);
        blks[i >> 2]! |= 0x80 << ((i % 4) * 8);
        blks[len * 16 - 2] = n * 8;
        return blks;
    }
    const x = cv(unescape(encodeURIComponent(s)));
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < x.length; i += 16) {
        const oa = a, ob = b, oc = c, od = d;
        a = ff(a, b, c, d, x[i + 0]!, 7, -680876936);  d = ff(d, a, b, c, x[i + 1]!, 12, -389564586);  c = ff(c, d, a, b, x[i + 2]!, 17, 606105819);  b = ff(b, c, d, a, x[i + 3]!, 22, -1044525330);
        a = ff(a, b, c, d, x[i + 4]!, 7, -176418897);  d = ff(d, a, b, c, x[i + 5]!, 12, 1200080426); c = ff(c, d, a, b, x[i + 6]!, 17, -1473231341); b = ff(b, c, d, a, x[i + 7]!, 22, -45705983);
        a = ff(a, b, c, d, x[i + 8]!, 7, 1770035416);  d = ff(d, a, b, c, x[i + 9]!, 12, -1958414417); c = ff(c, d, a, b, x[i + 10]!, 17, -42063);     b = ff(b, c, d, a, x[i + 11]!, 22, -1990404162);
        a = ff(a, b, c, d, x[i + 12]!, 7, 1804603682); d = ff(d, a, b, c, x[i + 13]!, 12, -40341101); c = ff(c, d, a, b, x[i + 14]!, 17, -1502002290); b = ff(b, c, d, a, x[i + 15]!, 22, 1236535329);
        a = gg(a, b, c, d, x[i + 1]!, 5, -165796510); d = gg(d, a, b, c, x[i + 6]!, 9, -1069501632); c = gg(c, d, a, b, x[i + 11]!, 14, 643717713); b = gg(b, c, d, a, x[i + 0]!, 20, -373897302);
        a = gg(a, b, c, d, x[i + 5]!, 5, -701558691); d = gg(d, a, b, c, x[i + 10]!, 9, 38016083);   c = gg(c, d, a, b, x[i + 15]!, 14, -660478335); b = gg(b, c, d, a, x[i + 4]!, 20, -405537848);
        a = gg(a, b, c, d, x[i + 9]!, 5, 568446438);  d = gg(d, a, b, c, x[i + 14]!, 9, -1019803690); c = gg(c, d, a, b, x[i + 3]!, 14, -187363961);  b = gg(b, c, d, a, x[i + 8]!, 20, 1163531501);
        a = gg(a, b, c, d, x[i + 13]!, 5, -1444681467); d = gg(d, a, b, c, x[i + 2]!, 9, -51403784); c = gg(c, d, a, b, x[i + 7]!, 14, 1735328473);   b = gg(b, c, d, a, x[i + 12]!, 20, -1926607734);
        a = hh(a, b, c, d, x[i + 5]!, 4, -378558);    d = hh(d, a, b, c, x[i + 8]!, 11, -2022574463); c = hh(c, d, a, b, x[i + 11]!, 16, 1839030562); b = hh(b, c, d, a, x[i + 14]!, 23, -35309556);
        a = hh(a, b, c, d, x[i + 1]!, 4, -1530992060); d = hh(d, a, b, c, x[i + 4]!, 11, 1272893353); c = hh(c, d, a, b, x[i + 7]!, 16, -155497632); b = hh(b, c, d, a, x[i + 10]!, 23, -1094730640);
        a = hh(a, b, c, d, x[i + 13]!, 4, 681279174); d = hh(d, a, b, c, x[i + 0]!, 11, -358537222); c = hh(c, d, a, b, x[i + 3]!, 16, -722521979);  b = hh(b, c, d, a, x[i + 6]!, 23, 76029189);
        a = hh(a, b, c, d, x[i + 9]!, 4, -640364487); d = hh(d, a, b, c, x[i + 12]!, 11, -421815835); c = hh(c, d, a, b, x[i + 15]!, 16, 530742520); b = hh(b, c, d, a, x[i + 2]!, 23, -995338651);
        a = ii(a, b, c, d, x[i + 0]!, 6, -198630844);  d = ii(d, a, b, c, x[i + 7]!, 10, 1126891415); c = ii(c, d, a, b, x[i + 14]!, 15, -1416354905); b = ii(b, c, d, a, x[i + 5]!, 21, -57434055);
        a = ii(a, b, c, d, x[i + 12]!, 6, 1700485571); d = ii(d, a, b, c, x[i + 3]!, 10, -1894986606); c = ii(c, d, a, b, x[i + 10]!, 15, -1051523); b = ii(b, c, d, a, x[i + 1]!, 21, -2054922799);
        a = ii(a, b, c, d, x[i + 8]!, 6, 1873313359); d = ii(d, a, b, c, x[i + 15]!, 10, -30611744); c = ii(c, d, a, b, x[i + 6]!, 15, -1560198380);  b = ii(b, c, d, a, x[i + 13]!, 21, 1309151649);
        a = ii(a, b, c, d, x[i + 4]!, 6, -145523070); d = ii(d, a, b, c, x[i + 11]!, 10, -1120210379); c = ii(c, d, a, b, x[i + 2]!, 15, 718787259);  b = ii(b, c, d, a, x[i + 9]!, 21, -343485551);
        a = ad(a, oa); b = ad(b, ob); c = ad(c, oc); d = ad(d, od);
    }
    return rh(a) + rh(b) + rh(c) + rh(d);
}
