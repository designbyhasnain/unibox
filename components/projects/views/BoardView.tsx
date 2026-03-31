'use client';
import { PROGRESS_CONFIG, BOARD_COLUMN_ORDER } from '../../../lib/projects/constants';
import type { ProjectWithCommentCount, ProjectProgress } from '../../../lib/projects/types';
import { format } from 'date-fns';

type Props = {
  projects: ProjectWithCommentCount[];
  onUpdate: (id: string, field: string, value: unknown) => void;
  onOpen: (id: string) => void;
  onCreateNew: (progress: ProjectProgress) => void;
};

export default function BoardView({ projects, onUpdate, onOpen, onCreateNew }: Props) {
  return (
    <div className="ep-board">
      {BOARD_COLUMN_ORDER.map(status => {
        const cfg = PROGRESS_CONFIG[status];
        const cards = projects.filter(p => p.progress === status);

        return (
          <div key={status} className="ep-board-col">
            <div className="ep-board-col-header">
              <span className="ep-pill" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
              <span className="ep-board-col-count">{cards.length}</span>
            </div>
            <div className="ep-board-cards">
              {cards.map(card => {
                const overdue = card.dueDate && new Date(card.dueDate) < new Date();
                return (
                  <div key={card.id} className="ep-board-card" onClick={() => onOpen(card.id)}>
                    <div className="ep-board-card-name">{card.name}</div>
                    {card.clientName && <div className="ep-board-card-client">{card.clientName}</div>}
                    <div className="ep-board-card-meta">
                      {card.dueDate && (
                        <span className={`ep-board-card-due ${overdue ? 'ep-board-card-overdue' : ''}`}>
                          📅 {format(new Date(card.dueDate), 'MMM d')}
                        </span>
                      )}
                      {card.editor && <span className="ep-board-card-editor">👤 {card.editor}</span>}
                    </div>
                    {card.tags.length > 0 && (
                      <div className="ep-board-card-tags">
                        {card.tags.slice(0, 2).map(t => <span key={t} className="ep-tag-small">{t}</span>)}
                        {card.tags.length > 2 && <span className="ep-tag-small">+{card.tags.length - 2}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button className="ep-board-add" onClick={() => onCreateNew(status)}>+ New</button>
          </div>
        );
      })}
    </div>
  );
}
