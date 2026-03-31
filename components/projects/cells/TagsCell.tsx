'use client';
import { useState, useRef, useEffect } from 'react';

const TAG_COLORS = ['#1a73e8','#e8711a','#1ae871','#e81a71','#711ae8','#e8d41a','#1abce8'];

function hashColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffffff;
  return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
}

export default function TagsCell({ value, onChange }: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
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

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div className="ep-tags-row" onClick={e => { e.stopPropagation(); setOpen(true); }}>
        {value.length === 0 && <span className="ep-cell-empty">—</span>}
        {value.slice(0, 2).map(t => (
          <span key={t} className="ep-tag" style={{ borderColor: hashColor(t), color: hashColor(t) }}>{t}</span>
        ))}
        {value.length > 2 && <span className="ep-tag-more">+{value.length - 2}</span>}
      </div>
      {open && (
        <div className="ep-dropdown" style={{ minWidth: 200 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 0' }}>
            {value.map(t => (
              <span key={t} className="ep-tag" style={{ borderColor: hashColor(t), color: hashColor(t) }}>
                {t}
                <span className="ep-tag-x" onClick={() => onChange(value.filter(v => v !== t))}>×</span>
              </span>
            ))}
          </div>
          <input
            ref={inputRef}
            className="ep-cell-input"
            placeholder="Add tag..."
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && draft.trim()) {
                if (!value.includes(draft.trim())) onChange([...value, draft.trim()]);
                setDraft('');
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
