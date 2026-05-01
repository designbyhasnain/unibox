'use client';
import { useState, useEffect, useCallback, useMemo, useTransition } from 'react';
import type { ProjectWithCommentCount, ProjectSortField, ProjectProgress } from '../../lib/projects/types';
import type { ViewId } from '../../lib/projects/constants';
import { getEditProjects, createEditProject, updateEditProject, deleteEditProject, deleteMultipleEditProjects, duplicateEditProject } from '../../lib/projects/actions';
import ViewSwitcher from './toolbar/ViewSwitcher';
import TableToolbar from './toolbar/TableToolbar';
import CSVImportModal from './toolbar/CSVImportModal';
import ProjectTable from './table/ProjectTable';
import BoardView from './views/BoardView';
import ProjectDetailPanel from './project-detail/ProjectDetailPanel';
import { ErrorBoundary } from '../../app/components/ErrorBoundary';
import { useUndoToast } from '../../app/context/UndoToastContext';

const PAGE_SIZE = 50;

export default function ProjectsClient({ userRole }: { userRole?: string }) {
  const isEditor = userRole === 'VIDEO_EDITOR';
  const [projects, setProjects] = useState<ProjectWithCommentCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [activeView, setActiveView] = useState<ViewId>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<ProjectSortField | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // ── Load Projects ──────────────────────────────────────────────────────────
  const loadProjects = useCallback(async (page: number = 1, showPageLoader: boolean = false) => {
    if (showPageLoader) setPageLoading(true); else setLoading(true);

    const res = await getEditProjects(
      { search: search || undefined, sortBy: sortBy || undefined, sortOrder },
      page,
      PAGE_SIZE,
    );

    if (res.success && res.data) {
      setProjects(res.data as ProjectWithCommentCount[]);
      setTotal(res.total ?? 0);
      setTotalPages(res.totalPages ?? 0);
      setCurrentPage(res.page ?? page);
    }

    setLoading(false);
    setPageLoading(false);
  }, [search, sortBy, sortOrder]);

  useEffect(() => { loadProjects(1); }, [loadProjects]);

  // ── Page change ────────────────────────────────────────────────────────────
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    loadProjects(page, true);
  }, [loadProjects]);

  // ── Filtered projects based on view (client-side filter on current page) ──
  const filteredProjects = useMemo(() => {
    switch (activeView) {
      case 'downloaded':      return projects.filter(p => p.progress === 'DOWNLOADED');
      case 'not-downloaded':  return projects.filter(p => p.progress !== 'DOWNLOADED');
      case 'delivered':       return projects.filter(p => p.progress === 'DONE' || p.progress === 'APPROVED');
      case 'team-affan':      return projects.filter(p => p.team?.toUpperCase() === 'AFFAN');
      case 'due-am': {
        return [...projects].sort((a, b) => (a.accountManager || '').localeCompare(b.accountManager || ''));
      }
      case 'due-weekly': {
        return [...projects].sort((a, b) => {
          const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return da - db;
        });
      }
      default: return projects;
    }
  }, [projects, activeView]);

  // Local-only fields are computed/joined for display and have no DB column —
  // handleUpdate writes them straight into local state and skips the server
  // round-trip. Currently: assignedEditorName (joined from users via editor_id).
  const LOCAL_ONLY_FIELDS = new Set(['assignedEditorName']);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const { showError } = useUndoToast();
  // Phase 13: useTransition tells React the server write is non-urgent so
  // it never blocks input handlers or visible updates. The optimistic flip
  // happens BEFORE the transition starts (urgent), the network call happens
  // INSIDE (non-urgent) — the user never feels a hitch.
  const [, startUpdateTransition] = useTransition();
  const handleUpdate = useCallback((id: string, field: string, value: unknown) => {
    // 1. Optimistic flip — synchronous, urgent.
    setProjects(prev => prev.map(p => p.id === id ? { ...p, [field]: value } as ProjectWithCommentCount : p));
    if (LOCAL_ONLY_FIELDS.has(field)) return;

    // 2. Server write — non-urgent transition. UI is already up to date.
    startUpdateTransition(async () => {
      const res = await updateEditProject(id, { [field]: value });
      if (!res.success) {
        // Roll back the optimistic change so the user sees the real DB state.
        loadProjects(currentPage, true);
        showError(`Couldn't update ${field}: ${('error' in res && res.error) || 'unknown error'}`, {
          onRetry: () => updateEditProject(id, { [field]: value }).then(r => { if (r.success) loadProjects(currentPage, true); }),
        });
      }
    });
  }, [loadProjects, currentPage, showError]);

  const handleCreateNew = useCallback(async (progress?: ProjectProgress) => {
    const res = await createEditProject({ name: 'Untitled', ...(progress ? { progress } : {}) });
    if (res.success && res.data) {
      setOpenProjectId(res.data.id as string);
      loadProjects(1, true);
    }
  }, [loadProjects]);

  const handleDuplicate = useCallback(async (id: string) => {
    await duplicateEditProject(id);
    loadProjects(currentPage, true);
  }, [loadProjects, currentPage]);

  const handleDelete = useCallback(async (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    if (openProjectId === id) setOpenProjectId(null);
    await deleteEditProject(id);
    loadProjects(currentPage, true);
  }, [openProjectId, loadProjects, currentPage]);

  const handleDeleteSelected = useCallback(async () => {
    const ids = [...selectedIds];
    setProjects(prev => prev.filter(p => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    await deleteMultipleEditProjects(ids);
    loadProjects(1, true);
  }, [selectedIds, loadProjects]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSort = useCallback((field: ProjectSortField) => {
    if (sortBy === field) {
      if (sortOrder === 'asc') setSortOrder('desc');
      else { setSortBy(null); setSortOrder('desc'); }
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  }, [sortBy, sortOrder]);

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setCurrentPage(1);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="ep-page">
      <div className="ep-page-header">
        <div className="ep-page-emoji">🎬</div>
        <h1 className="ep-page-title">Projects</h1>
        <p className="ep-page-desc">
          The post-production hub. Track edit jobs from intake through delivery,
          assign editors, and keep client-facing milestones in one place.
        </p>
      </div>

      <ViewSwitcher activeView={activeView} onChangeView={v => { setActiveView(v); setCurrentPage(1); }} />

      <TableToolbar
        search={search}
        onSearchChange={handleSearchChange}
        onImport={() => setShowImport(true)}
        onCreateNew={() => handleCreateNew()}
        selectedCount={selectedIds.size}
        onDeleteSelected={handleDeleteSelected}
      />

      <div className={`ep-content ${openProjectId ? 'ep-content-split' : ''}`}>
        <div className="ep-content-main">
          {loading ? (
            <div className="ep-loading">Loading projects...</div>
          ) : activeView === 'board' ? (
            <ErrorBoundary section="Board View">
              <BoardView
                projects={filteredProjects}
                onUpdate={handleUpdate}
                onOpen={setOpenProjectId}
                onCreateNew={(progress) => handleCreateNew(progress)}
              />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary section="Table View">
              <ProjectTable
                projects={filteredProjects}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onUpdate={handleUpdate}
                onOpen={setOpenProjectId}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                onCreateNew={() => handleCreateNew()}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                page={currentPage}
                totalPages={totalPages}
                total={total}
                limit={PAGE_SIZE}
                onPageChange={handlePageChange}
                isLoading={pageLoading}
                isEditor={isEditor}
              />
            </ErrorBoundary>
          )}
        </div>

        {openProjectId && (
          <ErrorBoundary section="Project Detail">
            <ProjectDetailPanel
              projectId={openProjectId}
              onClose={() => setOpenProjectId(null)}
              onUpdate={(field, value) => handleUpdate(openProjectId, field, value)}
              onDuplicate={() => handleDuplicate(openProjectId)}
              onDelete={() => handleDelete(openProjectId)}
            />
          </ErrorBoundary>
        )}
      </div>

      <CSVImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onComplete={() => { loadProjects(1, true); }}
      />
    </div>
  );
}
