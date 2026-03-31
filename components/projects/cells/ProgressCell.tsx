'use client';
import { useState, useRef, useEffect } from 'react';
import { PROGRESS_CONFIG } from '../../../lib/projects/constants';
import type { ProjectProgress } from '../../../lib/projects/types';

const ALL_PROGRESS = Object.keys(PROGRESS_CONFIG) as ProjectProgress[];

export default function ProgressCell({ value, onChange }: {
  value: ProjectProgress;
  onChange: (v: ProjectProgress) => void;
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

  const cfg = value ? PROGRESS_CONFIG[value] : null;
  const fallback = PROGRESS_CONFIG['ON_HOLD'];

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <span
        className="ep-pill"
        style={{ background: (cfg || fallback).bg, color: (cfg || fallback).color }}
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
      >
        {(cfg || fallback).label}
      </span>
      {open && (
        <div className="ep-dropdown">
          {ALL_PROGRESS.map(p => {
            const c = PROGRESS_CONFIG[p];
            return (
              <div
                key={p}
                className="ep-dropdown-item"
                onClick={e => { e.stopPropagation(); onChange(p); setOpen(false); }}
              >
                <span className="ep-pill" style={{ background: c.bg, color: c.color }}>{c.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
