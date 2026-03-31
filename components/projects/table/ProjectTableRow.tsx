'use client';
import React from 'react';
import type { ProjectWithCommentCount, ProjectProgress, ProjectPriority, AMReview } from '../../../lib/projects/types';
import { TABLE_COLUMNS } from '../../../lib/projects/constants';
import type { ColumnWidths } from '../../../lib/projects/types';
import TextCell from '../cells/TextCell';
import NumberCell from '../cells/NumberCell';
import DateCell from '../cells/DateCell';
import CheckboxCell from '../cells/CheckboxCell';
import ProgressCell from '../cells/ProgressCell';
import PriorityCell from '../cells/PriorityCell';
import TagsCell from '../cells/TagsCell';
import AMReviewCell from '../cells/AMReviewCell';
import HardDriveCell from '../cells/HardDriveCell';
import PersonCell from '../cells/PersonCell';
import PaidCell from '../cells/PaidCell';

type Props = {
  project: ProjectWithCommentCount;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (field: string, value: unknown) => void;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  columnWidths: ColumnWidths;
};

function ProjectTableRow({ project, selected, onSelect, onUpdate, onOpen, onDuplicate, onDelete, columnWidths }: Props) {
  const p = project;
  const w = (id: string) => columnWidths[id] || TABLE_COLUMNS.find(c => c.id === id)?.width || 100;

  const renderCell = (col: (typeof TABLE_COLUMNS)[number]) => {
    const key = col.id as string;
    const val = (p as Record<string, unknown>)[key];
    switch (col.type) {
      case 'checkbox':
        if (col.id === 'select') return <CheckboxCell value={selected} onChange={onSelect} />;
        return <CheckboxCell value={!!val} onChange={v => onUpdate(col.id, v)} />;
      case 'text':
        return <TextCell value={(val as string) || null} onChange={v => onUpdate(col.id, v)} primary={'primary' in col && !!col.primary} />;
      case 'number':
        return <NumberCell value={val as number | null} onChange={v => onUpdate(col.id, v)} />;
      case 'date':
      case 'datetime':
        return <DateCell value={(val as string) || null} onChange={v => onUpdate(col.id, v)} />;
      case 'progress':
        return <ProgressCell value={p.progress} onChange={v => onUpdate('progress', v)} />;
      case 'priority':
        return <PriorityCell value={p.priority} onChange={v => onUpdate('priority', v)} />;
      case 'tags':
        return <TagsCell value={p.tags || []} onChange={v => onUpdate('tags', v)} />;
      case 'amreview':
        return <AMReviewCell value={p.amReview} onChange={v => onUpdate('amReview', v)} />;
      case 'harddrive':
        return <HardDriveCell value={p.hardDrive} onChange={v => onUpdate('hardDrive', v)} />;
      case 'paid':
        return <PaidCell value={(val as string) || null} onChange={v => onUpdate('paid', v)} />;
      case 'person':
        return <PersonCell value={(val as string) || null} onChange={v => onUpdate(col.id, v)} />;
    }
  };

  return (
    <div className={`ep-row ${selected ? 'ep-row-selected' : ''}`}>
      {TABLE_COLUMNS.map(col => (
        <div
          key={col.id}
          className="ep-cell"
          style={{ width: w(col.id), minWidth: w(col.id), maxWidth: w(col.id) }}
          onClick={'primary' in col && col.primary ? (e) => { e.stopPropagation(); onOpen(); } : undefined}
        >
          {renderCell(col)}
        </div>
      ))}
      <div className="ep-row-actions">
        <button className="ep-row-action-btn" onClick={e => { e.stopPropagation(); onOpen(); }} title="Open">↗</button>
        <button className="ep-row-action-btn" onClick={e => { e.stopPropagation(); onDuplicate(); }} title="Duplicate">⧉</button>
        <button className="ep-row-action-btn ep-row-action-danger" onClick={e => { e.stopPropagation(); onDelete(); }} title="Delete">✕</button>
      </div>
    </div>
  );
}

export default React.memo(ProjectTableRow, (prev, next) =>
  prev.project.id === next.project.id &&
  prev.project.updatedAt === next.project.updatedAt &&
  prev.selected === next.selected &&
  prev.project.progress === next.project.progress &&
  prev.project.isChecked === next.project.isChecked
);
