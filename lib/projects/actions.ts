'use server';

import { supabase } from '../../src/lib/supabase';
import { ensureAuthenticated } from '../../src/lib/safe-action';
import type { ProjectFilters, CSVImportResult } from './types';
import { mapCSVRowToProject } from './csv-parser';

async function getFreshRole(userId: string): Promise<string> {
  const { data } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
  return data?.role ?? 'SALES';
}

function maskProjectForEditor(p: Record<string, unknown>): Record<string, unknown> {
  const pseudonym = `Project – ${(p.id as string).slice(0, 6)}`;
  return {
    ...p,
    // Mask both camelCase (transformed) and snake_case (raw DB) keys
    clientName: pseudonym,
    client_name: pseudonym,
    clientEmail: null,
    client_email: null,
    initialProjectValue: null,
    initial_project_value: null,
    totalProjectValue: null,
    total_project_value: null,
    totalAmount: null,
    total_amount: null,
    paid: null,
    received1: null,
    received_1: null,
    reviewerValue: null,
    reviewer_value: null,
  };
}

// ─── Get Projects (paginated) ────────────────────────────────────────────────

export async function getEditProjects(filters?: ProjectFilters, page: number = 1, limit: number = 50) {
  const { userId } = await ensureAuthenticated();
  const role = await getFreshRole(userId);

  const isAdminRole = role === 'ADMIN' || role === 'ACCOUNT_MANAGER';
  const isEditorRole = role === 'VIDEO_EDITOR';
  const isSalesRole = role === 'SALES';

  const sortBy = filters?.sortBy || 'createdAt';
  const sortOrder = filters?.sortOrder === 'asc';

  const sortMap: Record<string, string> = {
    name: 'name', date: 'date', clientName: 'client_name', progress: 'progress',
    dueDate: 'due_date', startDate: 'start_date', priority: 'priority',
    editor: 'editor', accountManager: 'account_manager',
    initialProjectValue: 'initial_project_value', totalProjectValue: 'total_project_value',
    createdAt: 'created_at', actualHours: 'actual_hours', team: 'team',
  };
  const col = sortMap[sortBy] || 'created_at';

  const clampedLimit = Math.min(Math.max(limit, 10), 200);
  const from = (page - 1) * clampedLimit;

  let query = supabase
    .from('edit_projects')
    .select('*, comments:project_comments(id), assignedEditor:users!edit_projects_editor_id_fkey(id, name)', { count: 'exact' });

  // Strict identity scoping for non-admin roles
  if (isEditorRole) {
    // Editors only see projects where they are the assigned editor.
    query = query.eq('editor_id', userId);
  } else if (!isAdminRole) {
    // Sales etc. — keep legacy user_id ownership scope.
    query = query.eq('user_id', userId);
  }

  if (filters?.progress) query = query.eq('progress', filters.progress);
  if (filters?.editor) query = query.eq('editor', filters.editor);
  if (filters?.accountManager) query = query.eq('account_manager', filters.accountManager);
  if (filters?.priority) query = query.eq('priority', filters.priority);
  if (filters?.tag) query = query.contains('tags', [filters.tag]);
  if (filters?.search) {
    const s = filters.search.replace(/[%_\\]/g, '\\$&');
    query = query.or(`name.ilike.%${s}%,client_name.ilike.%${s}%`);
  }

  query = query.order(col, { ascending: sortOrder, nullsFirst: false });

  const { data, error, count } = await query.range(from, from + clampedLimit - 1);

  if (error) {
    console.error('[getEditProjects]', error);
    return { success: false as const, error: error.message };
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / clampedLimit);

  // Transform: snake_case → camelCase + count comments
  const isEditor = role === 'VIDEO_EDITOR';
  const projects = (data || []).map((p: Record<string, unknown>) => {
    const comments = Array.isArray(p.comments) ? p.comments : [];
    const editor = Array.isArray(p.assignedEditor) ? p.assignedEditor[0] : p.assignedEditor;
    const row: Record<string, unknown> = {
      id: p.id, date: p.date, clientName: p.client_name, clientEmail: p.client_email, name: p.name,
      progress: p.progress, isChecked: p.is_checked,
      initialProjectValue: p.initial_project_value, dueDate: p.due_date,
      startDate: p.start_date, approvedDate: p.approved_date,
      completionDate: p.completion_date, tags: p.tags, editor: p.editor,
      accountManager: p.account_manager, reviewedBy: p.reviewed_by,
      team: p.team, sizeInGbs: p.size_in_gbs, hardDrive: p.hard_drive,
      rawDataUrl: p.raw_data_url, fileNeeded: p.file_needed,
      dataChecked: p.data_checked, priority: p.priority,
      briefDueDate: p.brief_due_date, briefLength: p.brief_length,
      songPreferences: p.song_preferences, software: p.software,
      notes: p.notes, ratedByEditor: p.rated_by_editor,
      ratedByCH: p.rated_by_ch, reviewerValue: p.reviewer_value,
      actualHours: p.actual_hours ?? 0, workingHours: p.working_hours ?? 0,
      reviewerFeedback: p.reviewer_feedback, totalProjectValue: p.total_project_value,
      formulaPercent: p.formula_percent ?? 0, deductionOnDel: p.deduction_on_del,
      amReview: p.am_review,
      totalAmount: p.total_amount, paid: p.paid, received1: p.received_1,
      userId: p.user_id,
      editorId: p.editor_id ?? null,
      assignedEditorName: (editor && (editor as Record<string, unknown>).name) || null,
      createdAt: p.created_at, updatedAt: p.updated_at,
      _count: { comments: comments.length },
    };
    return isEditor ? maskProjectForEditor(row) : row;
  });

  return { success: true as const, data: projects, total, page, limit: clampedLimit, totalPages };
}

// ─── Create Project ──────────────────────────────────────────────────────────

export async function createEditProject(data: Record<string, unknown>) {
  const { userId } = await ensureAuthenticated();

  // Default the project date to today when the caller doesn't provide one —
  // matches the Notion-style "+ New" UX where the row appears with today
  // already filled in (instead of an empty Date cell that needs editing).
  const today = new Date().toISOString();

  // Auto-fill account_manager for SALES users when not explicitly provided.
  // edit_projects.account_manager is free-text — we use the user's display
  // name. Admins keep the column empty by default since they typically
  // create on behalf of someone else. Caller can still override by passing
  // either snake_case `account_manager` or camelCase `accountManager`.
  const callerProvidedAm =
    (data as { account_manager?: unknown }).account_manager
    ?? (data as { accountManager?: unknown }).accountManager;
  let amDefault: string | undefined;
  if (!callerProvidedAm) {
    const { data: me } = await supabase
      .from('users')
      .select('name, role')
      .eq('id', userId)
      .single();
    if (me && me.role === 'SALES' && me.name) amDefault = me.name as string;
  }

  const seeded: Record<string, unknown> = {
    ...data,
    user_id: userId,
    name: data.name || 'Untitled',
    date: data.date ?? today,
  };
  if (amDefault && !seeded.account_manager) seeded.account_manager = amDefault;

  const { data: project, error } = await supabase
    .from('edit_projects')
    .insert(seeded)
    .select()
    .single();

  if (error) {
    console.error('[createEditProject]', error);
    return { success: false as const, error: error.message };
  }

  return { success: true as const, data: project };
}

// ─── Update Project ──────────────────────────────────────────────────────────

export async function updateEditProject(id: string, updates: Record<string, unknown>) {
  const { userId } = await ensureAuthenticated();
  const role = await getFreshRole(userId);
  const isAdminRole = role === 'ADMIN' || role === 'ACCOUNT_MANAGER';

  // Map camelCase keys to snake_case DB columns
  const snakeMap: Record<string, string> = {
    clientName: 'client_name', isChecked: 'is_checked',
    initialProjectValue: 'initial_project_value', dueDate: 'due_date',
    startDate: 'start_date', approvedDate: 'approved_date',
    completionDate: 'completion_date', accountManager: 'account_manager',
    reviewedBy: 'reviewed_by', sizeInGbs: 'size_in_gbs',
    hardDrive: 'hard_drive', rawDataUrl: 'raw_data_url',
    fileNeeded: 'file_needed', dataChecked: 'data_checked',
    briefDueDate: 'brief_due_date', briefLength: 'brief_length',
    songPreferences: 'song_preferences', ratedByEditor: 'rated_by_editor',
    editorId: 'editor_id',
    ratedByCH: 'rated_by_ch', reviewerValue: 'reviewer_value',
    actualHours: 'actual_hours', workingHours: 'working_hours',
    reviewerFeedback: 'reviewer_feedback', totalProjectValue: 'total_project_value',
    formulaPercent: 'formula_percent', deductionOnDel: 'deduction_on_del',
    amReview: 'am_review',
    totalAmount: 'total_amount', paid: 'paid', received1: 'received_1',
  };

  const dbUpdates: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(updates)) {
    const dbKey = snakeMap[key] || key;
    dbUpdates[dbKey] = val;
  }

  let updQuery = supabase
    .from('edit_projects')
    .update(dbUpdates)
    .eq('id', id);
  if (!isAdminRole) updQuery = updQuery.eq('user_id', userId);
  const { data: project, error } = await updQuery.select().maybeSingle();

  if (error) {
    console.error('[updateEditProject]', error);
    return { success: false as const, error: error.message };
  }
  if (!project) {
    return { success: false as const, error: 'Project not found or access denied' };
  }

  return { success: true as const, data: project };
}

// ─── Delete Project ──────────────────────────────────────────────────────────

export async function deleteEditProject(id: string) {
  const { userId } = await ensureAuthenticated();
  const role = await getFreshRole(userId);
  const isAdminRole = role === 'ADMIN' || role === 'ACCOUNT_MANAGER';

  let delQuery = supabase.from('edit_projects').delete().eq('id', id);
  if (!isAdminRole) delQuery = delQuery.eq('user_id', userId);
  const { error } = await delQuery;

  if (error) {
    console.error('[deleteEditProject]', error);
    return { success: false as const, error: error.message };
  }

  return { success: true as const };
}

// ─── Delete Multiple Projects ────────────────────────────────────────────────

export async function deleteMultipleEditProjects(ids: string[]) {
  const { userId } = await ensureAuthenticated();
  const role = await getFreshRole(userId);
  const isAdminRole = role === 'ADMIN' || role === 'ACCOUNT_MANAGER';

  let delMultiQuery = supabase.from('edit_projects').delete().in('id', ids);
  if (!isAdminRole) delMultiQuery = delMultiQuery.eq('user_id', userId);
  const { error } = await delMultiQuery;

  if (error) {
    console.error('[deleteMultipleEditProjects]', error);
    return { success: false as const, error: error.message };
  }

  return { success: true as const };
}

// ─── Duplicate Project ───────────────────────────────────────────────────────

export async function duplicateEditProject(id: string) {
  const { userId } = await ensureAuthenticated();
  const role = await getFreshRole(userId);
  const isAdminRole = role === 'ADMIN' || role === 'ACCOUNT_MANAGER';

  let origQuery = supabase.from('edit_projects').select('*').eq('id', id);
  if (!isAdminRole) origQuery = origQuery.eq('user_id', userId);
  const { data: original, error: fetchErr } = await origQuery.maybeSingle();

  if (fetchErr || !original) {
    return { success: false as const, error: 'Project not found' };
  }

  const { id: _id, created_at: _ca, updated_at: _ua, ...fields } = original;
  const { data: dup, error } = await supabase
    .from('edit_projects')
    .insert({ ...fields, name: original.name + ' (copy)' })
    .select()
    .single();

  if (error) {
    console.error('[duplicateEditProject]', error);
    return { success: false as const, error: error.message };
  }

  return { success: true as const, data: dup };
}

// ─── Get Project By ID ───────────────────────────────────────────────────────

export async function getEditProjectById(id: string) {
  const { userId } = await ensureAuthenticated();
  const role = await getFreshRole(userId);

  const isAdminRole = role === 'ADMIN' || role === 'ACCOUNT_MANAGER';

  let byIdQuery = supabase
    .from('edit_projects')
    .select('*, comments:project_comments(id, content, author_name, author_id, image_url, project_id, created_at)')
    .eq('id', id);
  if (!isAdminRole) byIdQuery = byIdQuery.eq('user_id', userId);
  const { data: project, error } = await byIdQuery.maybeSingle();

  if (error) {
    console.error('[getEditProjectById]', error);
    return { success: false as const, error: error.message };
  }
  if (!project) {
    return { success: false as const, error: 'Project not found' };
  }

  const masked = role === 'VIDEO_EDITOR' ? maskProjectForEditor(project as Record<string, unknown>) : project;
  return { success: true as const, data: masked };
}

// ─── Add Comment ─────────────────────────────────────────────────────────────

export async function addProjectComment(projectId: string, content: string) {
  const { userId } = await ensureAuthenticated();
  const role = await getFreshRole(userId);
  const isAdminRole = role === 'ADMIN' || role === 'ACCOUNT_MANAGER';

  // Verify access (admins can comment on any project; others only on their own)
  let projCheckQuery = supabase.from('edit_projects').select('id').eq('id', projectId);
  if (!isAdminRole) projCheckQuery = projCheckQuery.eq('user_id', userId);
  const { data: project } = await projCheckQuery.maybeSingle();

  if (!project) return { success: false as const, error: 'Project not found' };

  // Get user name
  const { data: user } = await supabase
    .from('users')
    .select('name, email')
    .eq('id', userId)
    .single();

  const authorName = user?.name || user?.email || 'Unknown';

  const { data: comment, error } = await supabase
    .from('project_comments')
    .insert({
      project_id: projectId,
      content,
      author_name: authorName,
      author_id: userId,
    })
    .select()
    .single();

  if (error) {
    console.error('[addProjectComment]', error);
    return { success: false as const, error: error.message };
  }

  return { success: true as const, data: comment };
}

// ─── Delete Comment ──────────────────────────────────────────────────────────

export async function deleteProjectComment(commentId: string) {
  const { userId } = await ensureAuthenticated();
  const role = await getFreshRole(userId);
  const isAdminRole = role === 'ADMIN' || role === 'ACCOUNT_MANAGER';

  // Verify comment belongs to user's project (admins bypass ownership check)
  const { data: comment } = await supabase
    .from('project_comments')
    .select('id, project:edit_projects!inner(user_id)')
    .eq('id', commentId)
    .maybeSingle();

  if (!comment) return { success: false as const, error: 'Comment not found' };

  if (!isAdminRole) {
    const proj = comment.project as unknown as { user_id: string };
    if (proj.user_id !== userId) {
      return { success: false as const, error: 'Unauthorized' };
    }
  }

  const { error } = await supabase
    .from('project_comments')
    .delete()
    .eq('id', commentId);

  if (error) {
    console.error('[deleteProjectComment]', error);
    return { success: false as const, error: error.message };
  }

  return { success: true as const };
}

// ─── Import CSV (upsert — skip duplicates) ───────────────────────────────────

export async function importEditProjectsFromCSV(
  rows: Record<string, string>[]
): Promise<CSVImportResult> {
  const { userId } = await ensureAuthenticated();

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  // Pre-fetch all existing name+clientName combos for this user (one query)
  const { data: existing } = await supabase
    .from('edit_projects')
    .select('name, client_name')
    .eq('user_id', userId);

  const existingSet = new Set(
    (existing || []).map(e => `${(e.name || '').toLowerCase().trim()}::${(e.client_name || '').toLowerCase().trim()}`)
  );

  // Map all rows, filtering out duplicates
  const toInsert: NonNullable<ReturnType<typeof mapCSVRowToProject>>[] = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];
      if (!row) { failed++; continue; }
      const mapped = mapCSVRowToProject(row, userId);
      if (!mapped) { failed++; continue; }

      const key = `${mapped.name.toLowerCase().trim()}::${(mapped.client_name || '').toLowerCase().trim()}`;
      if (existingSet.has(key)) {
        skipped++;
        continue;
      }

      // Also deduplicate within the CSV itself
      existingSet.add(key);
      toInsert.push(mapped);
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  // Batch insert in chunks of 100
  const batchSize = 100;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize);

    const { error } = await supabase
      .from('edit_projects')
      .insert(batch);

    if (error) {
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      failed += batch.length;
    } else {
      imported += batch.length;
    }
  }

  return { imported, failed: failed + skipped, errors, skipped };
}
