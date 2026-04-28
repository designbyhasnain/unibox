'use client';
import { useState, useEffect } from 'react';
import { getEditorRevisionsData, type EditorRevisionItem } from '../../lib/projects/editorStats';

function avatarColor(s: string) {
    const p=['#7c3aed','#0891b2','#d97706','#dc2626','#059669','#db2777','#0284c7'];
    let h=0; for(let i=0;i<s.length;i++) h=s.charCodeAt(i)+((h<<5)-h);
    return p[Math.abs(h)%p.length];
}
function initials(s: string) { return (s||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
function relTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const h = diff / 3_600_000, d = diff / 86_400_000;
    if (h < 1) return 'Just now'; if (h < 24) return `${Math.floor(h)}h ago`;
    if (d < 2) return 'Yesterday';
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(iso).getDay()];
}

export default function RevisionsClient() {
    const [items, setItems] = useState<EditorRevisionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        getEditorRevisionsData().then(d => { setItems(d.items); setLoading(false); if (d.items[0]) setSelectedId(d.items[0].projectId); });
    }, []);

    const selected = items.find(i => i.projectId === selectedId);
    const newCount = items.filter(i => i.isNew).length;

    return (
        <div className="rev-page">
            {/* Left: feedback inbox */}
            <div className="rev-inbox">
                <div className="rev-inbox-header">
                    <span className="rev-inbox-title">Feedback inbox</span>
                    <span className="rev-inbox-count">{newCount > 0 ? `${newCount} new · ` : ''}{items.length} total</span>
                </div>
                {loading && <div className="rev-loading">Loading…</div>}
                {!loading && items.length === 0 && <div className="rev-empty">No feedback yet.</div>}
                {items.map(item => (
                    <div
                        key={item.projectId}
                        className={`rev-inbox-item${selectedId === item.projectId ? ' active' : ''}`}
                        onClick={() => setSelectedId(item.projectId)}
                    >
                        <div className="rev-item-row">
                            <div className="rev-item-avatar" style={{ background: avatarColor(item.clientName || item.projectName) }}>
                                {initials(item.clientName || item.projectName)}
                            </div>
                            <div className="rev-item-meta">
                                <span className="rev-item-client">{item.clientName || item.projectName}</span>
                                {item.isNew && <span className="rev-item-new-dot" />}
                                <span className="rev-item-time">{item.latestComment ? relTime(item.latestComment.createdAt) : ''}</span>
                            </div>
                        </div>
                        <div className="rev-item-project">{item.projectName} · R{item.commentCount}</div>
                        <div className="rev-item-preview">{item.latestComment?.content.slice(0, 80) || ''}</div>
                    </div>
                ))}
            </div>

            {/* Right: detail */}
            <div className="rev-detail">
                {!selected && !loading && (
                    <div className="rev-detail-empty">Select a project to view feedback.</div>
                )}
                {selected && selected.latestComment && (
                    <>
                        <div className="rev-detail-header">
                            <div className="rev-detail-avatar" style={{ background: avatarColor(selected.clientName || selected.projectName) }}>
                                {initials(selected.clientName || selected.projectName)}
                            </div>
                            <div>
                                <div className="rev-detail-client">{selected.clientName || selected.projectName}</div>
                                <div className="rev-detail-sub">{selected.projectName} · R{selected.commentCount} of {selected.commentCount + 1}</div>
                            </div>
                            {selected.isNew && <span className="rev-detail-new">NEW</span>}
                        </div>

                        <div className="rev-detail-quote">
                            &ldquo;{selected.latestComment.content}&rdquo;
                        </div>

                        {selected.allComments.length > 1 && (
                            <div className="rev-notes-section">
                                <div className="rev-notes-title">Notes ({selected.allComments.length})</div>
                                {selected.allComments.map((c, i) => (
                                    <div key={c.id} className="rev-note-item">
                                        <span className="rev-note-idx">{String(i + 1).padStart(2, '0')}</span>
                                        <span className="rev-note-body">{c.content}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="rev-detail-actions">
                            <button className="rev-btn-upload">↑ Upload new cut</button>
                            <button className="rev-btn-progress">Mark in progress</button>
                            <button className="rev-btn-review">✓ Send for review</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
