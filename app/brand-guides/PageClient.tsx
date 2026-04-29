'use client';
import { useEffect, useMemo, useState } from 'react';
import { getEditorBrandGuidesData, type EditorBrandGuide } from '../../lib/projects/editorStats';

function avatarColor(s: string) {
    const p = ['#7c3aed', '#0891b2', '#d97706', '#dc2626', '#059669', '#db2777', '#0284c7'];
    let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return p[Math.abs(h) % p.length];
}
function initials(s: string) { return (s || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

const SEARCH_ICON = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;

// Maps the design's "LUT / MUSIC / PACE / DON'T" rows onto the fields we
// actually have on edit_projects. The labels mirror the design's vocabulary
// while the values come from real columns.
function buildRows(g: EditorBrandGuide) {
    const rows: { k: string; v: string; danger?: boolean }[] = [];
    if (g.briefLength)      rows.push({ k: 'BRIEF',    v: g.briefLength });
    if (g.songPreferences)  rows.push({ k: 'MUSIC',    v: g.songPreferences });
    if (g.software)         rows.push({ k: 'SOFTWARE', v: g.software });
    if (g.notes)            rows.push({ k: 'NOTES',    v: g.notes });
    return rows;
}

export default function BrandGuidesClient() {
    const [guides, setGuides] = useState<EditorBrandGuide[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => { getEditorBrandGuidesData().then(d => { setGuides(d.guides); setLoading(false); }); }, []);

    const visible = useMemo(() => {
        const list = guides ?? [];
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter(g =>
            g.clientName.toLowerCase().includes(q) ||
            (g.notes ?? '').toLowerCase().includes(q) ||
            (g.songPreferences ?? '').toLowerCase().includes(q)
        );
    }, [guides, search]);

    return (
        <div className="bg-page">
            <div className="bg-header">
                <div>
                    <h1 className="bg-title">Client brand guides</h1>
                    <p className="bg-subtitle">Brief preferences, music, software, and notes — pulled from your active projects.</p>
                </div>
                <div className="bg-search">
                    {SEARCH_ICON}
                    <input
                        type="search"
                        placeholder="Search clients or style notes…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {loading && <div className="bg-empty">Loading brand guides…</div>}
            {!loading && visible.length === 0 && (
                <div className="empty-state-v2">
                    <div className="empty-illu" aria-hidden="true">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                    </div>
                    <h3>{guides && guides.length === 0 ? 'No style notes yet' : 'No clients match that search'}</h3>
                    <p>{guides && guides.length === 0
                        ? 'As project briefs, music preferences, and notes are filled in, each client gets a brand guide page right here.'
                        : 'Try a shorter query or clear the search to see all client style notes.'}</p>
                </div>
            )}

            <div className="bg-grid">
                {visible.map(g => {
                    const rows = buildRows(g);
                    return (
                        <div key={g.clientName} className="bg-card">
                            <div className="bg-card-head">
                                <div className="bg-avatar" style={{ background: avatarColor(g.clientName) }}>
                                    {initials(g.clientName)}
                                </div>
                                <div className="bg-card-meta">
                                    <div className="bg-card-name">{g.clientName}</div>
                                    <div className="bg-card-sub">{g.projectCount} project{g.projectCount === 1 ? '' : 's'}</div>
                                </div>
                            </div>
                            {rows.length === 0 ? (
                                <div className="bg-card-empty">No style notes recorded for this client yet.</div>
                            ) : (
                                <div className="bg-card-rows">
                                    {rows.map(r => (
                                        <div key={r.k} className="bg-row">
                                            <span className="bg-row-k">{r.k}</span>
                                            <span className="bg-row-v">{r.v}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
