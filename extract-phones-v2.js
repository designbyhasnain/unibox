require('dotenv').config({quiet:true});
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const OUR_NUMBERS = ['2535484020','4694614009','8777023623','8701933124','0749209000'];
const SPAM_SENDERS = ['mailsuite','mailtrack','notion','noreply','no-reply','mailer-daemon','indeed','slack','apple.com','google.com','facebook','linkedin','twitter','instagram','upwork','fiverr','paypal','stripe','frame.io','calendly','ramp.com','beehiiv','motionarray','musicbed','skillshare','wonderdynamics','21-draw','depositphotos','foodpanda','ebay','pinterest','amazon','spotify','sendgrid','hubspot','convertkit','mailchimp'];

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
    const sigMarkers = ['--', 'Best,', 'Thanks,', 'Cheers,', 'Regards,', 'Best regards', 'Kind regards', 'Sincerely'];
    let sigStart = text.length - 600;
    for (const marker of sigMarkers) {
        const idx = text.lastIndexOf(marker);
        if (idx > text.length * 0.5) { sigStart = Math.min(sigStart, idx); break; }
    }
    if (sigStart < 0) sigStart = 0;
    const sig = text.slice(sigStart);
    const matches = sig.match(phoneRegex) || [];
    for (const raw of matches) {
        const clean = cleanPhone(raw);
        if (clean) return clean;
    }
    return null;
}

(async () => {
    console.log('=== PHONE EXTRACTION v2 (with dedup + spam filter) ===\n');

    const { data: contacts } = await s.from('contacts')
        .select('id, name, email, phone')
        .is('phone', null)
        .not('email', 'is', null);
    
    const needPhone = (contacts || []).filter(c => !c.phone || c.phone.trim() === '');
    console.log('Contacts needing phone:', needPhone.length);

    const allResults = {};
    const phoneCount = {}; // Track how many contacts each phone appears on
    const chunkSize = 50;

    for (let i = 0; i < needPhone.length; i += chunkSize) {
        const chunk = needPhone.slice(i, i + chunkSize);
        const ids = chunk.map(c => c.id);

        const { data: emails } = await s.from('email_messages')
            .select('contact_id, body, from_email, sent_at')
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

        for (const [contactId, contactEmails] of Object.entries(byContact)) {
            const fromEmail = (contactEmails[0].from_email || '').toLowerCase();
            if (SPAM_SENDERS.some(sp => fromEmail.includes(sp))) continue;

            for (const email of contactEmails) {
                const phone = extractPhone(email.body);
                if (phone) {
                    const contact = chunk.find(c => c.id === contactId);
                    allResults[contactId] = { phone, name: contact?.name, email: contact?.email };
                    const digits = phone.replace(/\D/g, '');
                    phoneCount[digits] = (phoneCount[digits] || 0) + 1;
                    break;
                }
            }
        }

        if ((i + chunkSize) % 500 === 0) process.stderr.write('Scanned ' + (i + chunkSize) + '/' + needPhone.length + '...\n');
    }

    // Remove phones that appear on 3+ contacts (shared/template numbers)
    const dupePhones = new Set(Object.entries(phoneCount).filter(([_, count]) => count >= 3).map(([digits]) => digits));
    console.log('Duplicate phones removed:', dupePhones.size);

    const cleanResults = {};
    for (const [id, d] of Object.entries(allResults)) {
        const digits = d.phone.replace(/\D/g, '');
        if (!dupePhones.has(digits)) cleanResults[id] = d;
    }

    console.log('Clean results:', Object.keys(cleanResults).length, '\n');

    // Show first 30
    console.log('=== VERIFIED RESULTS (first 30) ===\n');
    Object.entries(cleanResults).slice(0, 30).forEach(([id, d], i) => {
        console.log((i+1) + '. ' + (d.name || '?').slice(0,25).padEnd(25) + ' | ' + (d.email || '').slice(0,30).padEnd(30) + ' | ' + d.phone);
    });

    console.log('\n=== SUMMARY ===');
    console.log('Scanned:', needPhone.length);
    console.log('Raw extractions:', Object.keys(allResults).length);
    console.log('After dedup:', Object.keys(cleanResults).length);
    console.log('Removed (shared numbers):', Object.keys(allResults).length - Object.keys(cleanResults).length);
    console.log('\n⚠ DRY RUN — nothing saved. Review above and confirm to apply.');
})();
