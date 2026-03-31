'use client';

export default function CheckboxCell({ value, onChange }: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="ep-cell-center" onClick={e => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={value}
        onChange={() => onChange(!value)}
        className="ep-checkbox"
      />
    </div>
  );
}
