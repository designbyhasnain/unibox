require('dotenv').config({quiet:true});
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ownEmails = ['rafayonfilm','rafayfilmmaker','rafayonreel','filmsbyrafay','rafaysarwarfilms','raffeditts','rafayvisuals1','rafay.films','editsbyraf','rafay.wedits','photographybyrafay','rafaystoryfilms'];
const spamDomains = ['notion.so','mailsuite','mailer-daemon','google.com','trello.com','upwork.com','mailtrack.io','frame.io','wonderdynamics','skillshare','musicbed','mailchimp','sendgrid','hubspot','beehiiv','motionarray','indeed.com','slack.com','apple.com','ebay','pinterest','amazon','spotify','foodpanda','linkedin','facebook','instagram','twitter','depositphotos','zackkravits','localrise','lamaretail','artofvisuals','photocontest','dmvproductions'];
const stopWords = new Set(['the','and','for','new','pre','hlf','flf','reel','reels','edit','film','card','wedding','highlight','raw','data','value','changes','culling','deduction','review','cost','video','real','estate','test','uploading','restructure','bounty','negative','come','club','tours','travel','black','drop','podcast','couple','name','corporate','task','project','vlog']);
const hardSkip = new Set(['TCM','Firelite','Slavik Yasinsky','DC- outsource','Todd','local','tom','Seven rose films','Michaela Mellner','Hector']);

(async () => {
    const { data: all } = await s.from('edit_projects').select('client_name, client_email, name').not('client_name', 'is', null).neq('client_name', '');
    const nameCounts = {};
    const alreadyMatched = new Set();
    const clientProjects = {};
    all.forEach(p => { const n = p.client_name?.trim(); if (!n) return; nameCounts[n] = (nameCounts[n] || 0) + 1; if (p.client_email) alreadyMatched.add(n); if (!clientProjects[n]) clientProjects[n] = []; clientProjects[n].push(p.name?.trim()); });
    const unmatched = Object.entries(nameCounts).filter(([name]) => !alreadyMatched.has(name) && !hardSkip.has(name)).sort((a, b) => b[1] - a[1]);

    console.log('Processing', Math.min(unmatched.length, 100), 'clients...\n');

    const safeMatches = [];

    for (const [clientName, count] of unmatched.slice(0, 100)) {
        const searchName = clientName.replace(/[^a-zA-Z0-9 ]/g, '').trim();
        const words = searchName.split(/\s+/).filter(w => w.length >= 2);
        const special = clientName.match(/\(([^)]+)\)/)?.[1]?.trim();
        let scores = {};

        // L1: Domain match
        const ds = (special || searchName).toLowerCase().replace(/[\s\-]/g, '');
        if (ds.length >= 4) {
            const { data: dm } = await s.from('contacts').select('name, email').ilike('email', '%' + ds.slice(0, 12) + '%').limit(5);
            (dm || []).filter(c => !ownEmails.some(o => c.email.toLowerCase().includes(o)) && !spamDomains.some(d => c.email.includes(d))).forEach(c => {
                if (!scores[c.email]) scores[c.email] = { name: c.name, score: 0, layers: [] };
                scores[c.email].score += 25; scores[c.email].layers.push('L1');
            });
        }

        // L2: FROM name
        if (words[0]?.length >= 3) {
            const q = words.length >= 2 ? '%' + words[0] + '%' + words[1] + '%' : '%' + words[0] + '%';
            // Only use multi-word for FROM to avoid generic single names
            if (words.length >= 2) {
                const { data: emails } = await s.from('email_messages').select('from_email').ilike('from_email', q).eq('direction', 'RECEIVED').limit(10);
                (emails || []).filter(e => {
                    const f = (e.from_email?.match(/<([^>]+)>/)?.[1] || e.from_email || '').toLowerCase();
                    return !ownEmails.some(o => f.includes(o)) && !spamDomains.some(d => f.includes(d));
                }).forEach(e => {
                    const from = (e.from_email?.match(/<([^>]+)>/)?.[1] || e.from_email || '').toLowerCase();
                    const name = e.from_email?.split('<')[0]?.trim()?.replace(/"/g, '') || from;
                    if (!scores[from]) scores[from] = { name, score: 0, layers: [] };
                    scores[from].score += 20; scores[from].layers.push('L2');
                });
            }
        }

        // L3: Contact name exact (2+ words only)
        if (words.length >= 2) {
            const { data: nm } = await s.from('contacts').select('name, email').ilike('name', '%' + words[0] + '%' + words[1] + '%').limit(3);
            (nm || []).filter(c => !ownEmails.some(o => c.email.toLowerCase().includes(o))).forEach(c => {
                if (!scores[c.email]) scores[c.email] = { name: c.name, score: 0, layers: [] };
                scores[c.email].score += 20; scores[c.email].layers.push('L3');
            });
        }

        // L5: Hint match
        if (special) {
            const hint = special.toLowerCase().replace(/\s+/g, '');
            const { data: sp } = await s.from('contacts').select('name, email').ilike('email', '%' + hint + '%').limit(3);
            (sp || []).forEach(c => {
                if (!scores[c.email]) scores[c.email] = { name: c.name, score: 0, layers: [] };
                scores[c.email].score += 30; scores[c.email].layers.push('L5');
            });
        }

        // L8+L9: Penalties and bonuses
        for (const email of Object.keys(scores)) {
            const dom = email.split('@')[1] || '';
            if (dom.includes('.top') || dom.includes('.xyz') || dom.includes('.info') || email.includes('upwork.com')) {
                scores[email].score -= 30; scores[email].layers.push('L8:-30');
            }
            if (/film|photo|video|wedding|media|studio|production|creative|visual/i.test(dom)) {
                scores[email].score += 10; scores[email].layers.push('L9:+10');
            }
        }

        // Only accept HIGH confidence (score >= 40) with domain or name match
        const ranked = Object.entries(scores).map(([email, d]) => ({ email, ...d })).filter(d => d.score >= 40).sort((a, b) => b.score - a.score);

        if (ranked.length === 1 || (ranked.length > 1 && ranked[0].score > ranked[1].score + 10)) {
            const top = ranked[0];
            safeMatches.push({ client: clientName, email: top.email, name: top.name, count, score: top.score, layers: top.layers.join('>') });
        }
    }

    console.log('Safe matches found:', safeMatches.length, '\n');

    let total = 0;
    for (const m of safeMatches) {
        const { data } = await s.from('edit_projects').update({ client_email: m.email }).eq('client_name', m.client).select('id');
        const c = data?.length || 0;
        total += c;
        console.log('✓', m.client, '→', m.email, '(' + c + ') [' + m.score + 'pts ' + m.layers + ']');
    }

    console.log('\nApplied:', safeMatches.length, 'clients,', total, 'projects');
    const { count: withEmail } = await s.from('edit_projects').select('id', { count: 'exact' }).not('client_email', 'is', null);
    const { count: totalProj } = await s.from('edit_projects').select('id', { count: 'exact' });
    console.log('Overall:', withEmail + '/' + totalProj, '(' + Math.round(withEmail/totalProj*100) + '%)');
})();
