'use client';
import { useState, useEffect } from 'react';
import { getEditorDeliveredData, type EditorDeliveredProject } from '../../lib/projects/editorStats';

const TAG_COLORS: Record<string, string> = {
    WEDDING: 'oklch(0.55 0.18 295)', TEASER: 'oklch(0.62 0.13 200)', BRAND: 'oklch(0.62 0.14 160)', REEL: 'oklch(0.62 0.20 340)',
    HIGHLIGHT: 'oklch(0.65 0.16 60)', FILM: 'oklch(0.60 0.20 25)',
};
function tagLabel(p: EditorDeliveredProject) {
    const t = p.tags?.[0]?.toUpperCase();
    return t || (p.name.toLowerCase().includes('wedding') ? 'WEDDING' : p.name.toLowerCase().includes('reel') ? 'REEL' : 'FILM');
}

const STAR = <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const PLAY_ICON = <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="white" stroke="none"/></svg>;

export default function DeliveredClient() {
    const [projects, setProjects] = useState<EditorDeliveredProject[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getEditorDeliveredData().then(d => { setProjects(d.projects); setLoading(false); });
    }, []);

    const total = projects.length;
    const avgRating = projects.filter(p => p.rating).reduce((s, p) => s + (p.rating || 0), 0) / (projects.filter(p => p.rating).length || 1);
    const totalRevisions = projects.reduce((s, p) => s + p.revisionCount, 0);
    const avgTurnaround = projects.filter(p => p.turnaroundDays != null).reduce((s, p) => s + (p.turnaroundDays || 0), 0) / (projects.filter(p => p.turnaroundDays != null).length || 1);

    return (
        <div className="del-page">
            <div className="del-header">
                <div>
                    <h1 className="del-title">Delivered work <span className="del-count">· {total} this quarter</span></h1>
                    {total > 0 && (
                        <p className="del-subtitle">
                            Avg turnaround {isFinite(avgTurnaround) ? avgTurnaround.toFixed(1) : '—'} days
                            {' · '} avg rating {isFinite(avgRating) ? avgRating.toFixed(1) : '—'}
                            {' · '} {totalRevisions} revisions across quarter
                        </p>
                    )}
                </div>
                <button className="del-export-btn">↓ Export reel</button>
            </div>

            {loading && <div className="del-loading">Loading delivered work…</div>}

            {!loading && projects.length === 0 && (
                <div className="empty-state-v2">
                    <div className="empty-illu" aria-hidden="true">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </div>
                    <h3>No delivered projects yet</h3>
                    <p>Once a project is approved and signed off, it lands here as part of your portfolio.</p>
                    <a href="/my-queue" className="empty-cta" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>View active queue</a>
                </div>
            )}

            <div className="del-grid">
                {projects.map(p => {
                    const tag = tagLabel(p);
                    const tagColor = TAG_COLORS[tag] || 'var(--ink-muted)';
                    return (
                        <div key={p.id} className="del-card">
                            <div className="del-card-thumb">
                                <div className="del-tag" style={{ background: tagColor }}>{tag}</div>
                                <div className="del-play">{PLAY_ICON}</div>
                                <div className="del-thumb-overlay" />
                            </div>
                            <div className="del-card-body">
                                <div className="del-card-name">{p.name}</div>
                                <div className="del-card-client">
                                    {p.clientName || 'Unknown client'}
                                    {p.completionDate && ` · delivered ${new Date(p.completionDate).toLocaleDateString('en-US', { month:'short', day:'numeric' })}`}
                                </div>
                                <div className="del-card-stats">
                                    {p.turnaroundDays != null && (
                                        <div className="del-stat"><span className="del-stat-label">TURNAROUND</span><span className="del-stat-val">{p.turnaroundDays}d</span></div>
                                    )}
                                    <div className="del-stat"><span className="del-stat-label">REVISIONS</span><span className="del-stat-val">{p.revisionCount}</span></div>
                                    {p.rating != null && (
                                        <div className="del-stat">
                                            <span className="del-stat-label">RATING</span>
                                            <span className="del-stat-stars">
                                                {Array.from({ length: 5 }, (_, i) => (
                                                    <span key={i} style={{ color: i < Math.round(p.rating!) ? 'var(--warn)' : 'var(--hairline)' }}>{STAR}</span>
                                                ))}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
