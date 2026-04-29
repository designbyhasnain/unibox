'use client';
import { useState, useRef } from 'react';
import { PRIORITY_CONFIG } from '../../../lib/projects/constants';
import type { ProjectPriority } from '../../../lib/projects/types';
import Popover from './Popover';

const ALL_PRIORITY = Object.keys(PRIORITY_CONFIG) as ProjectPriority[];

export default function PriorityCell({ value, onChange }: {
  value: ProjectPriority | null;
  onChange: (v: ProjectPriority | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const cfg = value ? (PRIORITY_CONFIG as Record<string, { label: string; bg: string; color: string }>)[value] : null;

  return (
    <>
      <span
        ref={triggerRef}
        className="ep-pill"
        style={cfg ? { background: cfg.bg, color: cfg.color } : { opacity: 0.4 }}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      >
        {cfg ? cfg.label : '—'}
      </span>
      <Popover open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} minWidth={140}>
        <div className="ep-dropdown-inner">
          {ALL_PRIORITY.map(p => {
            const c = (PRIORITY_CONFIG as Record<string, { label: string; bg: string; color: string }>)[p] || { label: p, bg: 'var(--surface-2)', color: 'var(--ink-2)' };
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
      </Popover>
    </>
  );
}
