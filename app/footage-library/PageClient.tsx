'use client';
import { useEffect, useMemo, useState } from 'react';
import { getEditorFootageData, type EditorFootageData, type EditorFootageProject } from '../../lib/projects/editorStats';

function avatarColor(s: string) {
    const p = ['#7c3aed', '#0891b2', '#d97706', '#dc2626', '#059669', '#db2777', '#0284c7'];
    let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return p[Math.abs(h) % p.length];
}
function initials(s: string) { return (s || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

const SEARCH_ICON = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;

function openFootage(p: EditorFootageProject) {
    const url = (p.rawDataUrl && /^https?:\/\//i.test(p.rawDataUrl)) ? p.rawDataUrl
              : (p.hardDrive && /^https?:\/\//i.test(p.hardDrive)) ? p.hardDrive
              : null;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

export default function FootageLibraryClient() {
    const [data, setData] = useState<EditorFootageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => { getEditorFootageData().then(d => { setData(d); setLoading(false); }); }, []);

    const visible = useMemo(() => {
        const list = data?.projects ?? [];
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.clientName ?? '').toLowerCase().includes(q) ||
            (p.hardDrive ?? '').toLowerCase().includes(q)
        );
    }, [data, search]);

    return (
        <div className="fl-page">
            <div className="fl-header">
                <div>
                    <h1 className="fl-title">
                        Raw footage <span className="fl-meta">· {data?.totalSizeLabel || '—'} across {data?.bucketCount ?? 0} bucket{(data?.bucketCount ?? 0) === 1 ? '' : 's'}</span>
                    </h1>
                    <p className="fl-subtitle">
                        Synced from project hard drives · {data?.pendingCount ?? 0} project{(data?.pendingCount ?? 0) === 1 ? '' : 's'} awaiting upload
                    </p>
                </div>
                <div className="fl-search">
                    {SEARCH_ICON}
                    <input
                        type="search"
                        placeholder="Search filename, client, drive…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {loading && <div className="fl-empty">Loading footage…</div>}
            {!loading && visible.length === 0 && (
                <div className="empty-state-v2">
                    <div className="empty-illu" aria-hidden="true">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    </div>
                    <h3>{data && data.projects.length === 0 ? 'No projects assigned yet' : 'No footage matches that search'}</h3>
                    <p>{data && data.projects.length === 0
                        ? 'When a project is assigned to you, links to its raw footage and hard-drive references will live here.'
                        : 'Try a shorter query, or clear the search to see all assigned projects.'}</p>
                </div>
            )}

            <div className="fl-grid">
                {visible.map(p => (
                    <div key={p.id} className={`fl-card ${p.isOpenable ? 'fl-card-clickable' : ''}`} onClick={() => p.isOpenable && openFootage(p)}>
                        <div className="fl-card-head">
                            <div className="fl-card-meta">
                                <div className="fl-avatar" style={{ background: avatarColor(p.clientName || p.name) }}>
                                    {initials(p.clientName || p.name)}
                                </div>
                                <div>
                                    <div className="fl-card-title">{p.name}</div>
                                    <div className="fl-card-sub">{p.clientName || 'Unknown client'}</div>
                                </div>
                            </div>
                            <span className={`fl-status fl-status-${p.status.toLowerCase()}`}>
                                <span className="fl-status-dot" />
                                {p.status === 'SYNCED' ? 'synced' : 'pending'}
                            </span>
                        </div>
                        <div className="fl-stats">
                            <div className="fl-stat">
                                <span className="fl-stat-k">SIZE</span>
                                <span className="fl-stat-v">{p.sizeInGbs && p.sizeInGbs !== '0' ? p.sizeInGbs : '—'}</span>
                            </div>
                            <div className="fl-stat">
                                <span className="fl-stat-k">DRIVE</span>
                                <span className="fl-stat-v fl-drive">{p.hardDrive || '—'}</span>
                            </div>
                        </div>
                        {p.isOpenable && (
                            <button className="fl-open-btn" onClick={e => { e.stopPropagation(); openFootage(p); }}>
                                Open footage →
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
