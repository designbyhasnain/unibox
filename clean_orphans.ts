import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
// To bypass RLS, we prefer the service role key if available.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
    console.log('Fetching all contacts...');
    const { data: contacts, error } = await supabase.from('contacts').select('id, email, name');

    if (error) {
        console.error('Error fetching contacts:', error);
        return;
    }

    if (!contacts || contacts.length === 0) {
        console.log('No contacts found.');
        return;
    }

    console.log(`Found ${contacts.length} total contacts. Checking for orphaned contacts...`);
    let deletedCount = 0;

    for (const contact of contacts) {
        // Find if this contact has *any* associated email messages
        const { count, error: countError } = await supabase
            .from('email_messages')
            .select('*', { count: 'exact', head: true })
            .eq('contact_id', contact.id);

        if (countError) {
            console.error(`Error counting messages for contact ID ${contact.id}:`, countError);
            continue;
        }

        // It's orphaned if it has 0 email messages linked to it.
        if (count === 0) {
            console.log(`Contact ${contact.email || contact.name} has 0 messages. Deleting their projects and the contact...`);

            // Delete associated projects
            await supabase.from('projects').delete().eq('client_id', contact.id);

            // Delete contact
            await supabase.from('contacts').delete().eq('id', contact.id);
            deletedCount++;
        }
    }

    console.log(`\nCleanup complete! Deleted ${deletedCount} orphaned contacts and their linked projects.`);
}

main().catch(console.error);
