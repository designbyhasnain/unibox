/**
 * Jarvis Knowledge Miner
 *
 * Scans closed deals' email threads, uses LLM to classify exchanges
 * into categories (pricing, objection, logistics, etc.), and stores
 * them as Q&A pairs for Jarvis to learn from.
 *
 * Usage: npx tsx scripts/mine-jarvis-knowledge.ts
 * Dry run: npx tsx scripts/mine-jarvis-knowledge.ts --dry
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const DRY_RUN = process.argv.includes('--dry');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const CONTACT_LIMIT = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : Infinity;

interface QAPair {
    category: string;
    client_question: string;
    our_reply: string;
    outcome: string;
    contact_region: string | null;
    service_type: string | null;
    price_mentioned: number | null;
    success_score: number;
    source_contact_id: string;
    contact_name: string;
}

function cleanHtml(input: string): string {
    if (!input) return '';
    let text = input
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();

    const cutMarkers = ['On ', 'wrote:', '------', 'From:', 'Sent from', '________'];
    for (const marker of cutMarkers) {
        const idx = text.indexOf(marker);
        if (idx > 30) { text = text.slice(0, idx).trim(); break; }
    }
    return text.slice(0, 800);
}

function guessRegion(email: string): string | null {
    const domain = email.split('@')[1] || '';
    if (domain.endsWith('.uk') || domain.endsWith('.co.uk')) return 'UK';
    if (domain.endsWith('.au') || domain.endsWith('.com.au')) return 'AUS';
    if (domain.endsWith('.de') || domain.endsWith('.fr') || domain.endsWith('.it') ||
        domain.endsWith('.es') || domain.endsWith('.nl') || domain.endsWith('.eu') ||
        domain.endsWith('.pt') || domain.endsWith('.ch')) return 'EU';
    if (domain.endsWith('.ca')) return 'CA';
    if (domain.endsWith('.com') || domain.endsWith('.net')) return 'US';
    return null;
}

async function classifyExchange(
    clientMsg: string,
    ourReply: string,
    contactName: string,
): Promise<{ category: string; service_type: string | null; price_mentioned: number | null } | null> {
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'system',
                        content: `Classify this email exchange between a wedding videographer (client) and a video editing agency (us). Return JSON only:
{
  "category": "PRICING" | "OBJECTION" | "LOGISTICS" | "NEGOTIATION" | "CLOSING" | "ONBOARDING" | "FOLLOW_UP" | "INTRO" | "FEEDBACK" | "OTHER",
  "service_type": null | "cinematic_recap" | "full_length" | "recap_and_full" | "social_clips" | "highlight_reel" | "test_film" | "other",
  "price_mentioned": null | <number if a dollar amount was mentioned>
}
Only output valid JSON, nothing else.`
                    },
                    {
                        role: 'user',
                        content: `Client (${contactName}): ${clientMsg.slice(0, 500)}\n\nOur reply: ${ourReply.slice(0, 500)}`
                    }
                ],
                max_tokens: 100,
                temperature: 0.1,
            }),
        });

        if (!res.ok) return null;
        const data = await res.json();
        const raw = data?.choices?.[0]?.message?.content?.trim();
        if (!raw) return null;

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        const parsed = JSON.parse(jsonMatch[0]);
        // Llama sometimes returns price_mentioned as a nested object (e.g. a price list).
        // Coerce: object → smallest number found; non-finite → null.
        if (parsed && typeof parsed.price_mentioned === 'object' && parsed.price_mentioned !== null) {
            const nums = Object.values(parsed.price_mentioned).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
            parsed.price_mentioned = nums.length > 0 ? Math.min(...nums) : null;
        } else if (typeof parsed?.price_mentioned !== 'number' || !Number.isFinite(parsed.price_mentioned)) {
            parsed.price_mentioned = null;
        }
        return parsed;
    } catch {
        return null;
    }
}

async function processContact(contact: {
    id: string; name: string; email: string;
    pipeline_stage: string; company: string | null;
}): Promise<QAPair[]> {
    const { data: messages } = await supabase
        .from('email_messages')
        .select('direction, body, sent_at')
        .eq('contact_id', contact.id)
        .order('sent_at', { ascending: true })
        .limit(30);

    if (!messages || messages.length < 2) return [];

    const pairs: QAPair[] = [];
    const successScore = contact.pipeline_stage === 'CLOSED' ? 1.0
        : contact.pipeline_stage === 'OFFER_ACCEPTED' ? 0.8
        : contact.pipeline_stage === 'LEAD' ? 0.4 : 0.1;

    const region = guessRegion(contact.email);

    for (let i = 0; i < messages.length - 1; i++) {
        const msg = messages[i]!;
        const next = messages[i + 1]!;

        if (msg.direction === 'RECEIVED' && next.direction === 'SENT') {
            const clientQ = cleanHtml(msg.body);
            const ourReply = cleanHtml(next.body);

            if (clientQ.length < 15 || ourReply.length < 15) continue;

            const classification = await classifyExchange(clientQ, ourReply, contact.name || 'Client');

            if (classification && classification.category !== 'OTHER') {
                pairs.push({
                    category: classification.category,
                    client_question: clientQ.slice(0, 1000),
                    our_reply: ourReply.slice(0, 1000),
                    outcome: contact.pipeline_stage,
                    contact_region: region,
                    service_type: classification.service_type,
                    price_mentioned: classification.price_mentioned,
                    success_score: successScore,
                    source_contact_id: contact.id,
                    contact_name: contact.name || contact.email,
                });
            }

            // Rate limit: 30 req/min on free Groq
            await new Promise(r => setTimeout(r, 2200));
        }
    }

    return pairs;
}

async function main() {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  Jarvis Knowledge Miner                  ║');
    console.log('║  Mining closed deals for Q&A patterns     ║');
    console.log(`║  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}                              ║`);
    console.log('╚══════════════════════════════════════════╝\n');

    // Fetch closed + offer_accepted contacts with enough emails
    const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name, email, pipeline_stage, company')
        .in('pipeline_stage', ['CLOSED', 'OFFER_ACCEPTED'])
        .order('pipeline_stage', { ascending: true });

    if (!contacts || contacts.length === 0) {
        console.log('No closed deals found.');
        return;
    }

    // Filter to contacts with 4+ emails (meaningful conversations)
    const enriched: typeof contacts = [];
    for (const c of contacts) {
        const { count } = await supabase
            .from('email_messages')
            .select('*', { count: 'exact', head: true })
            .eq('contact_id', c.id);
        if (count && count >= 4) enriched.push(c);
    }

    // Dedup: skip contacts already mined (idempotent reruns)
    const skipMined = !process.argv.includes('--force');
    let alreadyMinedIds = new Set<string>();
    if (skipMined) {
        const { data: existing } = await supabase
            .from('jarvis_knowledge')
            .select('source_contact_id')
            .not('source_contact_id', 'is', null);
        alreadyMinedIds = new Set((existing || []).map(r => r.source_contact_id).filter(Boolean));
        const before = enriched.length;
        const filtered = enriched.filter(c => !alreadyMinedIds.has(c.id));
        if (filtered.length < before) {
            console.log(`Skipping ${before - filtered.length} already-mined contacts (use --force to re-mine).`);
        }
        enriched.length = 0;
        enriched.push(...filtered);
    }

    console.log(`Found ${contacts.length} closed/accepted contacts, ${enriched.length} have 4+ emails\n`);

    const toProcess = enriched.slice(0, CONTACT_LIMIT);
    if (CONTACT_LIMIT < enriched.length) {
        console.log(`Limited to first ${CONTACT_LIMIT} for this run.\n`);
    }

    if (!DRY_RUN) {
        // Create table if not exists (using raw SQL via RPC or just try insert)
        console.log('Ensuring jarvis_knowledge table exists...');
        const { error: tableErr } = await supabase.rpc('create_jarvis_knowledge_table');
        if (tableErr) {
            console.log('Table may already exist or RPC not found — will try insert directly');
        }
    }

    let totalPairs = 0;
    let processedContacts = 0;

    for (const contact of toProcess) {
        processedContacts++;
        process.stdout.write(`[${processedContacts}/${toProcess.length}] ${(contact.name || contact.email).padEnd(30)} `);

        const pairs = await processContact(contact);
        totalPairs += pairs.length;

        if (pairs.length === 0) {
            console.log('→ 0 pairs');
            continue;
        }

        console.log(`→ ${pairs.length} pairs [${pairs.map(p => p.category).join(', ')}]`);

        if (!DRY_RUN && pairs.length > 0) {
            const rows = pairs.map(p => ({
                category: p.category,
                client_question: p.client_question,
                our_reply: p.our_reply,
                outcome: p.outcome,
                contact_region: p.contact_region,
                service_type: p.service_type,
                price_mentioned: p.price_mentioned,
                success_score: p.success_score,
                source_contact_id: p.source_contact_id,
            }));

            const { error } = await supabase.from('jarvis_knowledge').insert(rows);
            if (error) {
                console.error('  Insert error:', error.message);
            }
        }
    }

    console.log('\n══════════════════════════════════════');
    console.log(`Processed: ${processedContacts} contacts`);
    console.log(`Extracted: ${totalPairs} Q&A pairs`);
    console.log('══════════════════════════════════════');

    if (DRY_RUN) {
        console.log('\n(Dry run — nothing was saved. Remove --dry to persist.)');
    }
}

main().catch(console.error);
