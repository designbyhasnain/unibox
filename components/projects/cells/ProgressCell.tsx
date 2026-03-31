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

  const cfgMap: Record<string, { label: string; bg: string; color: string }> = PROGRESS_CONFIG;
  const fallback = cfgMap['ON_HOLD'] ?? { label: 'On Hold', bg: '#f5c0c0', color: '#8b2020' };
  const cfg = value ? cfgMap[value] ?? fallback : fallback;

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
            const c = cfgMap[p] ?? fallback;
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
