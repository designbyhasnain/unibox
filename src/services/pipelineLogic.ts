// TODO: Add `import 'server-only';` after running `npm install` to install the server-only package.
// This prevents accidental client-side imports that could leak secrets.
import { supabase } from '../lib/supabase';

type PipelineStage = 'LEAD' | 'COLD_LEAD' | 'OFFER_ACCEPTED' | 'CLOSED';

/**
 * Creates a new Lead manually from the Account Manager
 */
export async function createManualLead(data: {
    name: string;
    email: string;
    source?: string;
    notes?: string;
    accountManagerId: string;
}) {
    const { data: existing } = await supabase
        .from('contacts')
        .select('*')
        .eq('email', data.email)
        .maybeSingle();

    if (existing) {
        if (!existing.is_lead) {
            await supabase
                .from('contacts')
                .update({
                    is_lead: true,
                    pipeline_stage: 'COLD_LEAD',
                    account_manager_id: data.accountManagerId,
                    source: data.source ?? null,
                    notes: data.notes
                        ? existing.notes
                            ? `${existing.notes}\n${data.notes}`
                            : data.notes
                        : existing.notes,
                })
                .eq('id', existing.id);

            await supabase.from('activity_logs').insert({
                action: 'Existing Contact promoted to Lead',
                performed_by: data.accountManagerId,
                contact_id: existing.id,
            });
        }
        return existing;
    }

    const { data: contact, error } = await supabase
        .from('contacts')
        .insert({
            name: data.name,
            email: data.email,
            source: data.source ?? null,
            notes: data.notes ?? null,
            is_lead: true,
            pipeline_stage: 'COLD_LEAD' as PipelineStage,
            is_client: false,
            account_manager_id: data.accountManagerId,
        })
        .select()
        .single();

    if (error) throw error;

    await supabase.from('activity_logs').insert({
        action: 'New Lead manually created',
        performed_by: data.accountManagerId,
        contact_id: contact.id,
    });

    return contact;
}

/**
 * Move a Lead to another stage manually
 */
export async function updateLeadStage(data: {
    contactId: string;
    accountManagerId: string;
    newStage: PipelineStage;
}) {
    const { data: contact, error: fetchError } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', data.contactId)
        .single();

    if (fetchError || !contact || !contact.is_lead) {
        throw new Error('Contact not found or is not a lead.');
    }

    const oldStage = contact.pipeline_stage;

    const { error: updateError } = await supabase
        .from('contacts')
        .update({ pipeline_stage: data.newStage })
        .eq('id', data.contactId);

    if (updateError) throw updateError;

    await supabase.from('activity_logs').insert({
        action: `Lead manually moved from ${oldStage} to ${data.newStage}`,
        performed_by: data.accountManagerId,
        contact_id: data.contactId,
    });

    return { ...contact, pipeline_stage: data.newStage };
}
