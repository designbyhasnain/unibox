'use client';

type Props = {
  onImport: () => void;
  onCreateNew: () => void;
  selectedCount: number;
  onDeleteSelected: () => void;
};

// Search lives in the global topbar (see useRegisterGlobalSearch in
// ProjectsClient). The local 🔍 button was removed to avoid two parallel
// inputs that could drift out of sync.
export default function TableToolbar({ onImport, onCreateNew, selectedCount, onDeleteSelected }: Props) {
  return (
    <div className="ep-toolbar">
      <div className="ep-toolbar-left">
        <button className="ep-toolbar-btn">≡ Filter</button>
        <button className="ep-toolbar-btn">↕ Sort</button>
        <button className="ep-toolbar-btn">⚡ Automate</button>
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
