'use client';
import { useState, useRef, useEffect } from 'react';
import { PRIORITY_CONFIG } from '../../../lib/projects/constants';
import type { ProjectPriority } from '../../../lib/projects/types';

const ALL_PRIORITY = Object.keys(PRIORITY_CONFIG) as ProjectPriority[];

export default function PriorityCell({ value, onChange }: {
  value: ProjectPriority | null;
  onChange: (v: ProjectPriority | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const cfg = value ? (PRIORITY_CONFIG as Record<string, { label: string; bg: string; color: string }>)[value] : null;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <span
        className="ep-pill"
        style={cfg ? { background: cfg.bg, color: cfg.color } : { opacity: 0.4 }}
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
      >
        {cfg ? cfg.label : '—'}
      </span>
      {open && (
        <div className="ep-dropdown">
          {ALL_PRIORITY.map(p => {
            const c = (PRIORITY_CONFIG as Record<string, { label: string; bg: string; color: string }>)[p] || { label: p, bg: '#eee', color: '#333' };
            return (
              <div key={p} className="ep-dropdown-item" onClick={e => { e.stopPropagation(); onChange(p); setOpen(false); }}>
                <span className="ep-pill" style={{ background: c.bg, color: c.color }}>{c.label}</span>
              </div>
            );
          })}
          <div className="ep-dropdown-item" onClick={e => { e.stopPropagation(); onChange(null); setOpen(false); }}>
            <span style={{ opacity: 0.5 }}>None</span>
          </div>
        </div>
      )}
    </div>
  );
}
