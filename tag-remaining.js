require('dotenv').config({quiet:true});
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ownEmails = ['rafayonfilm','rafayfilmmaker','rafayonreel','filmsbyrafay','rafaysarwarfilms','raffeditts','rafayvisuals1','rafay.films','editsbyraf','rafay.wedits','photographybyrafay','rafaystoryfilms'];

(async () => {
    const { data: all } = await s.from('edit_projects').select('client_name, client_email').not('client_name', 'is', null).neq('client_name', '');
    const nameCounts = {};
    const alreadyMatched = new Set();
    all.forEach(p => { const n = p.client_name?.trim(); if (!n) return; nameCounts[n] = (nameCounts[n] || 0) + 1; if (p.client_email) alreadyMatched.add(n); });
    const unmatched = Object.entries(nameCounts).filter(([name]) => !alreadyMatched.has(name)).sort((a, b) => b[1] - a[1]);

    const safeMatches = [];

    for (const [clientName, count] of unmatched) {
        const clean = clientName.replace(/[^a-zA-Z0-9 ]/g, '').trim();
        const words = clean.split(/\s+/).filter(w => w.length >= 3);
        if (words.length < 2) continue; // Skip single-word

        // Try exact domain match with full name squished
        const domainHint = words.join('').toLowerCase().slice(0, 16);
        const { data: dm } = await s.from('contacts').select('name, email').ilike('email', '%' + domainHint + '%').limit(3);
        const f = (dm || []).filter(c => !ownEmails.some(o => c.email.toLowerCase().includes(o)));
        if (f.length === 1) {
            safeMatches.push({ client: clientName, email: f[0].email, name: f[0].name, count, method: 'full_domain' });
            continue;
        }

        // Try first+last name as one word in domain
        if (words.length >= 2) {
            const combo = (words[0] + words[1]).toLowerCase();
            const { data: dm2 } = await s.from('contacts').select('name, email').ilike('email', '%' + combo + '%').limit(3);
            const f2 = (dm2 || []).filter(c => !ownEmails.some(o => c.email.toLowerCase().includes(o)));
            if (f2.length === 1) {
                safeMatches.push({ client: clientName, email: f2[0].email, name: f2[0].name, count, method: 'name_domain' });
                continue;
            }
        }

        // Try exact contact name match (unique only)
        const { data: nm } = await s.from('contacts').select('name, email').ilike('name', '%' + words[0] + '%' + words[1] + '%').limit(3);
        const fn = (nm || []).filter(c => !ownEmails.some(o => c.email.toLowerCase().includes(o)));
        if (fn.length === 1) {
            safeMatches.push({ client: clientName, email: fn[0].email, name: fn[0].name, count, method: 'exact_name' });
        }
    }

    console.log('Found', safeMatches.length, 'safe matches\n');

    let total = 0;
    for (const m of safeMatches) {
        const { data } = await s.from('edit_projects').update({ client_email: m.email }).eq('client_name', m.client).select('id');
        const c = data?.length || 0;
        total += c;
        console.log('✓', m.client, '→', m.email, '(' + c + 'p) [' + m.method + ']');
    }

    console.log('\nApplied:', safeMatches.length, 'clients,', total, 'projects');
    const { count: withEmail } = await s.from('edit_projects').select('id', { count: 'exact' }).not('client_email', 'is', null);
    const { count: totalProj } = await s.from('edit_projects').select('id', { count: 'exact' });
    console.log('Overall:', withEmail + '/' + totalProj, '(' + Math.round(withEmail / totalProj * 100) + '%)');
})();
