'use client';
import { useState, useRef, useEffect } from 'react';

export default function TextCell({ value, onChange, primary }: {
  value: string | null;
  onChange: (v: string) => void;
  primary?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <div
        className="ep-cell-text"
        onClick={() => { setDraft(value || ''); setEditing(true); }}
        style={primary ? { fontWeight: 600 } : undefined}
      >
        {value || <span className="ep-cell-empty">—</span>}
      </div>
    );
  }

  return (
    <input
      ref={ref}
      className="ep-cell-input"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== (value || '')) onChange(draft); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); } }}
    />
  );
}
