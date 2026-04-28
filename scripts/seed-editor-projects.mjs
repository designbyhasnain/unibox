import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const userId = process.argv[2];
if (!userId) { console.error('Usage: node scripts/seed-editor-projects.mjs <userId>'); process.exit(1); }

const today = new Date();
const day = (offset) => new Date(today.getTime() + offset * 86_400_000).toISOString();

const rows = [
    { name: 'Lake Como — 3 day wedding film',     client_name: 'Cameron Wolfe', progress: 'IN_PROGRESS', priority: 'HIGH',   formula_percent: 42, date: day(-7),  due_date: day(3),   data_checked: true,  hard_drive: 'HDD-04' },
    { name: 'Park × John — highlight + teaser',   client_name: 'Hannah Park',   progress: 'IN_REVISION', priority: 'MEDIUM', formula_percent: 88, date: day(-14), due_date: day(5),   data_checked: true,  hard_drive: 'HDD-02' },
    { name: 'Paper Anchor — brand reel',          client_name: 'Noor Hassan',   progress: 'DOWNLOADING', priority: 'LOW',    formula_percent: 96, date: day(-21), due_date: day(4),   data_checked: true,  hard_drive: 'HDD-08' },
    { name: 'Sardinia wedding — preview cut',     client_name: 'Sarah Lee',     progress: 'IN_PROGRESS', priority: 'MEDIUM', formula_percent: 18, date: day(-3),  due_date: day(10),  data_checked: false, hard_drive: null     },
    { name: 'Brand reel — Q2',                    client_name: 'Tim Yoshida',   progress: 'ON_HOLD',     priority: 'LOW',    formula_percent: 0,  date: day(-30), due_date: day(-2),  data_checked: false, hard_drive: 'HDD-01' },
];

// Set editor_id (the canonical scoping field) AND user_id (legacy/owner) to the
// same target so the seed shows up in the editor's view immediately.
const payload = rows.map(r => ({ ...r, user_id: userId, editor_id: userId, working_hours: 0, actual_hours: 0, formula_percent: r.formula_percent, is_checked: false }));
const { data, error } = await sb.from('edit_projects').insert(payload).select('id, name, progress');
console.log(error ?? data);
