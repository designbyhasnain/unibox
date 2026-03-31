'use client';
import { useState, useRef, useEffect } from 'react';

export default function UrlCell({ value, onChange }: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    if (!value) return <div className="ep-cell-text" onClick={() => { setDraft(''); setEditing(true); }}><span className="ep-cell-empty">—</span></div>;
    return (
      <div className="ep-cell-text" onDoubleClick={() => { setDraft(value); setEditing(true); }}>
        <a href={value} target="_blank" rel="noopener noreferrer" className="ep-link" onClick={e => e.stopPropagation()}>{value.replace(/^https?:\/\//, '').slice(0, 30)}</a>
      </div>
    );
  }

  return (
    <input
      ref={ref}
      className="ep-cell-input"
      value={draft}
      placeholder="https://..."
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== (value || '')) onChange(draft); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); } }}
    />
  );
}
