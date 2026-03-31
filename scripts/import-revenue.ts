import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

function parseDollars(v: string | undefined): number | null {
  if (!v || !v.trim()) return null;
  const cleaned = v.replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parsePaid(v: string | undefined): number | null {
  if (!v || !v.trim()) return null;
  const lower = v.toLowerCase().trim();
  // "paid" text means fully paid — we'll store 1 as a flag
  if (lower === 'paid') return 1;
  if (lower === 'unpaid' || lower === 'no') return 0;
  // Try parsing as number/dollar
  return parseDollars(v);
}

async function main() {
  const csvPath = path.resolve(__dirname, 'Edit_revenue_for_web_app.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found:', csvPath);
    process.exit(1);
  }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = result.data as Record<string, string>[];

  console.log(`Read ${rows.length} rows from CSV`);

  // Fetch ALL project names from DB for matching (paginate past 1000 limit)
  let allProjects: { id: string; name: string }[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data: page, error: pageErr } = await supabase
      .from('edit_projects')
      .select('id, name')
      .range(from, from + pageSize - 1);
    if (pageErr) { console.error('Failed to fetch projects:', pageErr); process.exit(1); }
    if (!page || page.length === 0) break;
    allProjects = allProjects.concat(page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  const projects = allProjects;

  console.log(`Found ${projects.length} projects in DB`);

  // Build a map: lowercase trimmed name → project id
  // If multiple projects have same name, keep the first one
  const nameToId = new Map<string, string>();
  for (const p of projects) {
    const key = (p.name || '').toLowerCase().trim();
    if (key && !nameToId.has(key)) {
      nameToId.set(key, p.id);
    }
  }

  let updated = 0;
  let skipped = 0;
  const notFound: Record<string, string>[] = [];

  for (const row of rows) {
    const taskName = (row['Task name'] || '').trim();
    if (!taskName) { skipped++; continue; }

    const totalAmount = parseDollars(row['Total Amount']);
    const paid = parsePaid(row['Paid']);
    const received1 = parseDollars(row['Received 1']);

    // Skip rows with no revenue data at all
    if (totalAmount === null && paid === null && received1 === null) {
      skipped++;
      continue;
    }

    const key = taskName.toLowerCase().trim();
    const projectId = nameToId.get(key);

    if (!projectId) {
      notFound.push(row);
      continue;
    }

    const updateData: Record<string, number | null> = {};
    if (totalAmount !== null) updateData.total_amount = totalAmount;
    if (paid !== null) updateData.paid = paid;
    if (received1 !== null) updateData.received_1 = received1;

    const { error: updateErr } = await supabase
      .from('edit_projects')
      .update(updateData)
      .eq('id', projectId);

    if (updateErr) {
      console.error(`Failed to update "${taskName}":`, updateErr.message);
    } else {
      updated++;
    }
  }

  console.log(`\n=== RESULT ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (empty): ${skipped}`);
  console.log(`Not found: ${notFound.length}`);

  // Write not-found CSV
  if (notFound.length > 0) {
    const notFoundCsv = Papa.unparse(notFound, {
      columns: ['Task name', 'Total Amount', 'Paid', 'Received 1'],
    });
    const outPath = path.resolve(__dirname, 'not-found-projects.csv');
    fs.writeFileSync(outPath, notFoundCsv, 'utf-8');
    console.log(`\nNot-found rows written to: ${outPath}`);
  }
}

main().catch(console.error);
