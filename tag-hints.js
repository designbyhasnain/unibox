require('dotenv').config({quiet:true});
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ownEmails = ['rafayonfilm','rafayfilmmaker','rafayonreel','filmsbyrafay','rafaysarwarfilms','raffeditts','rafayvisuals1','rafay.films','editsbyraf','rafay.wedits','photographybyrafay','rafaystoryfilms'];

(async () => {
    const { data: all } = await s.from('edit_projects').select('client_name, client_email').not('client_name', 'is', null).neq('client_name', '');
    const nameCounts = {};
    const alreadyMatched = new Set();
    all.forEach(p => { const n = p.client_name?.trim(); if (!n) return; nameCounts[n] = (nameCounts[n] || 0) + 1; if (p.client_email) alreadyMatched.add(n); });
    const unmatched = Object.entries(nameCounts).filter(([name]) => !alreadyMatched.has(name));

    // Find all with parenthetical hints OR dash-hints
    const withHints = unmatched.filter(([name]) => name.includes('(') || name.includes(' - '));
    console.log('Clients with company hints:', withHints.length, '\n');

    const safeMatches = [];

    for (const [clientName, count] of withHints) {
        // Extract hint from parentheses or after dash
        let hint = '';
        const parenMatch = clientName.match(/\(([^)]+)\)/);
        if (parenMatch) {
            hint = parenMatch[1].trim();
        } else {
            const dashParts = clientName.split(' - ');
            if (dashParts.length >= 2) hint = dashParts[1].trim();
        }
        if (!hint || hint.length < 3) continue;

        const hintClean = hint.toLowerCase().replace(/[\s\-&']/g, '');
        const firstName = clientName.split(/[\s(]/)[0].trim().toLowerCase();

        console.log(clientName + ' (' + count + 'p) → hint: "' + hint + '"');

        // Search contacts by hint in email domain
        const { data: domainMatches } = await s.from('contacts').select('name, email').ilike('email', '%' + hintClean.slice(0, 14) + '%').limit(5);
        const filtered = (domainMatches || []).filter(c => !ownEmails.some(o => c.email.toLowerCase().includes(o)));

        // Also search by first name + hint combined
        const { data: nameMatches } = await s.from('contacts').select('name, email').ilike('name', '%' + firstName + '%').limit(10);
        const nameFiltered = (nameMatches || []).filter(c => !ownEmails.some(o => c.email.toLowerCase().includes(o)));

        // Cross-reference: contact whose email contains hint AND name contains first name
        let bestMatch = null;

        // Priority 1: Domain contains hint
        if (filtered.length === 1) {
            bestMatch = { email: filtered[0].email, name: filtered[0].name, method: 'domain_hint' };
        } else if (filtered.length > 1) {
            // Pick the one whose name matches the first name
            const nameMatch = filtered.find(c => c.name.toLowerCase().includes(firstName));
            if (nameMatch) bestMatch = { email: nameMatch.email, name: nameMatch.name, method: 'domain+name' };
            else bestMatch = { email: filtered[0].email, name: filtered[0].name, method: 'domain_first' };
        }

        // Priority 2: FROM emails containing hint
        if (!bestMatch) {
            const { data: emails } = await s.from('email_messages').select('from_email')
                .ilike('from_email', '%' + hintClean.slice(0, 12) + '%').eq('direction', 'RECEIVED').limit(5);
            const validEmails = (emails || []).filter(e => {
                const f = (e.from_email?.match(/<([^>]+)>/)?.[1] || e.from_email || '').toLowerCase();
                return !ownEmails.some(o => f.includes(o));
            });
            if (validEmails.length > 0) {
                const from = (validEmails[0].from_email?.match(/<([^>]+)>/)?.[1] || validEmails[0].from_email || '').toLowerCase();
                const name = validEmails[0].from_email?.split('<')[0]?.trim()?.replace(/"/g, '') || from;
                bestMatch = { email: from, name, method: 'from_hint' };
            }
        }

        if (bestMatch) {
            const dom = bestMatch.email.split('@')[1] || '';
            if (dom.includes('.top') || dom.includes('.xyz') || dom.includes('.info')) {
                console.log('  ✗ SPAM domain, skipped\n');
                continue;
            }
            console.log('  ✓ ' + bestMatch.email + ' (' + bestMatch.name + ') [' + bestMatch.method + ']');
            safeMatches.push({ client: clientName, email: bestMatch.email, name: bestMatch.name, count, method: bestMatch.method });
        } else {
            console.log('  ✗ no match');
        }
        console.log('');
    }

    console.log('\n=== APPLYING ' + safeMatches.length + ' MATCHES ===\n');

    let total = 0;
    for (const m of safeMatches) {
        const { data } = await s.from('edit_projects').update({ client_email: m.email }).eq('client_name', m.client).select('id');
        const c = data?.length || 0;
        total += c;
        console.log('✓', m.client, '→', m.email, '(' + c + 'p)');
    }

    console.log('\nApplied:', safeMatches.length, 'clients,', total, 'projects');
    const { count: withEmail } = await s.from('edit_projects').select('id', { count: 'exact' }).not('client_email', 'is', null);
    const { count: totalProj } = await s.from('edit_projects').select('id', { count: 'exact' });
    console.log('Overall:', withEmail + '/' + totalProj, '(' + Math.round(withEmail / totalProj * 100) + '%)');
})();
