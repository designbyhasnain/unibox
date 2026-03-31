'use client';
import { useState, useRef, useEffect } from 'react';
import { AM_REVIEW_CONFIG } from '../../../lib/projects/constants';
import type { AMReview } from '../../../lib/projects/types';

const ALL = Object.keys(AM_REVIEW_CONFIG) as AMReview[];

export default function AMReviewCell({ value, onChange }: {
  value: AMReview;
  onChange: (v: AMReview) => void;
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

  const cfg = value ? AM_REVIEW_CONFIG[value] : null;
  const fallback = AM_REVIEW_CONFIG['NO_ISSUE'];

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <span className="ep-pill" style={{ background: (cfg || fallback).bg, color: (cfg || fallback).color }} onClick={e => { e.stopPropagation(); setOpen(!open); }}>
        {(cfg || fallback).label}
      </span>
      {open && (
        <div className="ep-dropdown">
          {ALL.map(v => {
            const c = AM_REVIEW_CONFIG[v];
            return (
              <div key={v} className="ep-dropdown-item" onClick={e => { e.stopPropagation(); onChange(v); setOpen(false); }}>
                <span className="ep-pill" style={{ background: c.bg, color: c.color }}>{c.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
