'use client';
import { useCallback, useRef } from 'react';
import { TABLE_COLUMNS } from '../../../lib/projects/constants';
import type { ColumnWidths, ProjectSortField } from '../../../lib/projects/types';

type Props = {
  columnWidths: ColumnWidths;
  onResize: (id: string, width: number) => void;
  sortBy: ProjectSortField | null;
  sortOrder: 'asc' | 'desc';
  onSort: (field: ProjectSortField) => void;
};

export default function ProjectTableHeader({ columnWidths, onResize, sortBy, sortOrder, onSort }: Props) {
  const dragRef = useRef<{ id: string; startX: number; startW: number } | null>(null);

  const handleMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startW = columnWidths[id] || TABLE_COLUMNS.find(c => c.id === id)?.width || 100;
    dragRef.current = { id, startX: e.clientX, startW };

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const newW = Math.max(40, dragRef.current.startW + (ev.clientX - dragRef.current.startX));
      onResize(dragRef.current.id, newW);
    };
    const handleUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [columnWidths, onResize]);

  return (
    <div className="ep-header-row">
      {TABLE_COLUMNS.map(col => {
        const w = columnWidths[col.id] || col.width;
        const isSorted = sortBy === col.id;
        const arrow = isSorted ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : '';
        const canSort = col.type !== 'checkbox' || col.id !== 'select';

        return (
          <div
            key={col.id}
            className="ep-header-cell"
            style={{ width: w, minWidth: w, maxWidth: w }}
            onClick={() => canSort && onSort(col.id as ProjectSortField)}
          >
            <span className="ep-header-label">{col.label}{arrow}</span>
            {!('fixed' in col && col.fixed) && (
              <div
                className="ep-resize-handle"
                onMouseDown={e => handleMouseDown(col.id, e)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
