'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getEditorTodayData, type EditorTodayData, type EditorTodayProject } from '../../lib/projects/editorStats';
import EditorProjectDetail from './editor/EditorProjectDetail';

/* ── Helpers ─────────────────────────────────────────────── */

export const STATUS_MAP: Record<string, { label: string; dot: string; bar: string }> = {
    IN_PROGRESS: { label: 'EDITING',   dot: '#a78bfa', bar: 'linear-gradient(90deg, #8b5cf6 0%, #f97316 100%)' },
    IN_REVISION: { label: 'REVISIONS', dot: '#f97316', bar: '#f97316' },
    DOWNLOADING: { label: 'DELIVERY',  dot: '#22c55e', bar: '#22c55e' },
    DOWNLOADED:  { label: 'DELIVERY',  dot: '#22c55e', bar: '#22c55e' },
    ON_HOLD:     { label: 'ON HOLD',   dot: '#6b7280', bar: '#6b7280' },
    APPROVED:    { label: 'APPROVED',  dot: '#22c55e', bar: '#22c55e' },
    DONE:        { label: 'DONE',      dot: '#14b8a6', bar: '#14b8a6' },
};

export function avatarColor(s: string) {
    const palette = ['#7c3aed', '#0891b2', '#d97706', '#dc2626', '#059669', '#db2777', '#0284c7'];
    let h = 0;
    for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return palette[Math.abs(h) % palette.length];
}

export function initials(s: string) {
    return (s || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function relTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const h = diff / 3_600_000, d = diff / 86_400_000;
    if (h < 1)  return 'Just now';
    if (h < 24) return `${Math.floor(h)}h ago`;
    if (d < 2)  return 'Yesterday';
    if (d < 7)  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(iso).getDay()];
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dueBadge(dueDate: string | null) {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const diffDays = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
    const label = `Due ${due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
    if (diffDays < 0)  return { label: label.replace('Due ', 'Overdue · '), cls: 'ed-due-overdue' };
    if (diffDays <= 3) return { label, cls: 'ed-due-soon' };
    return { label, cls: 'ed-due-normal' };
}

/* ── Icons ───────────────────────────────────────────────── */

const ICONS = {
    sync: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
    plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    warn: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    arrow: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
};

/* ── Week Strip ──────────────────────────────────────────── */

function WeekStrip({ weekProjects }: { weekProjects: EditorTodayData['weekProjects'] }) {
    const today = new Date();
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + mondayOffset + i);
        return d;
    });
    return (
        <div className="ed-week-strip">
            <div className="ed-week-label">THIS WEEK</div>
            <div className="ed-week-tiles">
                {days.map((d, i) => {
                    const isToday = d.toDateString() === today.toDateString();
                    const isPast  = d < today && !isToday;
                    const ymd     = d.toISOString().slice(0, 10);
                    const events  = weekProjects.filter(p => p.dueDate?.slice(0, 10) === ymd);
                    return (
                        <div key={i} className={`ed-week-tile${isToday ? ' today' : ''}${isPast ? ' past' : ''}`}>
                            <span className="ed-week-day">{DAY_NAMES[i]}</span>
                            <span className="ed-week-num">{d.getDate()}</span>
                            {events.length > 0 && events[0] && (
                                <div className="ed-week-events">
                                    <span className="ed-week-dot" style={{ background: STATUS_MAP[events[0].progress]?.dot || '#f97316' }} />
                                    <span className="ed-week-event-name" title={events[0].name}>{events[0].name}</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ── Desk Card ───────────────────────────────────────────── */

function DeskCard({
    project,
    isSelected,
    onSelect,
}: {
    project: EditorTodayProject;
    isSelected: boolean;
    onSelect: () => void;
}) {
    const status  = STATUS_MAP[project.progress] ?? { label: project.progress, dot: '#6b7280', bar: '#6b7280' };
    const badge   = dueBadge(project.dueDate);
    const pct     = Math.min(100, Math.max(0, project.formulaPercent));
    const clrBg   = avatarColor(project.clientName || project.name);

    function handlePremiere(e: React.MouseEvent) {
        e.stopPropagation();
        // Match the drawer's resolution order: real URL field first, drive label fallback.
        const candidates = [project.rawDataUrl, project.hardDrive].filter(Boolean) as string[];
        const url = candidates.find(u => /^https?:\/\//i.test(u));
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        else onSelect(); // No URL set — open detail panel so admin can be notified.
    }

    return (
        <div
            className={`ed-desk-card${isSelected ? ' selected' : ''}`}
            onClick={onSelect}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onSelect()}
        >
            <div className="ed-desk-card-header">
                <div className="ed-desk-card-meta">
                    <div className="ed-desk-avatar" style={{ background: clrBg }}>{initials(project.clientName || 'C')}</div>
                    <div>
                        <div className="ed-desk-card-title">{project.name}</div>
                        <div className="ed-desk-card-sub">
                            {project.clientName || 'Unknown client'}
                            {project.sizeInGbs && project.sizeInGbs !== '0' ? ` · ${project.sizeInGbs}` : ''}
                        </div>
                    </div>
                </div>
                {badge && <span className={`ed-due-badge ${badge.cls}`}>{badge.label}</span>}
            </div>

            <div className="ed-desk-status-row">
                <div className="ed-status-badge">
                    <span className="ed-status-dot" style={{ background: status.dot }} />
                    <span className="ed-status-label">{status.label}</span>
                </div>
                <span className="ed-progress-pct">{Math.round(pct)}%</span>
            </div>

            <div className="ed-progress-track">
                <div className="ed-progress-fill" style={{ width: `${pct}%`, background: status.bar }} />
            </div>

            {project.latestComment && (
                <div className="ed-desk-comment">
                    <span className="ed-comment-text">&ldquo;{project.latestComment.content}&rdquo;</span>
                </div>
            )}

            <div className="ed-desk-actions" onClick={e => e.stopPropagation()}>
                <button className="ed-btn-premiere" onClick={handlePremiere}>Open in Premiere</button>
                <button className="ed-btn-upload" onClick={onSelect}>View details</button>
            </div>
        </div>
    );
}

/* ── Main ────────────────────────────────────────────────── */

export default function EditorTodayView() {
    const router = useRouter();
    const [data, setData]           = useState<EditorTodayData | null>(null);
    const [loading, setLoading]     = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);

    const reload = async () => {
        const d = await getEditorTodayData();
        setData(d);
        setLoading(false);
    };

    useEffect(() => { reload(); }, []);

    const handleSync = async () => {
        if (syncing) return;
        setSyncing(true);
        await reload();
        // Brief visual feedback before re-enabling the button.
        setTimeout(() => setSyncing(false), 600);
    };

    if (loading) {
        return (
            <div className="ed-today">
                <div className="ed-loading">
                    <div className="ed-loading-pulse" />
                    <span>Loading your workspace…</span>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const now      = new Date();
    const hour     = now.getHours();
    const greeting = `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${data.userName.split(' ')[0]}`;
    const dayStr   = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const jobCount = data.activeProjects.length;
    const noteCount = data.feedbackItems.length;
    const overPct  = Math.min(100, (data.weeklyLoadHours / data.weeklyCapacity) * 100);
    const overBooked = data.weeklyLoadHours > data.weeklyCapacity;

    return (
        <div className="ed-today">
            {/* Header */}
            <div className="ed-header">
                <div className="ed-header-left">
                    <h1 className="ed-greeting">{greeting}</h1>
                    <p className="ed-header-sub">
                        {dayStr}
                        {jobCount > 0 && ` · ${jobCount} job${jobCount !== 1 ? 's' : ''} on your desk`}
                        {noteCount > 0 && ` · ${noteCount} new note${noteCount !== 1 ? 's' : ''} from clients`}
                    </p>
                </div>
                <div className="ed-header-actions">
                    <button className="ed-btn-ghost" onClick={handleSync} disabled={syncing} title="Refresh project data">
                        {ICONS.sync} {syncing ? 'Syncing…' : 'Sync footage'}
                    </button>
                    <button className="ed-btn-primary" onClick={() => router.push('/my-queue')}>{ICONS.arrow} View all jobs</button>
                </div>
            </div>

            {/* Week strip */}
            <WeekStrip weekProjects={data.weekProjects} />

            {/* Two-column grid */}
            <div className="ed-main-grid">
                {/* Left: desk projects */}
                <div className="ed-desk-col">
                    <div className="ed-col-header">
                        <h2 className="ed-col-title">On your desk today</h2>
                        {jobCount > 2 && (
                            <button className="ed-col-link" onClick={() => router.push('/my-queue')}>
                                View all {jobCount} {ICONS.arrow}
                            </button>
                        )}
                    </div>
                    {data.activeProjects.length === 0 ? (
                        <div className="ed-empty">
                            All clear — no active projects.{' '}
                            <button className="ed-link" onClick={() => router.push('/my-queue')}>Check queue →</button>
                        </div>
                    ) : (
                        data.activeProjects.map(p => (
                            <DeskCard
                                key={p.id}
                                project={p}
                                isSelected={selectedId === p.id}
                                onSelect={() => setSelectedId(selectedId === p.id ? null : p.id)}
                            />
                        ))
                    )}
                </div>

                {/* Right: feedback */}
                <div className="ed-feedback-panel">
                    <div className="ed-col-header">
                        <h2 className="ed-col-title">
                            New feedback
                            {noteCount > 0 && <span className="ed-feedback-unread">{noteCount} unread</span>}
                        </h2>
                        {noteCount > 0 && (
                            <button className="ed-col-link" onClick={() => router.push('/revisions')}>
                                Open inbox {ICONS.arrow}
                            </button>
                        )}
                    </div>
                    {data.feedbackItems.length === 0 ? (
                        <div className="ed-empty">No new client notes.</div>
                    ) : (
                        data.feedbackItems.map((f, i) => (
                            <div
                                key={i}
                                className="ed-feedback-item clickable"
                                onClick={() => setSelectedId(f.projectId)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={e => e.key === 'Enter' && setSelectedId(f.projectId)}
                            >
                                <div className="ed-feedback-row">
                                    <div className="ed-feedback-avatar" style={{ background: avatarColor(f.authorName) }}>
                                        {initials(f.authorName)}
                                    </div>
                                    <div className="ed-feedback-meta">
                                        <span className="ed-feedback-author">{f.authorName}</span>
                                        <span className="ed-feedback-time">{relTime(f.createdAt)}</span>
                                    </div>
                                </div>
                                <div className="ed-feedback-project">{f.projectName}</div>
                                <div className="ed-feedback-body">&ldquo;{f.content}&rdquo;</div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Bottom row: blockers + weekly load */}
            <div className="ed-bottom-row">
                <div className="ed-blockers-card">
                    <h2 className="ed-col-title">
                        Blockers
                        {data.blockers.length > 0 && <span className="ed-blocker-tag">{data.blockers.length} open</span>}
                    </h2>
                    {data.blockers.length === 0 ? (
                        <div className="ed-empty ed-empty-sm">All clear — no blockers.</div>
                    ) : (
                        data.blockers.map(b => (
                            <div
                                key={b.id}
                                className="ed-blocker-item clickable"
                                onClick={() => setSelectedId(b.id)}
                                role="button"
                                tabIndex={0}
                            >
                                <span className="ed-blocker-name">{b.name}</span>
                                <span className="ed-blocker-reason">
                                    {ICONS.warn}
                                    {!b.dataChecked ? 'Footage not yet uploaded' : 'Missing drive link'}
                                </span>
                            </div>
                        ))
                    )}
                </div>

                <div className="ed-load-card">
                    <h2 className="ed-col-title">Weekly load</h2>
                    <div className="ed-load-row">
                        <span className={`ed-load-hours${overBooked ? ' overbooked' : ''}`}>
                            {Math.round(data.weeklyLoadHours)}h
                        </span>
                        <span className="ed-load-cap">of {data.weeklyCapacity}h capacity</span>
                        {overBooked && (
                            <span className="ed-overbooked-badge">
                                +{Math.round(data.weeklyLoadHours - data.weeklyCapacity)}h overbooked
                            </span>
                        )}
                    </div>
                    <div className="ed-load-track">
                        <div
                            className="ed-load-bar"
                            style={{
                                width: `${overPct}%`,
                                background: overBooked ? 'var(--danger)' : 'var(--coach)',
                            }}
                        />
                    </div>
                    <p className="ed-load-note">
                        {overBooked
                            ? `You're ${Math.round(data.weeklyLoadHours - data.weeklyCapacity)}h over this week.`
                            : `${Math.round(data.weeklyCapacity - data.weeklyLoadHours)}h remaining this week.`}
                    </p>
                    <button className="ed-load-link" onClick={() => router.push('/my-queue')}>
                        Manage queue {ICONS.arrow}
                    </button>
                </div>
            </div>

            {/* Detail drawer */}
            <EditorProjectDetail
                projectId={selectedId}
                onClose={() => setSelectedId(null)}
            />
        </div>
    );
}
