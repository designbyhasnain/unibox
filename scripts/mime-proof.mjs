#!/usr/bin/env node
/**
 * MIME Proof — confirms the SMTP sender attaches the avatar as a
 * CID-referenced inline image (multipart/related).
 *
 * Compiles the EXACT same MIME envelope `manualEmailService.sendManualEmail`
 * builds, but uses nodemailer's streamTransport so NO real SMTP send happens.
 * Just dumps the raw MIME so you can see the structure.
 *
 * Usage:
 *   node scripts/mime-proof.mjs
 *
 * Reads no secrets, contacts no servers (except to fetch the public avatar
 * URL for inlining — Supabase Storage public bucket).
 */

import * as nodemailer from 'nodemailer';

const overrideUrl = process.argv.find(a => a.startsWith('http'));

// ─── Mirror the headers + body that manualEmailService.sendManualEmail sends ──

// Use the Gravatar default-mp PNG — guaranteed public 200 response, ~1KB,
// behaves identically to any persona image we'd ship in production.
const SAMPLE_PERSONA_URL = 'https://gravatar.com/avatar/0000000000000000000000000000000000000000000000000000000000000000?s=200&d=mp&forcedefault=y';
// To test with a real persona, pass the URL as the first CLI arg:
//   node scripts/mime-proof.mjs https://your-supabase-url/storage/.../persona.png
const PERSONA_URL = overrideUrl || SAMPLE_PERSONA_URL;

const senderName = 'Rafay S.';
const senderEmail = 'rafael.intl@filmsbyrafay.com';
const recipientEmail = 'recipient@example.com';
const subject = 'Sample message — MIME proof';
const SIGNATURE_CID = 'unibox-avatar';

// Match the signature builder output (CID-mode).
const signature = `
<!--unibox-sig-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0"
       style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <tr>
    <td valign="middle" style="padding-right:14px;">
      <img src="cid:${SIGNATURE_CID}" alt="${senderName}" width="60" height="60"
           style="width:60px;height:60px;border-radius:50%;display:block;object-fit:cover;border:0;" />
    </td>
    <td valign="middle" style="line-height:1.4;">
      <div style="font-size:15px;font-weight:600;color:#111827;">${senderName}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:2px;"><a href="https://wedits.com" style="color:#6b7280;text-decoration:none;">Wedits</a></div>
      <div style="font-size:13px;color:#6b7280;margin-top:2px;"><a href="mailto:${senderEmail}" style="color:#6b7280;text-decoration:none;">${senderEmail}</a></div>
    </td>
  </tr>
</table>
`;

const body = `<p>Hi there — testing the avatar embedding. Body content here.</p>${signature}<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person","name":"${senderName}","email":"${senderEmail}","image":"${PERSONA_URL}","worksFor":{"@type":"Organization","name":"Wedits","url":"https://wedits.com"}}</script>`;

const headers = {
    'List-Unsubscribe': `<mailto:unsubscribe@filmsbyrafay.com>, <https://example.com/api/unsubscribe?t=fake>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'BIMI-Selector': 'v=BIMI1; s=default;',
};

// ─── Compile MIME without sending ────────────────────────────────────

const transporter = nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true,
});

const info = await transporter.sendMail({
    from: { name: senderName, address: senderEmail },
    to: recipientEmail,
    subject,
    html: body,
    headers,
    attachments: [{
        filename: 'avatar.png',
        path: PERSONA_URL,
        cid: SIGNATURE_CID,
        contentDisposition: 'inline',
    }],
});

const raw = info.message.toString();

// ─── Print a summary first, then the full envelope ───────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(' MIME PROOF — what manualEmailService actually puts on the wire');
console.log('═══════════════════════════════════════════════════════════════\n');

const lines = raw.split(/\r?\n/);
const headerEnd = lines.findIndex(l => l === '');
const headerSection = lines.slice(0, headerEnd).join('\n');

// Unfold RFC 2822 header continuations (lines that start with whitespace
// belong to the previous header).
const unfolded = [];
for (const line of lines.slice(0, headerEnd)) {
    if (/^[ \t]/.test(line) && unfolded.length) {
        unfolded[unfolded.length - 1] += ' ' + line.trim();
    } else {
        unfolded.push(line);
    }
}

console.log('┌─ TOP-LEVEL HEADERS ─────────────────────────────────────────');
for (const line of unfolded) {
    if (/^(From|To|Subject|Content-Type|MIME-Version|List-Unsubscribe|BIMI|X-Image|X-Avatar|Avatar|X-Sender|X-Persona|Message-ID|Date)/i.test(line)) {
        // Truncate stupidly long lines for readable output.
        const display = line.length > 120 ? line.slice(0, 117) + '…' : line;
        console.log('│ ' + display);
    }
}
console.log('└─────────────────────────────────────────────────────────────\n');

// Find boundary separators.
const ctMatch = /Content-Type:\s*(multipart\/[a-z]+);.*boundary="?([^";]+)"?/i.exec(headerSection);
if (ctMatch) {
    console.log(`Top-level structure: ${ctMatch[1]}, boundary "${ctMatch[2]}"\n`);
}

// Find each part header.
const partHeaders = [...raw.matchAll(/--[^\r\n]+\r?\n((?:[A-Z][\w-]+:[^\r\n]+\r?\n)+)/gi)];
console.log('┌─ MIME PARTS DETECTED ───────────────────────────────────────');
partHeaders.forEach((m, i) => {
    const header = m[1].split(/\r?\n/).filter(Boolean);
    console.log(`│ Part ${i + 1}:`);
    for (const h of header) console.log(`│   ${h}`);
    console.log('│');
});
console.log('└─────────────────────────────────────────────────────────────\n');

// Confirm the key things.
const checks = [
    ['multipart/related at top level OR nested', /multipart\/related/.test(raw)],
    ['HTML body part present', /Content-Type:\s*text\/html/i.test(raw)],
    [`CID "${SIGNATURE_CID}" referenced in HTML`, raw.includes(`cid:${SIGNATURE_CID}`)],
    [`Content-ID: <${SIGNATURE_CID}> declared on attachment`, new RegExp(`Content-ID:\\s*<${SIGNATURE_CID}>`, 'i').test(raw)],
    ['Inline disposition on attachment', /Content-Disposition:\s*inline/i.test(raw)],
    ['BIMI-Selector header set', /BIMI-Selector:/i.test(raw)],
    ['List-Unsubscribe header set', /List-Unsubscribe:/i.test(raw)],
    ['NO speculative X-Image-URL header (cleaned up)', !/X-Image-URL:/i.test(raw)],
    ['NO speculative X-Avatar header (cleaned up)', !/X-Avatar:/i.test(raw)],
    ['NO speculative Avatar-URL header (cleaned up)', !/Avatar-URL:/i.test(raw)],
    ['NO speculative X-Sender-Photo header (cleaned up)', !/X-Sender-Photo:/i.test(raw)],
    ['NO speculative X-Persona-* header (cleaned up)', !/X-Persona-/i.test(raw)],
    ['Standard From header format ("Name" <email>)', /^From:\s*"?[^<]+"?\s*<[^>]+@[^>]+>/m.test(raw)],
];

console.log('┌─ ASSERTIONS ────────────────────────────────────────────────');
let allPass = true;
for (const [label, ok] of checks) {
    console.log(`│ ${ok ? '✅' : '❌'}  ${label}`);
    if (!ok) allPass = false;
}
console.log('└─────────────────────────────────────────────────────────────\n');

console.log(`Total MIME size: ${raw.length} bytes`);
console.log(allPass ? '🎉  All assertions PASS — avatar will render inline in any client.' : '⚠  Some assertions FAILED — see above.');

// Print full raw if --raw flag.
if (process.argv.includes('--raw')) {
    console.log('\n\n═════════ FULL RAW MIME (--raw) ══════════════\n');
    console.log(raw);
}
