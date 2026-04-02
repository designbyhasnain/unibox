require('dotenv').config({quiet:true});
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Our own numbers to exclude
const OUR_NUMBERS = ['2535484020', '253548402'];
const SPAM_CONTACTS = ['mailsuite', 'mailtrack', 'notion', 'noreply', 'no-reply', 'mailer-daemon', 'indeed', 'slack', 'apple', 'google', 'facebook', 'linkedin', 'twitter', 'instagram', 'upwork', 'fiverr', 'paypal', 'stripe'];

const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+\d{1,4}[-.\s]?\(?\d{1,5}\)?[-.\s]?\d{3,10}/g;

function cleanPhone(raw) {
    const digits = raw.replace(/\D/g, '');
    // Skip years, zip codes, short numbers
    if (digits.length < 7 || digits.length > 15) return null;
    if (/^20(2[0-9]|1[0-9])/.test(digits)) return null; // years 2010-2029
    if (OUR_NUMBERS.some(n => digits.includes(n))) return null;
    // Format nicely
    if (digits.length === 10 && !raw.startsWith('+')) return '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6);
    if (digits.length === 11 && digits.startsWith('1')) return '+1 (' + digits.slice(1,4) + ') ' + digits.slice(4,7) + '-' + digits.slice(7);
    return raw.trim();
}

function extractPhoneFromSignature(html) {
    // Strip HTML, get clean text
    let text = (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ');
    
    // Focus on signature area — last 600 chars, or after common signature markers
    const sigMarkers = ['--', 'Best,', 'Thanks,', 'Cheers,', 'Regards,', 'Best regards', 'Kind regards', 'Sincerely', 'Sent from', 'Get Outlook'];
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
    console.log('=== PHONE EXTRACTION DRY RUN ===\n');
    console.log('Strategy: Read LATEST received email per contact, extract phone from signature\n');
    
    // Step 1: Get all contacts without phone numbers
    const { data: contacts } = await s.from('contacts')
        .select('id, name, email, phone')
        .or('phone.is.null,phone.eq.')
        .limit(5000);
    
    const needPhone = (contacts || []).filter(c => !c.phone || c.phone.trim() === '');
    console.log('Contacts needing phone:', needPhone.length);
    
    // Step 2: For efficiency, batch query — get latest RECEIVED email per contact
    // Process in chunks of 50
    const results = {};
    const chunkSize = 50;
    let processed = 0;
    
    for (let i = 0; i < Math.min(needPhone.length, 500); i += chunkSize) {
        const chunk = needPhone.slice(i, i + chunkSize);
        const ids = chunk.map(c => c.id);
        
        // Get latest received email body for each contact in this chunk
        const { data: emails } = await s.from('email_messages')
            .select('contact_id, body, from_email, sent_at')
            .in('contact_id', ids)
            .eq('direction', 'RECEIVED')
            .not('body', 'is', null)
            .order('sent_at', { ascending: false })
            .limit(chunkSize * 3); // Multiple emails per contact, we'll dedupe
        
        if (!emails) continue;
        
        // Group by contact, take latest
        const byContact = {};
        emails.forEach(e => {
            if (!byContact[e.contact_id]) byContact[e.contact_id] = [];
            if (byContact[e.contact_id].length < 3) byContact[e.contact_id].push(e);
        });
        
        for (const [contactId, contactEmails] of Object.entries(byContact)) {
            // Skip spam contacts
            const fromEmail = (contactEmails[0].from_email || '').toLowerCase();
            if (SPAM_CONTACTS.some(sp => fromEmail.includes(sp))) continue;
            
            // Try each email until we find a phone
            for (const email of contactEmails) {
                const phone = extractPhoneFromSignature(email.body);
                if (phone) {
                    const contact = chunk.find(c => c.id === contactId);
                    results[contactId] = { phone, name: contact?.name, email: contact?.email };
                    break;
                }
            }
        }
        
        processed += chunk.length;
        if (processed % 200 === 0) process.stderr.write('Scanned ' + processed + '/' + Math.min(needPhone.length, 500) + '...\n');
    }
    
    console.log('\nPhones extracted:', Object.keys(results).length, 'from', processed, 'contacts scanned\n');
    
    // Show first 30 results
    console.log('=== SAMPLE RESULTS (first 30) ===\n');
    const entries = Object.entries(results).slice(0, 30);
    entries.forEach(([id, d], i) => {
        console.log((i+1) + '. ' + (d.name || '?').slice(0,25).padEnd(25) + ' | ' + (d.email || '').slice(0,30).padEnd(30) + ' | ' + d.phone);
    });
    
    console.log('\n=== SUMMARY ===');
    console.log('Total contacts without phone:', needPhone.length);
    console.log('Scanned:', processed);
    console.log('Phones found:', Object.keys(results).length);
    console.log('Success rate:', Math.round(Object.keys(results).length / processed * 100) + '%');
    console.log('\nEstimated total extractable:', Math.round(needPhone.length * Object.keys(results).length / processed));
    console.log('\n⚠ DRY RUN — nothing saved. Run with --apply to save.');
})();
