require('dotenv').config({quiet:true});
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+\d{1,4}[-.\s]?\(?\d{1,5}\)?[-.\s]?\d{3,14}/g;
const OUR_NUMBERS = ['2535484020','4694614009'];
const genericDomains = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','aol.com','live.com','mail.com','protonmail.com','me.com','msn.com','ymail.com','comcast.net','att.net','verizon.net','gmx.de','gmx.com','web.de','test.com']);

function cleanPhone(raw) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    if (/^20(2[0-9]|1[0-9])/.test(digits)) return null;
    if (OUR_NUMBERS.some(n => digits.includes(n))) return null;
    if (digits.length === 10 && !raw.startsWith('+')) return '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6);
    if (digits.length === 11 && digits.startsWith('1')) return '+1 (' + digits.slice(1,4) + ') ' + digits.slice(4,7) + '-' + digits.slice(7);
    return raw.trim();
}

async function scrapeOne(domain) {
    for (const url of ['https://' + domain, 'https://' + domain + '/contact', 'https://www.' + domain]) {
        try {
            const c = new AbortController();
            const t = setTimeout(() => c.abort(), 4000);
            const res = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
            clearTimeout(t);
            if (!res.ok) continue;
            const html = await res.text();
            const telMatch = html.match(/href="tel:([^"]+)"/);
            if (telMatch) { const p = cleanPhone(telMatch[1]); if (p) return p; }
            const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
            const matches = text.match(phoneRegex) || [];
            for (const raw of matches) { const p = cleanPhone(raw); if (p) return p; }
        } catch (e) {}
    }
    return null;
}

(async () => {
    let contacts = [];
    let page = 0;
    while (true) {
        const { data } = await s.from('contacts').select('id, name, email').is('phone', null).not('email', 'is', null).range(page * 1000, (page + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        contacts = contacts.concat(data);
        page++;
    }

    const domainMap = {};
    contacts.filter(c => { const d = c.email?.split('@')[1]?.toLowerCase(); return d && !genericDomains.has(d); }).forEach(c => {
        const d = c.email.split('@')[1].toLowerCase();
        if (!domainMap[d]) domainMap[d] = [];
        domainMap[d].push(c);
    });

    const domains = Object.keys(domainMap);
    console.log('Scraping', domains.length, 'domains (10 parallel)...\n');

    let found = 0, applied = 0, processed = 0;
    const PARALLEL = 10;

    for (let i = 0; i < domains.length; i += PARALLEL) {
        const batch = domains.slice(i, i + PARALLEL);
        const results = await Promise.allSettled(batch.map(async (domain) => {
            const phone = await scrapeOne(domain);
            return { domain, phone };
        }));

        for (const r of results) {
            if (r.status === 'fulfilled' && r.value.phone) {
                const { domain, phone } = r.value;
                found++;
                const contactList = domainMap[domain];
                for (const c of contactList) {
                    await s.from('contacts').update({ phone }).eq('id', c.id);
                    applied++;
                }
                console.log('✓', domain.padEnd(35), '|', phone.padEnd(20), '|', contactList.length, 'contacts');
            }
        }

        processed += batch.length;
        if (processed % 100 === 0) console.log('--- Progress:', processed, '/', domains.length, '| Found:', found, '---');
    }

    console.log('\n=== DONE ===');
    console.log('Scraped:', processed);
    console.log('Found:', found);
    console.log('Applied to:', applied, 'contacts');
    
    const { count: withPhone } = await s.from('contacts').select('id', { count: 'exact' }).not('phone', 'is', null);
    console.log('Total contacts with phone:', withPhone);
})();
