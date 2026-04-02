require('dotenv').config({quiet:true});
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const OUR_NUMBERS = ['2535484020','4694614009','8777023623','8701933124','0749209000'];
const SPAM_SENDERS = ['mailsuite','mailtrack','notion','noreply','no-reply','mailer-daemon','indeed','slack','apple.com','google.com','facebook','linkedin','twitter','instagram','upwork','fiverr','paypal','stripe','frame.io','calendly','ramp.com','beehiiv','motionarray','musicbed','skillshare','wonderdynamics','depositphotos','foodpanda','ebay','pinterest','amazon','spotify','sendgrid','hubspot','convertkit','mailchimp'];

const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+\d{1,4}[-.\s]?\(?\d{1,5}\)?[-.\s]?\d{3,10}/g;

function cleanPhone(raw) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    if (/^20(2[0-9]|1[0-9])/.test(digits)) return null;
    if (OUR_NUMBERS.some(n => digits.includes(n))) return null;
    if (digits.length === 10 && !raw.startsWith('+')) return '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6);
    if (digits.length === 11 && digits.startsWith('1')) return '+1 (' + digits.slice(1,4) + ') ' + digits.slice(4,7) + '-' + digits.slice(7);
    return raw.trim();
}

function extractPhone(html) {
    let text = (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ');
    let sigStart = Math.max(0, text.length - 600);
    for (const m of ['--', 'Best,', 'Thanks,', 'Cheers,', 'Regards,', 'Sincerely']) {
        const idx = text.lastIndexOf(m);
        if (idx > text.length * 0.5) { sigStart = Math.min(sigStart, idx); break; }
    }
    const matches = text.slice(sigStart).match(phoneRegex) || [];
    for (const raw of matches) { const c = cleanPhone(raw); if (c) return c; }
    return null;
}

(async () => {
    console.log('=== PHONE EXTRACTION v3 ===\n');

    // Get contacts without phone — paginate properly
    let needPhone = [];
    let page = 0;
    while (true) {
        const { data } = await s.from('contacts').select('id, name, email').is('phone', null).range(page * 1000, (page + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        needPhone = needPhone.concat(data);
        page++;
    }
    console.log('Contacts needing phone:', needPhone.length);

    const allResults = {};
    const phoneCount = {};
    const chunkSize = 50;
    let scanned = 0;

    for (let i = 0; i < needPhone.length; i += chunkSize) {
        const chunk = needPhone.slice(i, i + chunkSize);
        const ids = chunk.map(c => c.id);

        const { data: emails } = await s.from('email_messages')
            .select('contact_id, body, from_email')
            .in('contact_id', ids)
            .eq('direction', 'RECEIVED')
            .not('body', 'is', null)
            .order('sent_at', { ascending: false })
            .limit(chunkSize * 3);

        if (!emails) continue;

        const byContact = {};
        emails.forEach(e => {
            if (!byContact[e.contact_id]) byContact[e.contact_id] = [];
            if (byContact[e.contact_id].length < 3) byContact[e.contact_id].push(e);
        });

        for (const [cid, ces] of Object.entries(byContact)) {
            const from = (ces[0].from_email || '').toLowerCase();
            if (SPAM_SENDERS.some(sp => from.includes(sp))) continue;
            for (const e of ces) {
                const phone = extractPhone(e.body);
                if (phone) {
                    const c = chunk.find(x => x.id === cid);
                    allResults[cid] = { phone, name: c?.name, email: c?.email };
                    const d = phone.replace(/\D/g, '');
                    phoneCount[d] = (phoneCount[d] || 0) + 1;
                    break;
                }
            }
        }

        scanned += chunk.length;
        if (scanned % 500 === 0) process.stderr.write('Scanned ' + scanned + '/' + needPhone.length + '...\n');
    }

    // Remove shared numbers (3+ contacts)
    const dupes = new Set(Object.entries(phoneCount).filter(([_, c]) => c >= 3).map(([d]) => d));
    const clean = {};
    for (const [id, d] of Object.entries(allResults)) {
        if (!dupes.has(d.phone.replace(/\D/g, ''))) clean[id] = d;
    }

    console.log('\nRaw:', Object.keys(allResults).length, '| Deduped:', Object.keys(clean).length, '| Removed shared:', Object.keys(allResults).length - Object.keys(clean).length);
    console.log('\n=== FIRST 30 RESULTS ===\n');
    Object.entries(clean).slice(0, 30).forEach(([_, d], i) => {
        console.log((i+1) + '. ' + (d.name || '?').slice(0,25).padEnd(25) + ' | ' + (d.email || '').slice(0,30).padEnd(30) + ' | ' + d.phone);
    });

    console.log('\n=== SUMMARY ===');
    console.log('Scanned:', scanned, '| Found:', Object.keys(clean).length);
    console.log('\n⚠ DRY RUN. Confirm to apply.');
})();
