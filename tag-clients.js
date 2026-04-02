require('dotenv').config({quiet:true});
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ownEmails = ['rafayonfilm','rafayfilmmaker','rafayonreel','filmsbyrafay','rafaysarwarfilms','raffeditts','rafayvisuals1','rafay.films','editsbyraf','rafay.wedits','photographybyrafay','rafaystoryfilms'];
const spamDomains = ['notion.so','mailsuite','mailer-daemon','google.com','trello.com','upwork.com','mailtrack.io','frame.io','wonderdynamics','skillshare','musicbed','mailchimp','sendgrid','hubspot','beehiiv','motionarray','indeed.com','slack.com','apple.com','ebay','pinterest','amazon','spotify','foodpanda','linkedin','facebook','instagram','twitter'];
const stopWords = ['the','and','for','new','pre','hlf','flf','reel','reels','edit','film','card','wedding','highlight','raw','data','value','changes','culling','deduction','review','cost','video','real','estate','test','uploading','restructure','bounty','negative'];

(async () => {
    const { data: all } = await s.from('edit_projects').select('client_name, client_email, name').not('client_name', 'is', null).neq('client_name', '');
    const nameCounts = {};
    const alreadyMatched = new Set();
    const clientProjects = {};
    all.forEach(p => { const n = p.client_name?.trim(); if (!n) return; nameCounts[n] = (nameCounts[n] || 0) + 1; if (p.client_email) alreadyMatched.add(n); if (!clientProjects[n]) clientProjects[n] = []; clientProjects[n].push(p.name?.trim()); });
    const unmatched = Object.entries(nameCounts).filter(([name]) => !alreadyMatched.has(name)).sort((a, b) => b[1] - a[1]);

    console.log('10-LAYER TAGGING SYSTEM');
    console.log('L1: Domain match (+25)  — client company name in email domain');
    console.log('L2: FROM name (+20)     — client name appears in email FROM field');
    console.log('L3: Contact name (+20)  — exact multi-word match in contacts table');
    console.log('L4: Project thread (+15)— filmmaker emailed about a couple/project');
    console.log('L5: Hint match (+30)    — parenthetical company hint in client name');
    console.log('L6: Volume bonus (+5/10)— high email exchange volume');
    console.log('L7: Couple penalty (-20)— contact name IS a couple name (wrong match)');
    console.log('L8: Spam penalty (-30)  — upwork/spam domain');
    console.log('L9: Filmmaker bonus (+10)—domain contains film/photo/video/wedding');
    console.log('L10: Threshold (25+)    — only matches scoring 25+ are considered');
    console.log('');

    for (const [clientName, count] of unmatched.slice(0, 10)) {
        const projects = clientProjects[clientName] || [];
        const searchName = clientName.replace(/[^a-zA-Z0-9 ]/g, '').trim();
        const words = searchName.split(/\s+/).filter(w => w.length >= 2);
        const special = clientName.match(/\(([^)]+)\)/)?.[1]?.trim();

        console.log('\n' + '='.repeat(55));
        console.log(clientName + ' (' + count + ' projects)');
        console.log('Projects: ' + projects.slice(0, 4).join(' | '));
        console.log('-'.repeat(55));

        let scores = {};

        // L1: Domain match
        const domainSearch = (special || searchName).toLowerCase().replace(/[\s\-]/g, '');
        if (domainSearch.length >= 4) {
            const { data: dm } = await s.from('contacts').select('name, email').ilike('email', '%' + domainSearch.slice(0, 12) + '%').limit(5);
            (dm || []).filter(c => !ownEmails.some(o => c.email.toLowerCase().includes(o))).forEach(c => {
                if (!scores[c.email]) scores[c.email] = { name: c.name, score: 0, layers: [] };
                scores[c.email].score += 25;
                scores[c.email].layers.push('L1:DOMAIN(+25)');
            });
        }

        // L2: Client name in FROM field
        if (words[0]?.length >= 3) {
            const q = words.length >= 2 ? '%' + words[0] + '%' + words[1] + '%' : '%' + words[0] + '%';
            const { data: emails } = await s.from('email_messages').select('from_email').ilike('from_email', q).eq('direction', 'RECEIVED').limit(15);
            (emails || []).filter(e => {
                const f = (e.from_email?.match(/<([^>]+)>/)?.[1] || e.from_email || '').toLowerCase();
                return !ownEmails.some(o => f.includes(o)) && !spamDomains.some(d => f.includes(d));
            }).forEach(e => {
                const from = (e.from_email?.match(/<([^>]+)>/)?.[1] || e.from_email || '').toLowerCase();
                const name = e.from_email?.split('<')[0]?.trim()?.replace(/"/g, '') || from;
                if (!scores[from]) scores[from] = { name, score: 0, layers: [] };
                scores[from].score += 20;
                scores[from].layers.push('L2:FROM_NAME(+20)');
            });
        }

        // L3: Contact name exact match
        if (words.length >= 2) {
            const { data: nm } = await s.from('contacts').select('name, email').ilike('name', '%' + words[0] + '%' + words[1] + '%').limit(5);
            (nm || []).filter(c => !ownEmails.some(o => c.email.toLowerCase().includes(o))).forEach(c => {
                if (!scores[c.email]) scores[c.email] = { name: c.name, score: 0, layers: [] };
                scores[c.email].score += 20;
                scores[c.email].layers.push('L3:NAME_MATCH(+20)');
            });
        }

        // L4: Project thread matching
        const coupleNames = [];
        projects.forEach(proj => {
            if (!proj) return;
            proj.replace(/[()]/g, '').split(/[+&,]+/).map(w => w.trim()).filter(w => w.length >= 3).forEach(w => {
                const first = w.split(/\s+/)[0];
                if (first?.length >= 3 && !stopWords.includes(first.toLowerCase())) coupleNames.push(first);
            });
        });
        const uniqueCouples = [...new Set(coupleNames)].slice(0, 6);
        for (const couple of uniqueCouples) {
            const { data: emails } = await s.from('email_messages').select('from_email, subject').ilike('subject', '%' + couple + '%').eq('direction', 'RECEIVED').limit(10);
            (emails || []).filter(e => {
                const f = (e.from_email?.match(/<([^>]+)>/)?.[1] || e.from_email || '').toLowerCase();
                return !ownEmails.some(o => f.includes(o)) && !spamDomains.some(d => f.includes(d));
            }).forEach(e => {
                const from = (e.from_email?.match(/<([^>]+)>/)?.[1] || e.from_email || '').toLowerCase();
                const name = e.from_email?.split('<')[0]?.trim()?.replace(/"/g, '') || from;
                if (!scores[from]) scores[from] = { name, score: 0, layers: [] };
                const tag = 'L4:PROJECT(' + couple + ',+15)';
                if (!scores[from].layers.includes(tag)) { scores[from].score += 15; scores[from].layers.push(tag); }
            });
        }

        // L5: Hint match
        if (special) {
            const hint = special.toLowerCase().replace(/\s+/g, '');
            const { data: sp } = await s.from('contacts').select('name, email').ilike('email', '%' + hint + '%').limit(3);
            (sp || []).forEach(c => {
                if (!scores[c.email]) scores[c.email] = { name: c.name, score: 0, layers: [] };
                scores[c.email].score += 30;
                scores[c.email].layers.push('L5:HINT(+30)');
            });
        }

        // L6-L9: Bonuses and penalties
        for (const email of Object.keys(scores)) {
            // L6: Volume
            const { count: received } = await s.from('email_messages').select('id', { count: 'exact' }).ilike('from_email', '%' + email + '%').eq('direction', 'RECEIVED');
            if (received > 5) { scores[email].score += 10; scores[email].layers.push('L6:VOLUME(+10,' + received + ')'); }
            else if (received > 2) { scores[email].score += 5; scores[email].layers.push('L6:VOLUME(+5,' + received + ')'); }

            // L7: Couple name penalty
            const cn = scores[email].name.toLowerCase();
            uniqueCouples.forEach(couple => {
                if (cn.includes(couple.toLowerCase())) { scores[email].score -= 20; scores[email].layers.push('L7:COUPLE(-20,' + couple + ')'); }
            });

            // L8: Spam penalty
            const dom = email.split('@')[1] || '';
            if (dom.includes('.top') || dom.includes('.xyz') || dom.includes('.info') || email.includes('upwork.com')) {
                scores[email].score -= 30; scores[email].layers.push('L8:SPAM(-30)');
            }

            // L9: Filmmaker domain bonus
            if (/film|photo|video|wedding|media|studio|production|creative|visual/i.test(dom)) {
                scores[email].score += 10; scores[email].layers.push('L9:FILMMAKER(+10)');
            }
        }

        // L10: Threshold
        const ranked = Object.entries(scores).map(([email, d]) => ({ email, ...d })).filter(d => d.score >= 25).sort((a, b) => b.score - a.score);

        if (ranked.length > 0) {
            const top = ranked[0];
            const conf = top.score >= 50 ? 'HIGH' : top.score >= 35 ? 'MEDIUM' : 'LOW';
            console.log('BEST: ' + top.email + ' (' + top.name + ')');
            console.log('Score: ' + top.score + ' | Confidence: ' + conf);
            console.log('Layers: ' + top.layers.join(' > '));
            if (ranked.length > 1) console.log('Runner-up: ' + ranked[1].email + ' (' + ranked[1].score + ')');
        } else {
            console.log('NO CONFIDENT MATCH');
        }
    }
})();
