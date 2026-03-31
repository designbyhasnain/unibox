'use client';
import { useState, useRef, useEffect } from 'react';
import { PAID_CONFIG } from '../../../lib/projects/constants';

const ALL_OPTIONS = Object.keys(PAID_CONFIG);

export default function PaidCell({ value, onChange }: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const cfg = value ? PAID_CONFIG[value] : null;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <span
        className="ep-pill"
        style={cfg ? { background: cfg.bg, color: cfg.color } : value ? { background: '#4a4a4a', color: '#fff' } : { opacity: 0.4 }}
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
      >
        {cfg?.label || value || '—'}
      </span>
      {open && (
        <div className="ep-dropdown" style={{ minWidth: 200 }}>
          <input
            ref={inputRef}
            className="ep-cell-input"
            placeholder="Select an option or create one"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && custom.trim()) {
                onChange(custom.trim());
                setCustom('');
                setOpen(false);
              }
            }}
            style={{ marginBottom: 4 }}
          />
          {ALL_OPTIONS.filter(o => !custom || o.toLowerCase().includes(custom.toLowerCase())).map(opt => {
            const c = PAID_CONFIG[opt];
            return (
              <div key={opt} className="ep-dropdown-item" onClick={e => { e.stopPropagation(); onChange(opt); setCustom(''); setOpen(false); }}>
                <span className="ep-pill" style={c ? { background: c.bg, color: c.color } : {}}>{c?.label || opt}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
