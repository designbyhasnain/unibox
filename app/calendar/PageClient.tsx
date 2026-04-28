'use client';
import { useState, useEffect } from 'react';
import { getEditorMyQueueData, type EditorQueueProject } from '../../lib/projects/editorStats';
import Link from 'next/link';

// Priority drives the card accent in the design ("Color = priority").
const PRIORITY_ACCENT: Record<string, string> = {
    HIGH:   '#a78bfa',
    MEDIUM: '#f59e0b',
    LOW:    '#9ca3af',
};
const DEFAULT_ACCENT = '#a78bfa'; // Purple — the design's editor-workstation accent

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function CalendarClient() {
    const [projects, setProjects] = useState<EditorQueueProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

    useEffect(() => {
        // Same source as My Queue → identity scope is already user-only and finance-free.
        getEditorMyQueueData().then(d => { setProjects(d.projects); setLoading(false); });
    }, []);

    const year = month.getFullYear(), mon = month.getMonth();
    const firstDay = new Date(year, mon, 1).getDay();
    const daysInMonth = new Date(year, mon + 1, 0).getDate();
    const today = new Date();

    const eventsByDay: Record<number, EditorQueueProject[]> = {};
    for (const p of projects) {
        if (!p.dueDate) continue;
        const d = new Date(p.dueDate);
        if (d.getFullYear() === year && d.getMonth() === mon) {
            const day = d.getDate();
            if (!eventsByDay[day]) eventsByDay[day] = [];
            eventsByDay[day].push(p);
        }
    }

    const cells: Array<{ day: number | null }> = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });

    return (
        <div className="cal-page">
            <div className="cal-header">
                <div>
                    <h1 className="cal-title">{MONTHS[mon]} {year}</h1>
                    <p className="cal-subtitle">Your project due dates</p>
                </div>
                <div className="cal-nav">
                    <button className="cal-nav-btn" onClick={() => setMonth(new Date(year, mon - 1, 1))}>‹</button>
                    <button className="cal-nav-btn" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</button>
                    <button className="cal-nav-btn" onClick={() => setMonth(new Date(year, mon + 1, 1))}>›</button>
                </div>
            </div>

            {loading ? <div className="cal-loading">Loading…</div> : (
                <div className="cal-grid-wrap">
                    <div className="cal-day-headers">
                        {DAYS.map(d => <div key={d} className="cal-day-name">{d}</div>)}
                    </div>
                    <div className="cal-grid">
                        {cells.map((cell, i) => {
                            if (!cell.day) return <div key={i} className="cal-cell cal-cell-empty" />;
                            const isToday = today.getDate() === cell.day && today.getMonth() === mon && today.getFullYear() === year;
                            const events = eventsByDay[cell.day] || [];
                            return (
                                <div key={i} className={`cal-cell${isToday ? ' today' : ''}`}>
                                    <span className="cal-cell-num">{cell.day}</span>
                                    {events.map(e => {
                                        const accent = (e.priority && PRIORITY_ACCENT[e.priority]) || DEFAULT_ACCENT;
                                        return (
                                            <Link
                                                key={e.id}
                                                href="/my-queue"
                                                className="cal-event"
                                                style={{ borderLeftColor: accent }}
                                            >
                                                <span className="cal-event-title">{e.name}</span>
                                                {e.clientName && <span className="cal-event-meta">{e.clientName}</span>}
                                            </Link>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                    <div className="cal-legend">
                        <span className="cal-legend-label">Color = priority</span>
                        <span className="cal-legend-dot" style={{ background: PRIORITY_ACCENT.HIGH }} /> High
                        <span className="cal-legend-dot" style={{ background: PRIORITY_ACCENT.MEDIUM }} /> Med
                        <span className="cal-legend-dot" style={{ background: PRIORITY_ACCENT.LOW }} /> Low
                    </div>
                </div>
            )}
        </div>
    );
}
