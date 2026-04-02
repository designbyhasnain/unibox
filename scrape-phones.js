require('dotenv').config({quiet:true});
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+\d{1,4}[-.\s]?\(?\d{1,5}\)?[-.\s]?\d{3,14}/g;
const OUR_NUMBERS = ['2535484020','4694614009'];

function cleanPhone(raw) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    if (/^20(2[0-9]|1[0-9])/.test(digits)) return null;
    if (OUR_NUMBERS.some(n => digits.includes(n))) return null;
    if (digits.length === 10 && !raw.startsWith('+')) return '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6);
    if (digits.length === 11 && digits.startsWith('1')) return '+1 (' + digits.slice(1,4) + ') ' + digits.slice(4,7) + '-' + digits.slice(7);
    return raw.trim();
}

async function scrapeWebsite(domain) {
    const urls = [
        'https://' + domain,
        'https://' + domain + '/contact',
        'https://' + domain + '/about',
        'https://www.' + domain,
    ];
    
    for (const url of urls) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(url, { 
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
                redirect: 'follow'
            });
            clearTimeout(timeout);
            if (!res.ok) continue;
            
            const html = await res.text();
            const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
            
            // Also check for tel: links
            const telMatch = html.match(/href="tel:([^"]+)"/);
            if (telMatch) {
                const clean = cleanPhone(telMatch[1]);
                if (clean) return { phone: clean, source: url };
            }
            
            // Regex on text
            const matches = text.match(phoneRegex) || [];
            for (const raw of matches) {
                const clean = cleanPhone(raw);
                if (clean) return { phone: clean, source: url };
            }
        } catch (e) {
            // timeout or network error — skip
        }
    }
    return null;
}

const isDryRun = !process.argv.includes('--apply');

(async () => {
    console.log('=== WEBSITE PHONE SCRAPER' + (isDryRun ? ' (DRY RUN)' : ' (APPLYING)') + ' ===\n');
    
    const genericDomains = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','aol.com','live.com','mail.com','protonmail.com','me.com','msn.com','ymail.com','comcast.net','att.net','verizon.net','gmx.de','gmx.com','web.de','test.com']);
    
    let contacts = [];
    let page = 0;
    while (true) {
        const { data } = await s.from('contacts').select('id, name, email').is('phone', null).not('email', 'is', null).range(page * 1000, (page + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        contacts = contacts.concat(data);
        page++;
    }
    
    const scrapeable = contacts.filter(c => {
        const d = c.email?.split('@')[1]?.toLowerCase();
        return d && !genericDomains.has(d);
    });
    
    // Dedupe by domain — scrape each domain once
    const domainMap = {};
    scrapeable.forEach(c => {
        const d = c.email.split('@')[1].toLowerCase();
        if (!domainMap[d]) domainMap[d] = [];
        domainMap[d].push(c);
    });
    
    const domains = Object.keys(domainMap);
    const limit = isDryRun ? 20 : domains.length;
    console.log('Unique domains to scrape:', domains.length, '(processing', limit, ')\n');
    
    let found = 0;
    let failed = 0;
    let applied = 0;
    
    for (let i = 0; i < Math.min(domains.length, limit); i++) {
        const domain = domains[i];
        const contacts = domainMap[domain];
        
        const result = await scrapeWebsite(domain);
        
        if (result) {
            found++;
            const names = contacts.map(c => c.name || '?').join(', ');
            console.log('✓ ' + domain.padEnd(35) + ' | ' + result.phone.padEnd(20) + ' | ' + names.slice(0, 30) + ' (' + contacts.length + ' contacts)');
            
            if (!isDryRun) {
                for (const c of contacts) {
                    await s.from('contacts').update({ phone: result.phone }).eq('id', c.id);
                    applied++;
                }
            }
        } else {
            failed++;
            if (isDryRun) console.log('✗ ' + domain);
        }
        
        if ((i + 1) % 50 === 0) process.stderr.write('Progress: ' + (i + 1) + '/' + limit + '\n');
    }
    
    console.log('\n=== SUMMARY ===');
    console.log('Scraped:', Math.min(domains.length, limit), 'domains');
    console.log('Found phones:', found);
    console.log('Failed:', failed);
    console.log('Success rate:', Math.round(found / Math.min(domains.length, limit) * 100) + '%');
    if (!isDryRun) console.log('Applied to:', applied, 'contacts');
    if (isDryRun) {
        console.log('\nEstimated total from all', domains.length, 'domains:', Math.round(domains.length * found / Math.min(domains.length, limit)));
        console.log('\n⚠ DRY RUN. Run with --apply to save.');
    }
})();
