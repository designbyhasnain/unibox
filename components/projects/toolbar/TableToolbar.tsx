'use client';
import { useState } from 'react';

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  onImport: () => void;
  onCreateNew: () => void;
  selectedCount: number;
  onDeleteSelected: () => void;
};

export default function TableToolbar({ search, onSearchChange, onImport, onCreateNew, selectedCount, onDeleteSelected }: Props) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="ep-toolbar">
      <div className="ep-toolbar-left">
        <button className="ep-toolbar-btn">≡ Filter</button>
        <button className="ep-toolbar-btn">↕ Sort</button>
        <button className="ep-toolbar-btn">⚡ Automate</button>
        {showSearch ? (
          <input
            className="ep-toolbar-search"
            placeholder="Search projects..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            autoFocus
            onBlur={() => { if (!search) setShowSearch(false); }}
          />
        ) : (
          <button className="ep-toolbar-btn" onClick={() => setShowSearch(true)}>🔍 Search</button>
        )}
        <button className="ep-toolbar-btn">⚙</button>
      </div>
      <div className="ep-toolbar-right">
        <button className="ep-toolbar-btn" onClick={onImport}>↑ Import CSV</button>
        <button className="ep-toolbar-btn ep-toolbar-btn-primary" onClick={onCreateNew}>+ New ▾</button>
      </div>
      {selectedCount > 0 && (
        <div className="ep-bulk-bar">
          <span>{selectedCount} selected</span>
          <button className="ep-bulk-delete" onClick={onDeleteSelected}>🗑 Delete {selectedCount} rows</button>
        </div>
      )}
    </div>
  );
}
