'use client';
import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';

export default function DateCell({ value, onChange }: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.showPicker?.(); }, [editing]);

  const display = value ? format(new Date(value), 'MMM d, yyyy') : null;

  if (!editing) {
    return (
      <div className="ep-cell-text" onClick={() => setEditing(true)}>
        {display || <span className="ep-cell-empty">—</span>}
      </div>
    );
  }

  const inputVal = value ? new Date(value).toISOString().split('T')[0] : '';

  return (
    <input
      ref={ref}
      type="date"
      className="ep-cell-input"
      value={inputVal}
      onChange={e => {
        const v = e.target.value;
        onChange(v ? new Date(v).toISOString() : null);
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
    />
  );
}
