'use client';

import { useState, useEffect, useCallback } from 'react';
import { getEditProjects, getEditProjectById, addProjectComment, updateEditProject } from '../../lib/projects/actions';

type Project = Record<string, unknown>;
type Comment = { id: string; content: string; author_name: string; created_at: string };

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    ON_HOLD:     { label: 'On Hold',     color: 'var(--ink-muted)', bg: 'var(--surface-2)' },
    NOT_STARTED: { label: 'Not Started', color: 'var(--ink-muted)', bg: 'var(--surface-2)' },
    DOWNLOADED:  { label: 'Downloaded',  color: 'var(--info)',      bg: 'color-mix(in oklab, var(--info), transparent 88%)' },
    DOWNLOADING: { label: 'Downloading', color: 'var(--info)',      bg: 'color-mix(in oklab, var(--info), transparent 88%)' },
    IN_PROGRESS: { label: 'In Progress', color: 'var(--warn)',      bg: 'color-mix(in oklab, var(--warn), transparent 88%)' },
    IN_REVIEW:   { label: 'In Review',   color: 'var(--accent-ink)', bg: 'color-mix(in oklab, var(--accent), transparent 88%)' },
    REVISION:    { label: 'Revision',    color: 'var(--danger)',    bg: 'var(--danger-soft)' },
    DONE:        { label: 'Done',        color: 'var(--coach)',     bg: 'var(--coach-soft)' },
    APPROVED:    { label: 'Approved',    color: 'var(--coach)',     bg: 'var(--coach-soft)' },
    DELIVERED:   { label: 'Delivered',   color: 'var(--coach)',     bg: 'var(--coach-soft)' },
};

function StatusBadge({ status }: { status: string }) {
    const s = STATUS_LABELS[status] || { label: status, color: 'var(--ink-muted)', bg: 'var(--surface-2)' };
    return (
        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, color: s.color, background: s.bg, whiteSpace: 'nowrap' }}>
            {s.label}
        </span>
    );
}

function fmtDate(d: unknown): string {
    if (!d) return '—';
    try { return new Date(d as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return '—'; }
}

function timeAgo(d: string): string {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

const thStyle: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '2px solid var(--hairline)' };
const tdStyle: React.CSSProperties = { padding: '8px 12px', fontSize: '12px', color: 'var(--ink-2)', borderBottom: '1px solid var(--hairline-soft)', whiteSpace: 'nowrap' };

export default function EditorWorkstation() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Project | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);

    const load = useCallback(async () => {
        const res = await getEditProjects(undefined, 1, 200);
        if (res.success && res.data) setProjects(res.data as Project[]);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openProject = useCallback(async (p: Project) => {
        setSelected(p);
        setDetailLoading(true);
        setComments([]);
        const res = await getEditProjectById(p.id as string);
        if (res.success && res.data) {
            setComments(((res.data as Record<string, unknown>).comments as Comment[]) || []);
        }
        setDetailLoading(false);
    }, []);

    const handleComment = useCallback(async () => {
        if (!newComment.trim() || !selected) return;
        setSubmitting(true);
        const res = await addProjectComment(selected.id as string, newComment.trim());
        if (res.success && res.data) {
            const c = res.data as Record<string, unknown>;
            setComments(prev => [...prev, { id: c.id as string, content: c.content as string, author_name: c.author_name as string, created_at: c.created_at as string }]);
            setNewComment('');
        }
        setSubmitting(false);
    }, [newComment, selected]);

    const handleStatusChange = useCallback(async (status: string) => {
        if (!selected) return;
        await updateEditProject(selected.id as string, { progress: status });
        setSelected(prev => prev ? { ...prev, progress: status } : null);
        setProjects(prev => prev.map(p => p.id === selected.id ? { ...p, progress: status } : p));
    }, [selected]);

    if (loading) return <div className="ep-loading">Loading projects...</div>;

    // ── Detail Panel (full-width split) ──
    if (selected) {
        return (
            <div className="ep-page">
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
                        Back
                    </button>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{selected.name as string}</h2>
                    <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>{selected.clientName as string}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: 'calc(100vh - 110px)', overflow: 'hidden' }}>
                    {/* Left: Properties + Brief */}
                    <div style={{ padding: '24px', overflowY: 'auto' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
                            {([
                                ['Status', <div key="s" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><StatusBadge status={selected.progress as string} /><select value={selected.progress as string} onChange={(e) => handleStatusChange(e.target.value)} style={{ fontSize: '11px', border: '1px solid var(--hairline)', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', background: 'var(--shell)', color: 'var(--ink)' }}>{Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>],
                                ['Due Date', <span key="d" style={{ fontSize: '13px', fontWeight: 600 }}>{fmtDate(selected.dueDate)}</span>],
                                ['Priority', <span key="p" style={{ fontSize: '13px', fontWeight: 600, textTransform: 'capitalize' as const }}>{(selected.priority as string || '—').toLowerCase()}</span>],
                                ['Hours', <span key="h" style={{ fontSize: '13px', fontWeight: 600 }}>{selected.actualHours as number || 0}h</span>],
                            ] as [string, React.ReactNode][]).map(([label, value]) => (
                                <div key={label} style={{ background: 'var(--surface-2)', borderRadius: '8px', padding: '12px', border: '1px solid var(--hairline-soft)' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
                                    {value}
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                            {([
                                ['Editor', selected.editor], ['Software', selected.software],
                                ['Start Date', fmtDate(selected.startDate)], ['Team', selected.team],
                            ] as [string, unknown][]).map(([label, val]) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--hairline-soft)' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>{label}</span>
                                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ink)' }}>{String(val || '—')}</span>
                                </div>
                            ))}
                        </div>

                        <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Brief &amp; Instructions</h3>
                        <div style={{ background: 'var(--surface-2)', borderRadius: '8px', padding: '16px', fontSize: '13px', lineHeight: 1.7, color: 'var(--ink-2)', minHeight: '100px', whiteSpace: 'pre-wrap', border: '1px solid var(--hairline-soft)', marginBottom: '24px' }}>
                            {(selected.notes as string) || (selected.songPreferences as string) || (selected.briefLength as string)
                                ? [selected.notes, selected.briefLength && `Brief length: ${selected.briefLength}`, selected.songPreferences && `Song preferences: ${selected.songPreferences}`].filter(Boolean).join('\n\n')
                                : 'No instructions provided yet.'}
                        </div>

                        {((selected.rawDataUrl as string) || (selected.fileNeeded as string)) && (
                            <>
                                <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Files &amp; Data</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0', marginBottom: '24px' }}>
                                    {String(selected.rawDataUrl || '') && <><div style={{ padding: '6px 0', fontSize: '12px', color: 'var(--ink-muted)' }}>Raw Data</div><div style={{ padding: '6px 0', fontSize: '12px' }}><a href={String(selected.rawDataUrl)} target="_blank" rel="noreferrer" style={{ color: 'var(--info)' }}>Open Link</a></div></>}
                                    {String(selected.fileNeeded || '') && <><div style={{ padding: '6px 0', fontSize: '12px', color: 'var(--ink-muted)' }}>File Needed</div><div style={{ padding: '6px 0', fontSize: '12px', color: 'var(--ink)' }}>{String(selected.fileNeeded)}</div></>}
                                    {String(selected.hardDrive || '') && <><div style={{ padding: '6px 0', fontSize: '12px', color: 'var(--ink-muted)' }}>Hard Drive</div><div style={{ padding: '6px 0', fontSize: '12px', color: 'var(--ink)' }}>{String(selected.hardDrive)}</div></>}
                                    {String(selected.sizeInGbs || '') && <><div style={{ padding: '6px 0', fontSize: '12px', color: 'var(--ink-muted)' }}>Size</div><div style={{ padding: '6px 0', fontSize: '12px', color: 'var(--ink)' }}>{String(selected.sizeInGbs)} GB</div></>}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Right: Comments panel */}
                    <div style={{ borderLeft: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', background: 'var(--surface-2)' }}>
                        <div style={{ padding: '16px', borderBottom: '1px solid var(--hairline)', fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                            Comments {comments.length > 0 && <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>({comments.length})</span>}
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                            {detailLoading ? <p style={{ fontSize: '12px', color: 'var(--ink-muted)', padding: '12px' }}>Loading...</p> :
                            comments.length === 0 ? <p style={{ fontSize: '12px', color: 'var(--ink-muted)', padding: '12px' }}>No comments yet.</p> :
                            comments.map(c => (
                                <div key={c.id} style={{ padding: '10px', background: 'var(--shell)', borderRadius: '6px', border: '1px solid var(--hairline-soft)', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-2)' }}>{c.author_name}</span>
                                        <span style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>{timeAgo(c.created_at)}</span>
                                    </div>
                                    <p style={{ fontSize: '12px', color: 'var(--ink-2)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>{c.content}</p>
                                </div>
                            ))}
                        </div>
                        <div style={{ padding: '12px', borderTop: '1px solid var(--hairline)', display: 'flex', gap: '6px' }}>
                            <input value={newComment} onChange={(e) => setNewComment(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment(); } }}
                                placeholder="Add a comment..." disabled={submitting}
                                style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--hairline)', borderRadius: '6px', fontSize: '12px', outline: 'none', background: 'var(--shell)', color: 'var(--ink)' }} />
                            <button onClick={handleComment} disabled={submitting || !newComment.trim()}
                                style={{ padding: '8px 14px', background: 'var(--ink)', color: 'var(--canvas)', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', opacity: submitting || !newComment.trim() ? 0.5 : 1 }}>
                                Post
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Full-width Table View ──
    return (
        <div className="ep-page">
            <div className="ep-page-header">
                <div className="ep-page-emoji">🎬</div>
                <h1 className="ep-page-title">My Projects</h1>
                <p className="ep-page-desc">Your assigned editing projects and tasks.</p>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                        <tr style={{ background: 'var(--surface-2)' }}>
                            <th style={thStyle}>Date</th>
                            <th style={thStyle}>Client</th>
                            <th style={thStyle}>Project Name</th>
                            <th style={thStyle}>Progress</th>
                            <th style={thStyle}>Due</th>
                            <th style={thStyle}>Priority</th>
                            <th style={thStyle}>Editor</th>
                            <th style={thStyle}>Tags</th>
                            <th style={thStyle}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.map((p) => (
                            <tr key={p.id as string} style={{ cursor: 'pointer' }} onClick={() => openProject(p)}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                                <td style={tdStyle}>{fmtDate(p.date)}</td>
                                <td style={{ ...tdStyle, color: 'var(--ink-muted)' }}>{p.clientName as string}</td>
                                <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--ink)' }}>{p.name as string}</td>
                                <td style={tdStyle}><StatusBadge status={p.progress as string} /></td>
                                <td style={tdStyle}>{fmtDate(p.dueDate)}</td>
                                <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{(p.priority as string || '—').toLowerCase()}</td>
                                <td style={tdStyle}>{(p.editor as string) || '—'}</td>
                                <td style={tdStyle}>
                                    {Array.isArray(p.tags) && (p.tags as string[]).length > 0
                                        ? (p.tags as string[]).map(t => <span key={t} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: 'color-mix(in oklab, var(--info), transparent 88%)', color: 'var(--info)', marginRight: '4px' }}>{t}</span>)
                                        : '—'}
                                </td>
                                <td style={tdStyle}>
                                    <button onClick={(e) => { e.stopPropagation(); openProject(p); }}
                                        style={{ background: 'none', border: '1px solid var(--hairline)', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--ink-2)' }}>
                                        Open
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
