'use client';
import { useState, useRef, useEffect } from 'react';
import { HARD_DRIVE_COLORS, HARD_DRIVE_OPTIONS } from '../../../lib/projects/constants';

export default function HardDriveCell({ value, onChange }: {
  value: string | null;
  onChange: (v: string | null) => void;
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

  const cfg = value ? HARD_DRIVE_COLORS[value] : null;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <span
        className="ep-pill"
        style={cfg ? { background: cfg.bg, color: cfg.color } : { opacity: 0.4 }}
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
      >
        {value || '—'}
      </span>
      {open && (
        <div className="ep-dropdown">
          {HARD_DRIVE_OPTIONS.map(hd => {
            const c = HARD_DRIVE_COLORS[hd];
            return (
              <div key={hd} className="ep-dropdown-item" onClick={e => { e.stopPropagation(); onChange(hd); setOpen(false); }}>
                <span className="ep-pill" style={c ? { background: c.bg, color: c.color } : {}}>{hd}</span>
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
