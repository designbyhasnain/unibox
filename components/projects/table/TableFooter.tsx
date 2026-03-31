'use client';
import { useMemo } from 'react';
import { format } from 'date-fns';
import type { ProjectWithCommentCount } from '../../../lib/projects/types';

export default function TableFooter({ projects, onCreateNew }: { projects: ProjectWithCommentCount[]; onCreateNew: () => void }) {
  const stats = useMemo(() => {
    const dates = projects.map(p => p.date).filter(Boolean).map(d => new Date(d!).getTime());
    const minDate = dates.length ? format(new Date(Math.min(...dates)), 'MMM d') : '—';
    const maxDate = dates.length ? format(new Date(Math.max(...dates)), 'MMM d, yyyy') : '—';
    const uniqueClients = new Set(projects.map(p => p.clientName).filter(Boolean)).size;
    const sum = projects.reduce((s, p) => s + (p.initialProjectValue || 0), 0);
    return { range: `${minDate} — ${maxDate}`, uniqueClients, count: projects.length, sum };
  }, [projects]);

  return (
    <div className="ep-footer">
      <button className="ep-footer-new" onClick={onCreateNew}>+ New</button>
      <div className="ep-footer-stats">
        <span className="ep-footer-item"><strong>RANGE</strong> {stats.range}</span>
        <span className="ep-footer-item"><strong>UNIQUE</strong> {stats.uniqueClients}</span>
        <span className="ep-footer-item"><strong>COUNT</strong> {stats.count}</span>
        <span className="ep-footer-item"><strong>SUM</strong> {stats.sum.toLocaleString()}</span>
      </div>
    </div>
  );
}
