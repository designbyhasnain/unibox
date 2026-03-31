'use client';
import { useState, useRef, useEffect } from 'react';

export default function NumberCell({ value, onChange }: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() || '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <div className="ep-cell-text" onClick={() => { setDraft(value?.toString() || ''); setEditing(true); }}>
        {value != null ? value : <span className="ep-cell-empty">—</span>}
      </div>
    );
  }

  return (
    <input
      ref={ref}
      type="number"
      className="ep-cell-input"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const n = parseFloat(draft);
        const newVal = isNaN(n) ? null : n;
        if (newVal !== value) onChange(newVal);
      }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(value?.toString() || ''); setEditing(false); } }}
    />
  );
}
