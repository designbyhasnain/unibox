'use client';

import { useState, useEffect, useCallback } from 'react';
import { getEditorProjectDetail, uploadCutAction, sendForReviewAction, type EditorProjectDetailData } from '../../../lib/projects/editorStats';

const STATUS_MAP: Record<string, { label: string; dot: string; bar: string }> = {
    IN_PROGRESS: { label: 'EDITING',   dot: '#a78bfa', bar: 'linear-gradient(90deg,#8b5cf6,#f97316)' },
    IN_REVISION: { label: 'REVISIONS', dot: '#f97316', bar: '#f97316' },
    DOWNLOADING: { label: 'DELIVERY',  dot: '#22c55e', bar: '#22c55e' },
    DOWNLOADED:  { label: 'DELIVERY',  dot: '#22c55e', bar: '#22c55e' },
    ON_HOLD:     { label: 'ON HOLD',   dot: '#6b7280', bar: '#6b7280' },
    APPROVED:    { label: 'APPROVED',  dot: '#22c55e', bar: '#22c55e' },
    DONE:        { label: 'DONE',      dot: '#14b8a6', bar: '#14b8a6' },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
    HIGH:   { label: 'HIGH',   color: '#f97316' },
    MEDIUM: { label: 'MED',    color: '#eab308' },
    LOW:    { label: 'LOW',    color: '#6b7280' },
};

function avatarColor(s: string) {
    const p = ['#7c3aed','#0891b2','#d97706','#dc2626','#059669','#db2777','#0284c7'];
    let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return p[Math.abs(h) % p.length];
}
function initials(s: string) { return (s||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
function relTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const h = diff / 3_600_000, d = diff / 86_400_000;
    if (h < 1) return 'Just now'; if (h < 24) return `${Math.floor(h)}h ago`;
    if (d < 2) return 'Yesterday';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function dueBadge(dueDate: string | null) {
    if (!dueDate) return null;
    const diff = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000);
    const label = new Date(dueDate).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    if (diff < 0)  return { text: `Overdue · ${label}`, cls: 'epd-due-overdue' };
    if (diff <= 3) return { text: `Due ${label}`, cls: 'epd-due-soon' };
    return { text: `Due ${label}`, cls: 'epd-due-normal' };
}

const CLOSE_ICON = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const PREMIERE_ICON = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>;
const UPLOAD_ICON = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>;
const CHECK_ICON = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;

interface Props {
    projectId: string | null;
    onClose: () => void;
}

export default function EditorProjectDetail({ projectId, onClose }: Props) {
    const [detail, setDetail] = useState<EditorProjectDetailData | null>(null);
    const [loading, setLoading] = useState(false);
    const [showUpload, setShowUpload] = useState(false);
    const [uploadUrl, setUploadUrl] = useState('');
    const [submitting, setSubmitting] = useState<'upload' | 'review' | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const load = useCallback(async (id: string) => {
        setLoading(true);
        setDetail(null);
        const d = await getEditorProjectDetail(id);
        setDetail(d);
        setLoading(false);
    }, []);

    useEffect(() => {
        if (projectId) load(projectId);
        else { setDetail(null); setShowUpload(false); setUploadUrl(''); setActionError(null); }
    }, [projectId, load]);

    const open = !!projectId;

    function handleOpenPremiere() {
        if (!detail) return;
        // Try the explicit raw data URL first (it's a true URL field), fall back
        // to hard_drive in case the editor stored a URL there. If neither is a
        // URL, show a clear message instead of a silent dead-click.
        const candidates = [detail.rawDataUrl, detail.hardDrive].filter(Boolean) as string[];
        const url = candidates.find(u => /^https?:\/\//i.test(u));
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            alert('No drive URL set for this project yet — ask the admin to add one.');
        }
    }

    async function handleUploadCut() {
        if (!projectId) return;
        setActionError(null);
        setSubmitting('upload');
        const res = await uploadCutAction(projectId, uploadUrl);
        setSubmitting(null);
        if (!res.success) { setActionError(res.error || 'Upload failed'); return; }
        setUploadUrl('');
        setShowUpload(false);
        await load(projectId); // refresh comments so the editor sees their post
    }

    async function handleSendForReview() {
        if (!projectId) return;
        setActionError(null);
        setSubmitting('review');
        const res = await sendForReviewAction(projectId);
        setSubmitting(null);
        if (!res.success) { setActionError(res.error || 'Failed to send'); return; }
        await load(projectId);
    }

    const status  = detail ? (STATUS_MAP[detail.progress] ?? { label: detail.progress, dot: '#6b7280', bar: '#6b7280' }) : null;
    const pct     = detail ? Math.min(100, Math.max(0, detail.formulaPercent)) : 0;
    const badge   = detail ? dueBadge(detail.dueDate) : null;
    const priority = detail?.priority ? PRIORITY_MAP[detail.priority] : null;

    return (
        <>
            {open && <div className="epd-backdrop" onClick={onClose} />}
            <div className={`epd-drawer${open ? ' open' : ''}`}>
                <div className="epd-inner">
                    {/* Header bar */}
                    <div className="epd-topbar">
                        <span className="epd-topbar-title">Project detail</span>
                        <button className="epd-close" onClick={onClose}>{CLOSE_ICON}</button>
                    </div>

                    {loading && (
                        <div className="epd-loading">
                            <div className="epd-pulse" />
                            <span>Loading…</span>
                        </div>
                    )}

                    {!loading && detail && (
                        <>
                            {/* Project identity */}
                            <div className="epd-identity">
                                <div className="epd-avatar" style={{ background: avatarColor(detail.clientName || detail.name) }}>
                                    {initials(detail.clientName || detail.name)}
                                </div>
                                <div>
                                    <div className="epd-project-name">{detail.name}</div>
                                    <div className="epd-client-name">{detail.clientName || 'Unknown client'}</div>
                                </div>
                            </div>

                            {/* Status + due */}
                            <div className="epd-meta-row">
                                {status && (
                                    <span className="epd-status-badge">
                                        <span className="epd-status-dot" style={{ background: status.dot }} />
                                        {status.label}
                                    </span>
                                )}
                                {badge && <span className={`epd-due-badge ${badge.cls}`}>{badge.text}</span>}
                                {priority && (
                                    <span className="epd-priority-badge" style={{ color: priority.color }}>
                                        ● {priority.label}
                                    </span>
                                )}
                            </div>

                            {/* Progress */}
                            <div className="epd-progress-section">
                                <div className="epd-progress-row">
                                    <span className="epd-progress-label">Progress</span>
                                    <span className="epd-progress-pct">{Math.round(pct)}%</span>
                                </div>
                                <div className="epd-progress-track">
                                    <div className="epd-progress-fill" style={{ width: `${pct}%`, background: status?.bar || '#6b7280' }} />
                                </div>
                            </div>

                            {/* Meta grid */}
                            <div className="epd-info-grid">
                                {detail.sizeInGbs && detail.sizeInGbs !== '0' && (
                                    <div className="epd-info-item"><span className="epd-info-label">Footage</span><span className="epd-info-val">{detail.sizeInGbs}</span></div>
                                )}
                                {detail.workingHours > 0 && (
                                    <div className="epd-info-item"><span className="epd-info-label">Est. hours</span><span className="epd-info-val">{detail.workingHours}h</span></div>
                                )}
                                {detail.actualHours > 0 && (
                                    <div className="epd-info-item"><span className="epd-info-label">Actual</span><span className="epd-info-val">{detail.actualHours}h</span></div>
                                )}
                                {detail.briefLength && (
                                    <div className="epd-info-item"><span className="epd-info-label">Length</span><span className="epd-info-val">{detail.briefLength}</span></div>
                                )}
                                {detail.software && (
                                    <div className="epd-info-item"><span className="epd-info-label">Software</span><span className="epd-info-val">{detail.software}</span></div>
                                )}
                                {detail.editor && (
                                    <div className="epd-info-item"><span className="epd-info-label">Editor</span><span className="epd-info-val">{detail.editor}</span></div>
                                )}
                            </div>

                            {/* Notes */}
                            {detail.notes && (
                                <div className="epd-notes-section">
                                    <div className="epd-section-label">Notes</div>
                                    <div className="epd-notes-body">{detail.notes}</div>
                                </div>
                            )}

                            {/* Comments */}
                            {detail.comments.length > 0 && (
                                <div className="epd-comments-section">
                                    <div className="epd-section-label">Client feedback ({detail.comments.length})</div>
                                    <div className="epd-comments-list">
                                        {detail.comments.map(c => (
                                            <div key={c.id} className="epd-comment">
                                                <div className="epd-comment-header">
                                                    <div className="epd-comment-avatar" style={{ background: avatarColor(c.authorName) }}>
                                                        {initials(c.authorName)}
                                                    </div>
                                                    <span className="epd-comment-author">{c.authorName}</span>
                                                    <span className="epd-comment-time">{relTime(c.createdAt)}</span>
                                                </div>
                                                <div className="epd-comment-body">"{c.content}"</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="epd-actions">
                                <button className="epd-btn-premiere" onClick={handleOpenPremiere}>
                                    {PREMIERE_ICON} Open in Premiere
                                </button>
                                <button className="epd-btn-upload" onClick={() => { setShowUpload(true); setActionError(null); }}>
                                    {UPLOAD_ICON} Upload cut
                                </button>
                                <button className="epd-btn-review" onClick={handleSendForReview} disabled={submitting === 'review'}>
                                    {CHECK_ICON} {submitting === 'review' ? 'Sending…' : 'Send for review'}
                                </button>
                            </div>

                            {actionError && <div className="epd-action-error">{actionError}</div>}
                        </>
                    )}

                    {/* Upload Cut modal — inline so the drawer stays self-contained. */}
                    {showUpload && (
                        <div className="epd-modal-backdrop" onClick={() => !submitting && setShowUpload(false)}>
                            <div className="epd-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                                <div className="epd-modal-head">
                                    <span className="epd-modal-title">Upload cut</span>
                                    <button className="epd-close" onClick={() => setShowUpload(false)}>{CLOSE_ICON}</button>
                                </div>
                                <p className="epd-modal-sub">
                                    Paste a Google Drive, Dropbox, Vimeo, or Frame.io link to your latest cut. The admin will see a comment on this project.
                                </p>
                                <input
                                    className="epd-modal-input"
                                    type="url"
                                    placeholder="https://drive.google.com/…"
                                    value={uploadUrl}
                                    onChange={e => setUploadUrl(e.target.value)}
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter' && uploadUrl.trim()) handleUploadCut(); }}
                                />
                                {actionError && <div className="epd-modal-error">{actionError}</div>}
                                <div className="epd-modal-actions">
                                    <button className="epd-modal-cancel" onClick={() => setShowUpload(false)} disabled={!!submitting}>Cancel</button>
                                    <button
                                        className="epd-modal-submit"
                                        onClick={handleUploadCut}
                                        disabled={!uploadUrl.trim() || submitting === 'upload'}
                                    >
                                        {submitting === 'upload' ? 'Uploading…' : 'Send to admin'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {!loading && !detail && projectId && (
                        <div className="epd-loading"><span>Project not found.</span></div>
                    )}
                </div>
            </div>
        </>
    );
}
