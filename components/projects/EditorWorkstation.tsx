'use client';

import { useState, useEffect, useCallback } from 'react';
import { getEditProjects, getEditProjectById, addProjectComment, updateEditProject } from '../../lib/projects/actions';

type Project = Record<string, unknown>;
type Comment = { id: string; content: string; author_name: string; created_at: string };

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    ON_HOLD: { label: 'On Hold', color: '#6b7280', bg: '#f3f4f6' },
    NOT_STARTED: { label: 'Not Started', color: '#6b7280', bg: '#f3f4f6' },
    DOWNLOADED: { label: 'Downloaded', color: '#2563eb', bg: '#eff6ff' },
    IN_PROGRESS: { label: 'In Progress', color: '#d97706', bg: '#fffbeb' },
    IN_REVIEW: { label: 'In Review', color: '#7c3aed', bg: '#f5f3ff' },
    REVISION: { label: 'Revision', color: '#dc2626', bg: '#fef2f2' },
    DONE: { label: 'Done', color: '#059669', bg: '#ecfdf5' },
    APPROVED: { label: 'Approved', color: '#059669', bg: '#ecfdf5' },
    DELIVERED: { label: 'Delivered', color: '#0d9488', bg: '#f0fdfa' },
};

function StatusBadge({ status }: { status: string }) {
    const s = STATUS_LABELS[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' };
    return (
        <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: '4px',
            fontSize: '12px', fontWeight: 600, color: s.color, background: s.bg,
        }}>
            {s.label}
        </span>
    );
}

function formatDate(d: unknown): string {
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

export default function EditorWorkstation() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Project | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);

    const load = useCallback(async () => {
        const res = await getEditProjects(undefined, 1, 100);
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
            const raw = res.data as Record<string, unknown>;
            setComments((raw.comments as Comment[]) || []);
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

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#9ca3af' }}>
                Loading your projects...
            </div>
        );
    }

    // Detail view
    if (selected) {
        return (
            <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 24px' }}>
                <button
                    onClick={() => setSelected(null)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px', marginBottom: '24px', padding: 0 }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
                    Back to projects
                </button>

                <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '8px', lineHeight: 1.3 }}>
                    {selected.name as string}
                </h1>
                <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '32px' }}>
                    {selected.clientName as string}
                </p>

                {/* Properties grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0', borderTop: '1px solid #f3f4f6', marginBottom: '32px' }}>
                    {([
                        ['Status', <div key="s" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <StatusBadge status={selected.progress as string} />
                            <select
                                value={selected.progress as string}
                                onChange={(e) => handleStatusChange(e.target.value)}
                                style={{ fontSize: '12px', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '2px 6px', color: '#374151', background: 'white', cursor: 'pointer' }}
                            >
                                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>],
                        ['Due Date', <span key="d" style={{ color: '#111827' }}>{formatDate(selected.dueDate)}</span>],
                        ['Start Date', <span key="sd" style={{ color: '#111827' }}>{formatDate(selected.startDate)}</span>],
                        ['Priority', <span key="p" style={{ color: '#111827', textTransform: 'capitalize' as const }}>{(selected.priority as string || '—').toLowerCase()}</span>],
                        ['Editor', <span key="e" style={{ color: '#111827' }}>{(selected.editor as string) || '—'}</span>],
                        ['Software', <span key="sw" style={{ color: '#111827' }}>{(selected.software as string) || '—'}</span>],
                        ['Hours Logged', <span key="h" style={{ color: '#111827' }}>{selected.actualHours as number || 0}h</span>],
                    ] as [string, React.ReactNode][]).map(([label, value]) => (
                        <div key={label} style={{ display: 'contents' }}>
                            <div style={{ padding: '10px 0', fontSize: '13px', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>{label}</div>
                            <div style={{ padding: '10px 0', fontSize: '13px', borderBottom: '1px solid #f3f4f6' }}>{value}</div>
                        </div>
                    ))}
                </div>

                {/* Brief / Instructions */}
                <div style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>Brief &amp; Instructions</h3>
                    <div style={{
                        background: '#fafafa', borderRadius: '8px', padding: '16px', fontSize: '14px',
                        lineHeight: 1.7, color: '#374151', minHeight: '80px', whiteSpace: 'pre-wrap',
                        border: '1px solid #f3f4f6',
                    }}>
                        {(selected.notes as string) || (selected.songPreferences as string) || (selected.briefLength as string)
                            ? [selected.notes, selected.briefLength && `Brief length: ${selected.briefLength}`, selected.songPreferences && `Song preferences: ${selected.songPreferences}`].filter(Boolean).join('\n\n')
                            : 'No instructions provided yet.'}
                    </div>
                </div>

                {/* File Info */}
                {((selected.rawDataUrl as string) || (selected.fileNeeded as string) || (selected.hardDrive as string)) && (
                    <div style={{ marginBottom: '32px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>Files &amp; Data</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0', borderTop: '1px solid #f3f4f6' }}>
                            {String(selected.rawDataUrl || '') && <><div style={{ padding: '8px 0', fontSize: '13px', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>Raw Data</div><div style={{ padding: '8px 0', fontSize: '13px', borderBottom: '1px solid #f3f4f6' }}><a href={String(selected.rawDataUrl)} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{String(selected.rawDataUrl)}</a></div></>}
                            {String(selected.fileNeeded || '') && <><div style={{ padding: '8px 0', fontSize: '13px', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>File Needed</div><div style={{ padding: '8px 0', fontSize: '13px', color: '#111827', borderBottom: '1px solid #f3f4f6' }}>{String(selected.fileNeeded)}</div></>}
                            {String(selected.hardDrive || '') && <><div style={{ padding: '8px 0', fontSize: '13px', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>Hard Drive</div><div style={{ padding: '8px 0', fontSize: '13px', color: '#111827', borderBottom: '1px solid #f3f4f6' }}>{String(selected.hardDrive)}</div></>}
                            {String(selected.sizeInGbs || '') && <><div style={{ padding: '8px 0', fontSize: '13px', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>Size</div><div style={{ padding: '8px 0', fontSize: '13px', color: '#111827', borderBottom: '1px solid #f3f4f6' }}>{String(selected.sizeInGbs)} GB</div></>}
                        </div>
                    </div>
                )}

                {/* Comments */}
                <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>
                        Comments {comments.length > 0 && <span style={{ fontWeight: 400, color: '#9ca3af' }}>({comments.length})</span>}
                    </h3>

                    {detailLoading ? (
                        <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading comments...</p>
                    ) : comments.length === 0 ? (
                        <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '16px' }}>No comments yet. Be the first to add one.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                            {comments.map(c => (
                                <div key={c.id} style={{ padding: '12px', background: '#fafafa', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{c.author_name}</span>
                                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>{timeAgo(c.created_at)}</span>
                                    </div>
                                    <p style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{c.content}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment(); } }}
                            placeholder="Add a comment..."
                            style={{
                                flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px',
                                fontSize: '13px', outline: 'none',
                            }}
                            disabled={submitting}
                        />
                        <button
                            onClick={handleComment}
                            disabled={submitting || !newComment.trim()}
                            style={{
                                padding: '10px 16px', background: '#111827', color: 'white', border: 'none',
                                borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                                opacity: submitting || !newComment.trim() ? 0.5 : 1,
                            }}
                        >
                            Post
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // List view
    return (
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 24px' }}>
            <div style={{ marginBottom: '32px' }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎬</div>
                <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>My Projects</h1>
                <p style={{ fontSize: '14px', color: '#9ca3af' }}>Your assigned editing projects and tasks.</p>
            </div>

            {projects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
                    <p style={{ fontSize: '14px' }}>No projects assigned to you yet.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                    {projects.map((p) => (
                        <button
                            key={p.id as string}
                            onClick={() => openProject(p)}
                            style={{
                                display: 'grid', gridTemplateColumns: '1fr auto auto',
                                alignItems: 'center', gap: '16px', padding: '14px 18px',
                                background: 'white', border: 'none', borderBottom: '1px solid #f5f5f5',
                                cursor: 'pointer', textAlign: 'left', width: '100%',
                            }}
                        >
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 500, color: '#111827', marginBottom: '2px' }}>
                                    {p.name as string}
                                </div>
                                <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                                    {p.clientName as string}
                                    {p.dueDate ? ` · Due ${formatDate(p.dueDate)}` : ''}
                                </div>
                            </div>
                            <StatusBadge status={p.progress as string} />
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
