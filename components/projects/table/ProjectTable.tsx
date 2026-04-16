'use client';
import { useCallback, useState } from 'react';
import type { ProjectWithCommentCount, ColumnWidths, ProjectSortField } from '../../../lib/projects/types';
import { TABLE_COLUMNS } from '../../../lib/projects/constants';
import ProjectTableHeader from './ProjectTableHeader';
import ProjectTableRow from './ProjectTableRow';
import TableFooter from './TableFooter';
import TablePagination from './TablePagination';

const EDITOR_HIDDEN_COLS = new Set(['clientEmail', 'initialProjectValue', 'totalAmount', 'paid', 'received1', 'reviewerValue']);

type Props = {
  projects: ProjectWithCommentCount[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onUpdate: (id: string, field: string, value: unknown) => void;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateNew: () => void;
  sortBy: ProjectSortField | null;
  sortOrder: 'asc' | 'desc';
  onSort: (field: ProjectSortField) => void;
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  isEditor?: boolean;
};

const COL_WIDTHS_KEY = 'unibox_project_col_widths';

export default function ProjectTable({
  projects, selectedIds, onToggleSelect, onUpdate, onOpen,
  onDuplicate, onDelete, onCreateNew, sortBy, sortOrder, onSort,
  page, totalPages, total, limit, onPageChange, isLoading, isEditor,
}: Props) {
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem(COL_WIDTHS_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const handleResize = useCallback((id: string, width: number) => {
    setColumnWidths(prev => {
      const next = { ...prev, [id]: width };
      try { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const visibleColumns = isEditor ? TABLE_COLUMNS.filter(c => !EDITOR_HIDDEN_COLS.has(c.id)) : [...TABLE_COLUMNS];
  const totalWidth = visibleColumns.reduce((s: number, c) => s + (columnWidths[c.id] || c.width), 0) + 100;

  return (
    <div className="ep-table-wrapper">
      <div className="ep-table-scroll">
        <div style={{ minWidth: totalWidth }}>
          <ProjectTableHeader
            columnWidths={columnWidths}
            onResize={handleResize}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={onSort}
            columns={isEditor ? visibleColumns : undefined}
          />
          <div className={isLoading ? 'ep-table-loading' : ''}>
            {projects.map(project => (
              <ProjectTableRow
                key={project.id}
                project={project}
                selected={selectedIds.has(project.id)}
                onSelect={() => onToggleSelect(project.id)}
                onUpdate={(field, val) => onUpdate(project.id, field, val)}
                onOpen={() => onOpen(project.id)}
                onDuplicate={() => onDuplicate(project.id)}
                onDelete={() => onDelete(project.id)}
                columnWidths={columnWidths}
                columns={isEditor ? visibleColumns : undefined}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="ep-table-footer-row">
        <TableFooter projects={projects} onCreateNew={onCreateNew} />
        <TablePagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}
