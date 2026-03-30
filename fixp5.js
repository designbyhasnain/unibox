const fs = require('fs');
async function run() {
    const { createClient } = require('@supabase/supabase-js');
    function getEnvVar(name) {
        if (process.env[name]) return process.env[name];
        try {
            const envContent = fs.readFileSync('.env', 'utf8');
            const match = envContent.match(new RegExp(name + '=([^\\n\\r]+)'));
            if (match) return match[1].trim();
        } catch (e) { }
        return '';
    }
    const supabase = createClient(getEnvVar('NEXT_PUBLIC_SUPABASE_URL'), getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'));

    console.log('Starting Orphan Lead Recovery...');
    const { data: emails } = await supabase.from('email_messages').select('id, from_email, pipeline_stage, contact_id').in('pipeline_stage', ['COLD_LEAD', 'LEAD', 'OFFER_ACCEPTED', 'WON', 'CLOSED']).is('contact_id', null);

    console.log('Orphaned leads missing contact:', emails ? emails.length : 0);

    if (emails && emails.length > 0) {
        for (const msg of emails) {
            const rawEmail = msg.from_email || '';
            const emailMatch = rawEmail.match(/<([^>]+)>/);
            const actualEmail = emailMatch ? emailMatch[1] : rawEmail;

            if (!actualEmail) continue;

            let { data: contact } = await supabase.from('contacts').select('*').eq('email', actualEmail).maybeSingle();
            if (!contact) {
                const nameMatch = rawEmail.split('<')[0].trim().replace(/"/g, '');
                const finalName = nameMatch && nameMatch !== actualEmail ? nameMatch : actualEmail.split('@')[0];

                const { data: newContact, error: insertError } = await supabase.from('contacts').insert({
                    email: actualEmail,
                    name: finalName || null,
                    is_lead: true,
                    is_client: true,
                    pipeline_stage: msg.pipeline_stage
                }).select().single();
                if (insertError) console.error(insertError);
                contact = newContact;
            } else {
                await supabase.from('contacts').update({ is_lead: true, is_client: true, pipeline_stage: msg.pipeline_stage }).eq('id', contact.id);
            }
            if (contact) {
                await supabase.from('email_messages').update({ contact_id: contact.id }).eq('from_email', rawEmail).is('contact_id', null);
            }
        }
        console.log('Fixed orphan leads successfully.');
    }
}
run();
