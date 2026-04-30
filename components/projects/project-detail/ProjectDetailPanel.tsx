'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { PROGRESS_CONFIG, PRIORITY_CONFIG, AM_REVIEW_CONFIG, PAID_CONFIG } from '../../../lib/projects/constants';
import { getEditProjectById, addProjectComment, deleteProjectComment } from '../../../lib/projects/actions';
import EditorAssignmentCell from '../cells/EditorAssignmentCell';

type Props = {
  projectId: string;
  onClose: () => void;
  onUpdate: (field: string, value: unknown) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  initialData?: Record<string, unknown>;
};

function fmtDate(val: unknown): string {
  if (!val) return '';
  try { return format(new Date(val as string), 'MMMM d, yyyy'); } catch { return ''; }
}

function isUrl(val: unknown): boolean {
  return typeof val === 'string' && /^https?:\/\//i.test(val);
}

const Empty = () => <span className="ep-detail-empty">Empty</span>;

export default function ProjectDetailPanel({ projectId, onClose, onUpdate, onDuplicate, onDelete, initialData }: Props) {
  const [project, setProject] = useState<Record<string, unknown> | null>(initialData || null);
  const [comments, setComments] = useState<Record<string, unknown>[]>([]);
  const [commentText, setCommentText] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const debounceRef = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setProject(initialData || null);

    getEditProjectById(projectId)
      .then(res => {
        if (cancelled) return;
        if (res.success && res.data) {
          setProject(res.data as Record<string, unknown>);
          setComments(Array.isArray((res.data as Record<string, unknown>).comments) ? (res.data as Record<string, unknown>).comments as Record<string, unknown>[] : []);
        } else {
          setLoadError(('error' in res && res.error) || 'Project not found');
        }
      })
      .catch(err => {
        if (cancelled) return;
        console.error('[ProjectDetailPanel] Load failed', err);
        setLoadError(err instanceof Error ? err.message : 'Failed to load project');
      });

    return () => { cancelled = true; };
  }, [projectId, initialData]);

  const debouncedUpdate = useCallback((field: string, value: unknown) => {
    setProject(prev => prev ? { ...prev, [field]: value } : prev);
    if (debounceRef.current[field]) clearTimeout(debounceRef.current[field]);
    debounceRef.current[field] = setTimeout(() => onUpdate(field, value), 500);
  }, [onUpdate]);

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    const res = await addProjectComment(projectId, commentText.trim());
    if (res.success && res.data) {
      setComments(prev => [...prev, res.data as Record<string, unknown>]);
      setCommentText('');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    await deleteProjectComment(commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  if (loadError) {
    return (
      <div className="ep-detail-panel">
        <div className="ep-detail-top">
          <button className="ep-detail-back" onClick={onClose}>← Back</button>
        </div>
        <div className="ep-detail-loading" style={{ color: 'var(--danger)', padding: 20, textAlign: 'center' }}>
          Failed to load project
          <div style={{ fontSize: 12, marginTop: 8, color: 'var(--ink-muted)' }}>{loadError}</div>
        </div>
      </div>
    );
  }

  if (!project) return <div className="ep-detail-panel"><div className="ep-detail-loading">Loading...</div></div>;

  const p = project;

  // ── Field Renderers ────────────────────────────────────────────────────────

  const renderText = (icon: string, label: string, field: string) => {
    const val = (p[field] as string) || '';
    const isEditing = editingField === field;
    return (
      <div className="ep-detail-field">
        <div className="ep-detail-field-label">{icon && <span>{icon}</span>} {label}</div>
        <div className="ep-detail-field-value">
          {isEditing ? (
            <input
              className="ep-detail-input"
              value={val}
              autoFocus
              onChange={e => debouncedUpdate(field, e.target.value)}
              onBlur={() => setEditingField(null)}
              onKeyDown={e => { if (e.key === 'Enter') setEditingField(null); }}
            />
          ) : (
            <div className="ep-detail-display" onClick={() => setEditingField(field)}>
              {val || <Empty />}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderNumber = (icon: string, label: string, field: string, suffix?: string) => {
    const val = p[field] as number | null;
    const isEditing = editingField === field;
    return (
      <div className="ep-detail-field">
        <div className="ep-detail-field-label">{icon && <span>{icon}</span>} {label}</div>
        <div className="ep-detail-field-value">
          {isEditing ? (
            <input
              type="number"
              className="ep-detail-input"
              value={val ?? ''}
              autoFocus
              onChange={e => debouncedUpdate(field, e.target.value ? parseFloat(e.target.value) : null)}
              onBlur={() => setEditingField(null)}
              onKeyDown={e => { if (e.key === 'Enter') setEditingField(null); }}
            />
          ) : (
            <div className="ep-detail-display" onClick={() => setEditingField(field)}>
              {val != null ? <>{val}{suffix ? ` ${suffix}` : ''}</> : <Empty />}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDate = (icon: string, label: string, field: string) => {
    const val = p[field];
    const display = fmtDate(val);
    const isEditing = editingField === field;
    return (
      <div className="ep-detail-field">
        <div className="ep-detail-field-label">{icon && <span>{icon}</span>} {label}</div>
        <div className="ep-detail-field-value">
          {isEditing ? (
            <input
              type="date"
              className="ep-detail-input"
              value={val ? new Date(val as string).toISOString().split('T')[0] : ''}
              autoFocus
              onChange={e => { debouncedUpdate(field, e.target.value ? new Date(e.target.value).toISOString() : null); setEditingField(null); }}
              onBlur={() => setEditingField(null)}
            />
          ) : (
            <div className="ep-detail-display" onClick={() => setEditingField(field)}>
              {display || <Empty />}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderUrl = (icon: string, label: string, field: string) => {
    const val = p[field] as string | null;
    const isEditing = editingField === field;
    return (
      <div className="ep-detail-field">
        <div className="ep-detail-field-label">{icon && <span>{icon}</span>} {label}</div>
        <div className="ep-detail-field-value">
          {isEditing ? (
            <input
              className="ep-detail-input"
              value={val || ''}
              placeholder="https://..."
              autoFocus
              onChange={e => debouncedUpdate(field, e.target.value)}
              onBlur={() => setEditingField(null)}
              onKeyDown={e => { if (e.key === 'Enter') setEditingField(null); }}
            />
          ) : val && isUrl(val) ? (
            <a href={val} target="_blank" rel="noopener noreferrer" className="ep-link" onClick={e => e.stopPropagation()}>
              {val.replace(/^https?:\/\//, '').slice(0, 50)}
            </a>
          ) : (
            <div className="ep-detail-display" onClick={() => setEditingField(field)}>
              {val || <Empty />}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDropdown = (icon: string, label: string, field: string, options: Record<string, { label: string; bg: string; color: string }>) => {
    const current = p[field] as string;
    return (
      <div className="ep-detail-field">
        <div className="ep-detail-field-label">{icon && <span>{icon}</span>} {label}</div>
        <div className="ep-detail-field-value">
          <select className="ep-detail-select" value={current || ''} onChange={e => { debouncedUpdate(field, e.target.value); onUpdate(field, e.target.value); }}>
            {Object.entries(options).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  // ── Brief: build single text block from sub-fields ─────────────────────────
  const briefParts: string[] = [];
  if (p.brief_due_date) briefParts.push(`Due Date : ${p.brief_due_date}`);
  if (p.brief_length) briefParts.push(`Length / Runtime : ${p.brief_length}`);
  if (p.song_preferences) briefParts.push(`Song Preferences : ${p.song_preferences}`);
  if (p.software) briefParts.push(`Software : ${p.software}`);
  if (p.notes) briefParts.push(`Notes : ${p.notes}`);
  const briefText = briefParts.join('\n');

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="ep-detail-panel">
      <div className="ep-detail-top">
        <button className="ep-detail-back" onClick={onClose}>← Back</button>
        <div className="ep-detail-top-actions">
          <button className="ep-row-action-btn" onClick={onDuplicate} title="Duplicate">⧉</button>
          <button className="ep-row-action-btn" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      <div className="ep-detail-body">
        <h1
          className="ep-detail-title"
          contentEditable
          suppressContentEditableWarning
          onBlur={e => debouncedUpdate('name', e.currentTarget.textContent || 'Untitled')}
        >
          {p.name as string}
        </h1>

        <div className="ep-detail-fields">
          {renderDate('📅', 'Date', 'date')}
          {renderText('👤', 'Client name', 'client_name')}
          <div className="ep-detail-field">
            <div className="ep-detail-field-label"><span>👥</span> Editor</div>
            <div className="ep-detail-field-value">
              <EditorAssignmentCell
                editorId={(p.editorId ?? p.editor_id) as string | null ?? null}
                editorName={(p.assignedEditorName) as string | null ?? null}
                legacyName={(p.editor as string) || null}
                onChange={(id, name) => {
                  // Synthetic-workflow run found the picker would save to DB
                  // but the panel kept rendering "Unassigned" because onUpdate
                  // is debounced (500 ms) AND calls upward to the parent
                  // without touching local state. Optimistically merge into
                  // both `editorId` and the legacy snake-case alias so the
                  // pill re-renders immediately.
                  setProject(prev => prev ? {
                    ...prev,
                    editorId: id,
                    editor_id: id,
                    assignedEditorName: name,
                  } : prev);
                  onUpdate('editorId', id);
                  onUpdate('assignedEditorName', name);
                }}
              />
            </div>
          </div>
          {renderDropdown('⚡', 'Progress', 'progress', PROGRESS_CONFIG)}
          {renderDate('📅', 'Due', 'due_date')}
          {renderUrl('📁', 'Raw Data', 'raw_data_url')}
          {renderDropdown('❗', 'Priority', 'priority', PRIORITY_CONFIG)}

          {/* Brief — single text block like Notion */}
          <div className="ep-detail-field ep-detail-field-top">
            <div className="ep-detail-field-label"><span>📋</span> Brief</div>
            <div className="ep-detail-field-value">
              {editingField === '_brief' ? (
                <textarea
                  className="ep-detail-textarea"
                  value={briefText}
                  autoFocus
                  rows={6}
                  onChange={e => {
                    // Parse back into sub-fields on change
                    const text = e.target.value;
                    const get = (re: RegExp) => text.match(re)?.[1]?.trim() || null;
                    debouncedUpdate('brief_due_date', get(/due\s*date\s*:\s*(.+)/i));
                    debouncedUpdate('brief_length', get(/length\s*\/?\s*runtime\s*:\s*(.+)/i));
                    debouncedUpdate('song_preferences', get(/song\s*preferences?\s*:\s*(.+)/i));
                    debouncedUpdate('software', get(/software\s*:\s*(.+)/i));
                    debouncedUpdate('notes', get(/notes?\s*:\s*([\s\S]*)/i));
                  }}
                  onBlur={() => setEditingField(null)}
                />
              ) : (
                <div className="ep-detail-display ep-detail-display-multi" onClick={() => setEditingField('_brief')}>
                  {briefText ? <pre className="ep-detail-pre">{briefText}</pre> : <Empty />}
                </div>
              )}
            </div>
          </div>

          {renderText('✖', 'Deduction on del.', 'deduction_on_del')}
          {renderDate('📅', 'Completion Date', 'completion_date')}
          {renderNumber('⏱', 'Working hours', 'working_hours', 'hrs')}
          {renderText('📊', 'Reviewer Feedback', 'reviewer_feedback')}
          {renderNumber('Σ', 'Total Project Value', 'total_project_value')}
          {renderNumber('Σ', 'Total Amount', 'total_amount')}
          {renderDropdown('Σ', 'Paid', 'paid', PAID_CONFIG)}
          {renderNumber('Σ', 'Received 1', 'received_1')}
          {renderDropdown('❗', 'AM/Review', 'am_review', AM_REVIEW_CONFIG)}
          {renderNumber('⏱', 'Actual Hours', 'actual_hours', 'hrs')}
          {renderText('👥', 'Account Manager', 'account_manager')}

          <button className="ep-detail-more-btn" onClick={() => setShowMore(!showMore)}>
            {showMore ? '▲ Hide extra properties' : '▼ 33 more properties'}
          </button>

          {showMore && (
            <>
              {renderText('👥', 'Team', 'team')}
              {renderText('💾', 'Size in GBs', 'size_in_gbs')}
              {renderText('💽', 'Hard Drive', 'hard_drive')}
              {renderText('📂', 'File needed', 'file_needed')}
              {renderText('👤', 'Reviewed By', 'reviewed_by')}
              {renderNumber('⭐', 'Rated by Editor', 'rated_by_editor')}
              {renderNumber('⭐', 'Rated by CH', 'rated_by_ch')}
              {renderNumber('⭐', 'Reviewer Value', 'reviewer_value')}
              {renderDate('📅', 'Start Date', 'start_date')}
              {renderDate('📅', 'Approved Date', 'approved_date')}
            </>
          )}
        </div>

        {/* Comments */}
        <div className="ep-detail-comments">
          <h3>Comments</h3>
          {comments.map((c) => (
            <div key={c.id as string} className="ep-comment">
              <div className="ep-comment-header">
                <div className="ep-comment-avatar">{(c.author_name as string)?.[0]?.toUpperCase() || '?'}</div>
                <strong>{c.author_name as string}</strong>
                <span className="ep-comment-time">{c.created_at ? format(new Date(c.created_at as string), 'MMMM d, yyyy') : ''}</span>
                <button className="ep-comment-delete" onClick={() => handleDeleteComment(c.id as string)}>✕</button>
              </div>
              <div className="ep-comment-body">{c.content as string}</div>
            </div>
          ))}
          <div className="ep-comment-input-row">
            <textarea
              className="ep-comment-input"
              placeholder="Add a comment..."
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
