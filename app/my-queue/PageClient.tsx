'use client';
import { useState, useEffect, useMemo } from 'react';
import { getEditorMyQueueData, type EditorQueueProject } from '../../lib/projects/editorStats';
import EditorProjectDetail from '../components/editor/EditorProjectDetail';

const STATUS_PILL: Record<string, { label: string; fg: string; bg: string }> = {
    IN_PROGRESS: { label: 'EDITING',   fg: '#a78bfa', bg: 'rgba(167, 139, 250, 0.14)' },
    IN_REVISION: { label: 'REVISIONS', fg: '#f97316', bg: 'rgba(249, 115, 22, 0.14)' },
    DOWNLOADING: { label: 'DELIVERY',  fg: '#22c55e', bg: 'rgba(34, 197, 94, 0.14)' },
    DOWNLOADED:  { label: 'DELIVERY',  fg: '#22c55e', bg: 'rgba(34, 197, 94, 0.14)' },
    ON_HOLD:     { label: 'ON HOLD',   fg: '#9ca3af', bg: 'rgba(156, 163, 175, 0.14)' },
};

const PRIORITY_PILL: Record<string, { fg: string; bg: string }> = {
    HIGH:   { fg: '#f97316', bg: 'rgba(249, 115, 22, 0.14)' },
    MEDIUM: { fg: '#eab308', bg: 'rgba(234, 179, 8, 0.14)' },
    LOW:    { fg: '#9ca3af', bg: 'rgba(156, 163, 175, 0.12)' },
};

const FILTERS = [
    { id: 'all',        label: 'All' },
    { id: 'this-week',  label: 'Due this week' },
    { id: 'revisions',  label: 'In Revisions' },
    { id: 'blocked',    label: 'Blocked' },
] as const;

type FilterId = typeof FILTERS[number]['id'];

function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function relDue(iso: string | null) {
    if (!iso) return { text: '—', overdue: false };
    const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
    const abs = Math.abs(diff);
    const text = diff < 0 ? `${abs}d overdue` : diff === 0 ? 'Today' : `in ${diff}d`;
    return { text, overdue: diff < 0 };
}

const EXPORT_ICON = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;

export default function MyQueueClient() {
    const [projects, setProjects] = useState<EditorQueueProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterId>('all');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const d = await getEditorMyQueueData();
            if (!cancelled) { setProjects(d.projects); setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, []);

    // Week-bounds for the "Due this week" filter
    const { weekStart, weekEnd } = useMemo(() => {
        const now = new Date();
        const dow = now.getDay();
        const offset = dow === 0 ? -6 : 1 - dow;
        const start = new Date(now); start.setDate(now.getDate() + offset); start.setHours(0,0,0,0);
        const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
        return { weekStart: start, weekEnd: end };
    }, []);

    // Single-pass instant filter — no debounce, no server roundtrip.
    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return projects.filter(p => {
            if (filter === 'this-week') {
                if (!p.dueDate) return false;
                const d = new Date(p.dueDate);
                if (d < weekStart || d > weekEnd) return false;
            } else if (filter === 'revisions') {
                if (p.progress !== 'IN_REVISION') return false;
            } else if (filter === 'blocked') {
                if (p.dataChecked && p.hardDrive) return false;
            }
            if (q) {
                const hay = `${p.name} ${p.clientName ?? ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [projects, filter, search, weekStart, weekEnd]);

    return (
        <div className="mq-page">
            <div className="mq-header">
                <div>
                    <h1 className="mq-title">Your queue <span className="mq-count">· {visible.length} job{visible.length === 1 ? '' : 's'}</span></h1>
                    <p className="mq-subtitle">Sorted by due date · scoped to jobs assigned to you</p>
                </div>
                <div className="mq-header-actions">
                    <button className="mq-btn-icon" title="Export">{EXPORT_ICON} Export</button>
                </div>
            </div>

            <div className="mq-toolbar">
                <div className="mq-filters">
                    {FILTERS.map(f => (
                        <button
                            key={f.id}
                            className={`mq-filter-btn${filter === f.id ? ' active' : ''}`}
                            onClick={() => setFilter(f.id)}
                        >{f.label}</button>
                    ))}
                </div>
                <input
                    className="mq-search"
                    placeholder="Search projects…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            <div className="mq-table-wrap">
                <table className="mq-table mq-table-slim">
                    <thead>
                        <tr>
                            <th className="mq-th mq-th-date">DATE</th>
                            <th className="mq-th mq-th-project">PROJECT NAME</th>
                            <th className="mq-th mq-th-status">STATUS</th>
                            <th className="mq-th mq-th-priority">PRIORITY</th>
                            <th className="mq-th mq-th-due">DUE DATE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={5} className="mq-loading-cell">Loading…</td></tr>}
                        {!loading && visible.length === 0 && (
                            <tr><td colSpan={5} className="mq-empty-cell">
                                {projects.length === 0 ? 'No active jobs assigned to you.' : 'No projects match this filter.'}
                            </td></tr>
                        )}
                        {!loading && visible.map(p => {
                            const status = STATUS_PILL[p.progress] ?? { label: p.progress, fg: '#9ca3af', bg: 'rgba(156, 163, 175, 0.12)' };
                            const due = relDue(p.dueDate);
                            const pri = p.priority ? PRIORITY_PILL[p.priority] : null;
                            return (
                                <tr
                                    key={p.id}
                                    className={`mq-row${selectedId === p.id ? ' selected' : ''}`}
                                    onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                                >
                                    <td className="mq-td mq-td-date">{fmtDate(p.date)}</td>
                                    <td className="mq-td mq-td-project">
                                        <div className="mq-proj-name">{p.name}</div>
                                        {p.clientName && <div className="mq-proj-client">{p.clientName}</div>}
                                    </td>
                                    <td className="mq-td">
                                        <span className="mq-status-pill" style={{ color: status.fg, background: status.bg }}>
                                            {status.label}
                                        </span>
                                    </td>
                                    <td className="mq-td">
                                        {pri ? (
                                            <span className="mq-priority-pill" style={{ color: pri.fg, background: pri.bg }}>
                                                {p.priority}
                                            </span>
                                        ) : <span className="mq-no-priority">—</span>}
                                    </td>
                                    <td className="mq-td">
                                        <div className={`mq-due${due.overdue ? ' overdue' : ''}`}>{fmtDate(p.dueDate)}</div>
                                        <div className="mq-due-rel">{due.text}</div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <EditorProjectDetail projectId={selectedId} onClose={() => setSelectedId(null)} />
        </div>
    );
}
