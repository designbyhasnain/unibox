'use client';
import TextCell from './TextCell';

export default function PersonCell({ value, onChange }: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  return <TextCell value={value} onChange={onChange} />;
}
