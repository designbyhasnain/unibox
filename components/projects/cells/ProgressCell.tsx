'use client';
import { useState, useRef } from 'react';
import { PROGRESS_CONFIG } from '../../../lib/projects/constants';
import type { ProjectProgress } from '../../../lib/projects/types';
import Popover from './Popover';

const ALL_PROGRESS = Object.keys(PROGRESS_CONFIG) as ProjectProgress[];

export default function ProgressCell({ value, onChange }: {
  value: ProjectProgress;
  onChange: (v: ProjectProgress) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const cfgMap: Record<string, { label: string; bg: string; color: string }> = PROGRESS_CONFIG;
  const fallback = cfgMap['ON_HOLD'] ?? { label: 'On Hold', bg: '#f5c0c0', color: '#8b2020' };
  const cfg = value ? cfgMap[value] ?? fallback : fallback;

  return (
    <>
      <span
        ref={triggerRef}
        className="ep-pill"
        style={{ background: (cfg || fallback).bg, color: (cfg || fallback).color }}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      >
        {(cfg || fallback).label}
      </span>
      <Popover open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} minWidth={140}>
        <div className="ep-dropdown-inner">
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
      </Popover>
    </>
  );
}
