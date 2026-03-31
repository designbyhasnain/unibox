import type { ProjectProgress, ProjectPriority, AMReview } from '@prisma/client';

type RawRow = Record<string, string>;

const PROGRESS_MAP: Record<string, ProjectProgress> = {
  'on hold':        'ON_HOLD',
  'in progress':    'IN_PROGRESS',
  'downloading':    'DOWNLOADING',
  'downloaded':     'DOWNLOADED',
  'not downloaded': 'ON_HOLD',
  'in revision':    'IN_REVISION',
  'approved':       'APPROVED',
  'done':           'DONE',
  'delivered':      'DONE',
  'success':        'DONE',
  'first done':     'DONE',
  'archived':       'DONE',
  'reviewed':       'APPROVED',
  'lost':           'ON_HOLD',
  'transfered':     'ON_HOLD',
  'unsatifactory':  'IN_REVISION',
};

const PRIORITY_MAP: Record<string, ProjectPriority> = {
  'high':   'HIGH',
  'medium': 'MEDIUM',
  'low':    'LOW',
};

const AM_REVIEW_MAP: Record<string, AMReview> = {
  'no issue':  'NO_ISSUE',
  'has issue': 'HAS_ISSUE',
  'issue':     'HAS_ISSUE',
};

function findCol(row: RawRow, ...candidates: string[]): string | undefined {
  for (const c of candidates) {
    const lower = c.toLowerCase().trim();
    for (const key of Object.keys(row)) {
      // Trim both key and candidate — Notion exports headers with trailing spaces
      if (key.toLowerCase().trim() === lower) return row[key];
    }
  }
  return undefined;
}

function parseFloat_(v: string | undefined): number | null {
  if (!v) return null;
  // Handle "0 hrs", "16 hrs", percentages "0%", currency "$500"
  const cleaned = v.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseDate_(v: string | undefined): Date | null {
  if (!v || !v.trim()) return null;
  const trimmed = v.trim();
  // Skip Notion relation URLs
  if (trimmed.startsWith('http') || trimmed.includes('notion.so')) return null;
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

function parseBool(v: string | undefined): boolean {
  if (!v) return false;
  return ['true', 'yes', '1', 'checked'].includes(v.toLowerCase().trim());
}

function parseTags(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(',').map(t => t.trim()).filter(Boolean);
}

// Clean Notion relation URLs from text values: "Joyful (https://...)" → "Joyful"
function cleanNotionRef(v: string | undefined): string | null {
  if (!v) return null;
  const cleaned = v.replace(/\s*\(https?:\/\/[^)]*\)/g, '').trim();
  return cleaned || null;
}

export function mapCSVRowToProject(row: RawRow, userId: string) {
  const name = findCol(row, 'Name', 'name', 'Project Name', 'project_name');
  if (!name?.trim()) return null;

  const progressRaw = (findCol(row, 'progress', 'Progress', 'Status') || '').toLowerCase().trim();

  // Parse Brief field — Notion stores structured text like:
  // "Due Date : 27 march\nLength / Runtime : 8 minutes\nSong Preferences : ..."
  const briefRaw = findCol(row, 'Brief', 'Brief ') || '';
  const extractBrief = (pattern: RegExp): string | null => {
    const m = briefRaw.match(pattern);
    return m?.[1]?.trim() || null;
  };
  const briefDueDate    = extractBrief(/due\s*date\s*:\s*(.+)/i);
  const briefLength     = extractBrief(/length\s*\/?\s*runtime\s*:\s*(.+)/i) || cleanNotionRef(findCol(row, 'Length', 'Length ')) || null;
  const songPreferences = extractBrief(/song\s*preferences?\s*:\s*(.+)/i);
  const software        = extractBrief(/software\s*:\s*(.+)/i) || findCol(row, 'Software', 'software') || null;
  const briefNotes      = extractBrief(/notes?\s*:\s*(.+)/i);
  // If no structured fields found, store the whole brief as notes
  const notes = briefNotes || (briefRaw && !briefDueDate && !briefLength ? briefRaw : null);

  return {
    name: name.trim(),
    user_id: userId,
    date:                  parseDate_(findCol(row, 'Date', 'date')),
    client_name:           cleanNotionRef(findCol(row, 'Client name', 'Client Name', 'client_name')),
    progress:              PROGRESS_MAP[progressRaw] || 'ON_HOLD' as ProjectProgress,
    initial_project_value: parseFloat_(findCol(row, 'Initial Project Value', 'Initial Project V.', 'initial_project_value')),
    due_date:              parseDate_(findCol(row, 'Due', 'Due Date', 'due_date')),
    start_date:            parseDate_(findCol(row, 'start date', 'Start Date', 'start_date')),
    approved_date:         parseDate_(findCol(row, 'approved date', 'Approved Date', 'approved_date')),
    completion_date:       parseDate_(findCol(row, 'Completion Date', 'completion_date')),
    tags:                  parseTags(findCol(row, 'Tags', 'tags')),
    editor:                findCol(row, 'Editor', 'editor') || null,
    team:                  findCol(row, 'TEAM', 'Team', 'team') || null,
    size_in_gbs:           findCol(row, 'Size in Gbs', 'Size in GBs', 'size_in_gbs') || null,
    hard_drive:            findCol(row, 'Hard Drive', 'hard_drive') || null,
    priority:              PRIORITY_MAP[(findCol(row, 'Priority', 'priority') || '').toLowerCase().trim()] || null,
    file_needed:           findCol(row, 'File needed', 'File Needed', 'file_needed') || null,
    reviewed_by:           findCol(row, 'Reviewed By', 'reviewed_by') || null,
    rated_by_editor:       parseFloat_(findCol(row, 'Rated by Editor', 'rated_by_editor')),
    rated_by_ch:           parseFloat_(findCol(row, 'Rated by CH', 'rated_by_ch')),
    reviewer_value:        parseFloat_(findCol(row, 'Reviwer Value', 'Reviewer Value', 'reviewer_value')),
    actual_hours:          parseFloat_(findCol(row, 'Actual Hours', 'actual_hours')) ?? 0,
    working_hours:         parseFloat_(findCol(row, 'Working hours', 'working_hours')) ?? 0,
    am_review:             AM_REVIEW_MAP[(findCol(row, 'AM/Review', 'am_review') || '').toLowerCase().trim()] || 'NO_ISSUE' as AMReview,
    account_manager:       findCol(row, 'Account Manager', 'account_manager') || null,
    raw_data_url:          findCol(row, 'Raw Data', 'raw_data_url') || null,
    notes,
    data_checked:          parseBool(findCol(row, 'Data checked', 'data_checked')),
    deduction_on_del:      findCol(row, 'deduction on delay', 'deduction on del.', 'deduction_on_del') || 'no deduction/date',
    reviewer_feedback:     findCol(row, 'Reviewer Feedback', 'reviewer_feedback') || null,
    total_project_value:   parseFloat_(findCol(row, 'Total Project Value', 'total_project_value')),
    software,
    brief_due_date:        briefDueDate,
    brief_length:          briefLength,
    song_preferences:      songPreferences,
  };
}
