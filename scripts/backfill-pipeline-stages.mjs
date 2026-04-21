/**
 * Backfill Pipeline Stages
 *
 * Scans all contacts and fixes their pipeline_stage based on actual email data:
 * - Has projects → CLOSED
 * - Has replies + we sent → LEAD
 * - We sent, no reply → CONTACTED
 * - 2+ opens, no reply → WARM_LEAD
 * - Acceptance keywords in latest reply → OFFER_ACCEPTED
 *
 * Run: node scripts/backfill-pipeline-stages.mjs
 * Dry run: node scripts/backfill-pipeline-stages.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Keyword detection (inline version of stageDetectionService for the script)
function kw(word) { return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'); }

const ACCEPTANCE_HIGH = [
    kw("let's do it"), kw("let's proceed"), kw("let's lock it in"), kw("go ahead"),
    kw("send invoice"), kw("send payment"), kw("book it"), kw("ready to start"),
    kw("let's get started"), kw("move forward"), kw("here are the files"),
    kw("uploaded the footage"), kw("shared the drive"), kw("payment sent"),
    kw("I'm in"), kw("confirmed"), kw("approved"),
];

const ACCEPTANCE_MEDIUM = [
    kw("sounds great"), kw("sounds good"), kw("agreed"), kw("deal"),
    kw("let's do this"), kw("accepted"), kw("yes"), kw("perfect"),
    kw("works for me"), kw("count me in"),
];

function stripHtml(body) {
    return (body || '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ').trim().slice(0, 2000);
}

function checkAcceptance(body) {
    const text = stripHtml(body);
    // Cut at quoted text
    const cutMarkers = ['On ', 'wrote:', '------', 'From:', 'Sent from'];
    let clean = text;
    for (const m of cutMarkers) {
        const idx = clean.indexOf(m);
        if (idx > 20) { clean = clean.slice(0, idx); break; }
    }

    const highMatch = ACCEPTANCE_HIGH.some(r => r.test(clean));
    if (highMatch) return 'HIGH';
    const medCount = ACCEPTANCE_MEDIUM.filter(r => r.test(clean)).length;
    if (medCount >= 2) return 'MEDIUM';
    return null;
}

console.log(DRY_RUN ? '=== DRY RUN MODE ===' : '=== LIVE MODE — changes will be applied ===');
console.log('');

// Fetch all contacts
let allContacts = [];
let offset = 0;
const PAGE = 1000;
while (true) {
    const { data } = await supabase
        .from('contacts')
        .select('id, name, email, pipeline_stage, contact_type, open_count')
        .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    allContacts.push(...data);
    offset += PAGE;
    if (data.length < PAGE) break;
}
console.log(`Loaded ${allContacts.length} contacts\n`);

const stats = { total: allContacts.length, checked: 0, promoted: 0, skipped: 0, errors: 0 };
const changes = { toClosed: 0, toOfferAccepted: 0, toLead: 0, toContacted: 0, toWarmLead: 0 };
const promotions = [];

// Process in batches
for (let i = 0; i < allContacts.length; i += 50) {
    const batch = allContacts.slice(i, i + 50);
    const contactIds = batch.map(c => c.id);

    // Batch-fetch email data for these contacts
    const [sentRes, receivedRes, projectRes] = await Promise.all([
        supabase.from('email_messages').select('contact_id').in('contact_id', contactIds).eq('direction', 'SENT').limit(5000),
        supabase.from('email_messages').select('contact_id, body').in('contact_id', contactIds).eq('direction', 'RECEIVED').order('sent_at', { ascending: false }).limit(5000),
        supabase.from('projects').select('contact_id').in('contact_id', contactIds).limit(5000),
    ]);

    const sentByContact = new Set((sentRes.data || []).map(e => e.contact_id));
    const receivedByContact = {};
    for (const e of (receivedRes.data || [])) {
        if (!receivedByContact[e.contact_id]) receivedByContact[e.contact_id] = e.body;
    }
    const projectByContact = new Set((projectRes.data || []).map(p => p.contact_id));

    for (const contact of batch) {
        stats.checked++;
        const current = contact.pipeline_stage;
        const hasSent = sentByContact.has(contact.id);
        const hasReceived = !!receivedByContact[contact.id];
        const hasProject = projectByContact.has(contact.id);
        const openCount = contact.open_count || 0;

        let newStage = null;
        let reason = '';

        // Rule 1: Has projects → CLOSED
        if (hasProject && current !== 'CLOSED') {
            newStage = 'CLOSED';
            reason = 'Has linked projects';
            changes.toClosed++;
        }
        // Rule 2: Has received + sent → LEAD (check acceptance first)
        else if (hasReceived && hasSent && ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD'].includes(current)) {
            const latestBody = receivedByContact[contact.id];
            const acceptance = latestBody ? checkAcceptance(latestBody) : null;
            if (acceptance === 'HIGH') {
                newStage = 'OFFER_ACCEPTED';
                reason = 'Acceptance keywords detected in reply (HIGH)';
                changes.toOfferAccepted++;
            } else {
                newStage = 'LEAD';
                reason = 'Contact replied to our outreach';
                changes.toLead++;
            }
        }
        // Rule 3: We sent, no reply → CONTACTED
        else if (hasSent && !hasReceived && current === 'COLD_LEAD') {
            newStage = 'CONTACTED';
            reason = 'We emailed them, no reply yet';
            changes.toContacted++;
        }
        // Rule 4: 2+ opens, no reply → WARM_LEAD
        else if (openCount >= 2 && !hasReceived && ['COLD_LEAD', 'CONTACTED'].includes(current)) {
            newStage = 'WARM_LEAD';
            reason = `${openCount} opens, no reply`;
            changes.toWarmLead++;
        }

        if (newStage) {
            stats.promoted++;
            promotions.push({ name: contact.name, email: contact.email, from: current, to: newStage, reason });

            if (!DRY_RUN) {
                const { error } = await supabase.from('contacts').update({ pipeline_stage: newStage }).eq('id', contact.id);
                if (error) {
                    stats.errors++;
                    console.error(`  Error updating ${contact.email}:`, error.message);
                }

                // Also update email messages for this contact
                await supabase
                    .from('email_messages')
                    .update({ pipeline_stage: newStage })
                    .eq('contact_id', contact.id);
            }
        } else {
            stats.skipped++;
        }
    }

    // Progress
    if (i % 500 === 0 && i > 0) {
        console.log(`  Progress: ${i}/${allContacts.length} contacts processed...`);
    }
}

// Report
console.log('\n========================================');
console.log(DRY_RUN ? '  BACKFILL RESULTS (DRY RUN)' : '  BACKFILL RESULTS (APPLIED)');
console.log('========================================\n');
console.log(`Total contacts: ${stats.total}`);
console.log(`Checked: ${stats.checked}`);
console.log(`Promoted: ${stats.promoted}`);
console.log(`Skipped (already correct): ${stats.skipped}`);
console.log(`Errors: ${stats.errors}`);
console.log('');
console.log('Stage changes:');
console.log(`  → CLOSED: ${changes.toClosed} (has projects)`);
console.log(`  → OFFER_ACCEPTED: ${changes.toOfferAccepted} (acceptance keywords)`);
console.log(`  → LEAD: ${changes.toLead} (replied to outreach)`);
console.log(`  → CONTACTED: ${changes.toContacted} (we emailed, no reply)`);
console.log(`  → WARM_LEAD: ${changes.toWarmLead} (2+ opens)`);
console.log('');

// Show sample promotions
console.log('Sample promotions:');
promotions.slice(0, 20).forEach(p => {
    console.log(`  ${p.name || '?'} <${p.email}>: ${p.from} → ${p.to} (${p.reason})`);
});
if (promotions.length > 20) console.log(`  ... and ${promotions.length - 20} more`);
