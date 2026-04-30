'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { getAllProjectsAction, createProjectAction } from '../../src/actions/projectActions';
import { getClientsAction } from '../../src/actions/clientActions';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { useUndoToast } from '../context/UndoToastContext';
import { Filter, Plus, X, MessageSquare, CirclePlus, CheckCircle2, Circle, Clock, FileText, Film } from 'lucide-react';

type Project = any;

const STAGE_COLOR: Record<string, string> = {
    'Not Started': 'var(--info)',
    'Downloading': 'var(--ink-muted)',
    'Downloaded': 'var(--ink-muted)',
    'In Progress': 'var(--accent-ink)',
    'on Hold': 'var(--warn)',
    'Delivered': 'var(--coach)',
    'Done': 'var(--coach)',
    'intake': 'var(--info)',
    'selects': 'var(--ink-muted)',
    'editing': 'var(--accent-ink)',
    'revisions': 'var(--warn)',
    'delivery': 'var(--coach)',
};

const STAGE_LABEL: Record<string, string> = {
    'Not Started': 'INTAKE',
    'Downloading': 'DOWNLOADING',
    'Downloaded': 'DOWNLOADED',
    'In Progress': 'EDITING',
    'on Hold': 'ON HOLD',
    'Delivered': 'DELIVERY',
    'Done': 'DONE',
};

function fmt(n: number) {
    return '$' + n.toLocaleString();
}

function relDate(d: string | null) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(name: string) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ['av-a', 'av-b', 'av-c', 'av-d', 'av-e', 'av-f', 'av-g'];
function avClass(name: string) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * 31) % AVATAR_COLORS.length;
    return AVATAR_COLORS[h]!;
}

function estimateProgress(p: Project): number {
    const status = (p.status || 'Not Started').toLowerCase();
    if (status === 'done' || status === 'delivered') return 96;
    if (status === 'in progress' || status === 'editing') return 42;
    if (status === 'on hold') return 18;
    if (status === 'downloaded') return 30;
    if (status === 'downloading') return 10;
    return 4;
}

function ProjectDetailPanel({ project, onClose }: { project: Project; onClose: () => void }) {
    const stage = project.status || 'Not Started';
    const color = STAGE_COLOR[stage] || STAGE_COLOR[stage.toLowerCase()] || 'var(--ink-muted)';
    const label = STAGE_LABEL[stage] || stage.toUpperCase();
    const progress = estimateProgress(project);
    const clientName = project.client_name || project.person || 'Unknown';
    const editor = project.editor || 'Unassigned';
    const budget = project.project_value || 0;
    const isPaid = project.paid_status === 'PAID';
    const unpaid = isPaid ? 0 : budget;
    const projectId = project.id?.slice(0, 8)?.toUpperCase() || 'N/A';

    return (
        <div className="pj-panel">
            {/* Panel header */}
            <div className="pj-panel-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-muted)' }}>
                    <span>CRM / Projects /</span>
                    <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>PM-{projectId}</span>
                </div>
                <button className="pj-panel-close" onClick={onClose}><X size={14} /></button>
            </div>

            <div className="pj-panel-body">
                {/* Stage + priority */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color, fontWeight: 600 }}>{label}</span>
                    {(project.priority === 'HIGH' || project.priority === 'URGENT') && (
                        <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 500 }}>● High priority</span>
                    )}
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono, monospace)' }}>PM-{projectId}</span>
                </div>

                {/* Title */}
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.01em' }}>
                    {project.project_name || 'Untitled'}
                </h2>

                {/* Client / Editor / Due */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--ink-muted)', marginBottom: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div className={`avatar ${avClass(clientName)}`} style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontSize: 8, fontWeight: 600 }}>
                            {getInitials(clientName)}
                        </div>
                        <span style={{ fontWeight: 500, color: 'var(--ink-2)' }}>{clientName}</span>
                    </div>
                    <span style={{ color: 'var(--hairline)' }}>·</span>
                    <span>Editor: <b style={{ fontWeight: 500, color: 'var(--ink-2)' }}>{editor}</b></span>
                    <span style={{ color: 'var(--hairline)' }}>·</span>
                    <span>Due: <b style={{ fontWeight: 500, color: 'var(--ink-2)' }}>{relDate(project.due_date) || '—'}</b></span>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                    <button className="pj-panel-btn"><MessageSquare size={12} /> Message client</button>
                    <button className="pj-panel-btn"><CirclePlus size={12} /> Add task</button>
                </div>

                {/* KPI row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--hairline-soft)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
                    <div style={{ background: 'var(--surface)', padding: '14px 16px' }}>
                        <div style={{ fontSize: 10, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, marginBottom: 4 }}>Progress</div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{progress}%</div>
                        <div className="progressbar" style={{ marginTop: 6 }}><div style={{ height: '100%', width: `${progress}%`, background: color }} /></div>
                    </div>
                    <div style={{ background: 'var(--surface)', padding: '14px 16px' }}>
                        <div style={{ fontSize: 10, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, marginBottom: 4 }}>Budget</div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(budget)}</div>
                    </div>
                    <div style={{ background: 'var(--surface)', padding: '14px 16px' }}>
                        <div style={{ fontSize: 10, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, marginBottom: 4 }}>Unpaid</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: unpaid > 0 ? 'var(--warn)' : 'var(--coach)' }}>{fmt(unpaid)}</div>
                    </div>
                </div>

                {/* Brief */}
                <div style={{ marginBottom: 24 }}>
                    <div className="pj-panel-section-title">Brief</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                        {project.brief || 'No brief provided. Add project details and requirements here.'}
                    </div>
                </div>

                {/* Deliverables */}
                <div style={{ marginBottom: 24 }}>
                    <div className="pj-panel-section-title">Deliverables ({project.reference ? '2' : '0'})</div>
                    {project.reference ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                                <span>Highlight · 3 min</span>
                                <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>Revisions × 3</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                                <span>Teaser · 45 sec</span>
                                <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>Delivered</span>
                            </div>
                        </div>
                    ) : (
                        <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>No deliverables listed yet.</div>
                    )}
                </div>

                {/* Full ceremony line */}
                {project.deduction_on_delay && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, marginBottom: 24, padding: '8px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--hairline-soft)' }}>
                        <span>Full ceremony · uncut</span>
                        <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>Approved</span>
                    </div>
                )}

                {/* Milestones */}
                <div style={{ marginBottom: 24 }}>
                    <div className="pj-panel-section-title">Milestones</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', paddingLeft: 20 }}>
                        <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 1, background: 'var(--hairline-soft)' }} />
                        {[
                            { label: 'Final cut delivered', date: relDate(project.due_date) || 'TBD', done: progress > 90 },
                            { label: 'Revisions round 1', date: relDate(project.project_date) || 'TBD', done: progress > 50 },
                            { label: 'First delivery', date: relDate(project.project_date) || 'TBD', done: progress > 30 },
                        ].map((m, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', position: 'relative' }}>
                                <div style={{ position: 'absolute', left: -16 }}>
                                    {m.done
                                        ? <CheckCircle2 size={14} style={{ color: 'var(--coach)' }} />
                                        : <Circle size={14} style={{ color: 'var(--ink-faint)' }} />
                                    }
                                </div>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: m.done ? 500 : 400, color: m.done ? 'var(--ink)' : 'var(--ink-muted)' }}>{m.label}</div>
                                    <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{m.date}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Files */}
                <div style={{ marginBottom: 24 }}>
                    <div className="pj-panel-section-title">Files ({project.project_link ? 2 : 0})</div>
                    {project.project_link ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--hairline-soft)' }}>
                                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'oklch(0.55 0.18 265)', display: 'grid', placeItems: 'center', color: 'white', fontSize: 9, fontWeight: 700 }}>MP4</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>v1_highlight_prores</div>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>4.22 GB</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--hairline-soft)' }}>
                                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'oklch(0.55 0.18 25)', display: 'grid', placeItems: 'center', color: 'white', fontSize: 9, fontWeight: 700 }}>MP4</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>teaser_final.mp4</div>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>120 MB</div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>No files uploaded yet.</div>
                    )}
                </div>

                {/* Comments */}
                <div>
                    <div className="pj-panel-section-title">Comments (0)</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>No comments yet.</div>
                </div>
            </div>
        </div>
    );
}

export default function MyProjectsPage() {
    const hydrated = useHydrated();
    const { showError, showSuccess } = useUndoToast();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [isAdmin, setIsAdmin] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    // newProject now carries the picked client too. Synthetic-workflow run
    // showed the old modal sent `clientId: ''` which violated the projects
    // FK and caused a silent fail with the modal stuck open.
    const [newProject, setNewProject] = useState({ name: '', value: '', clientId: '' });
    const [saving, setSaving] = useState(false);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [clientOptions, setClientOptions] = useState<{ id: string; name: string; email: string }[]>([]);
    const [loadingClients, setLoadingClients] = useState(false);

    useEffect(() => {
        getCurrentUserAction().then((u: any) => {
            if (u?.role === 'ADMIN' || u?.role === 'ACCOUNT_MANAGER') setIsAdmin(true);
        });
    }, []);

    // Cross-page deep-link: /my-projects?clientId=<uuid> auto-opens the New
    // Project modal with that client pre-selected. Used by the contact-detail
    // Projects tab "+ New project for this client" CTA so users don't have to
    // re-pick the client they were already viewing.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const cid = params.get('clientId');
        if (cid) {
            setNewProject(p => ({ ...p, clientId: cid }));
            setShowAddModal(true);
        }
    }, []);

    // Lazy-load the client picker on modal open. Pulls the first 100 clients
    // visible to the current user via the existing scoped getClientsAction.
    useEffect(() => {
        if (!showAddModal) return;
        let cancelled = false;
        setLoadingClients(true);
        getClientsAction(undefined, 1, 100)
            .then(res => {
                if (cancelled) return;
                setClientOptions((res.clients || []).map((c: any) => ({
                    id: c.id, name: c.name || c.email || 'Unknown', email: c.email || '',
                })));
            })
            .catch(err => {
                if (cancelled) return;
                console.error('[my-projects] load clients failed', err);
                showError('Could not load your clients. Try again.');
            })
            .finally(() => { if (!cancelled) setLoadingClients(false); });
        return () => { cancelled = true; };
    }, [showAddModal, showError]);

    const loadProjects = useCallback(async () => {
        setLoading(true);
        const res = await getAllProjectsAction(undefined, 1, 100);
        if (res && 'projects' in res) {
            setProjects(res.projects);
            setTotalCount(res.totalCount);
        } else if (Array.isArray(res)) {
            setProjects(res);
            setTotalCount(res.length);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadProjects(); }, [loadProjects]);

    const totalUnpaid = useMemo(() =>
        projects.reduce((s, p) => s + ((p.paid_status !== 'PAID' && p.project_value) ? p.project_value : 0), 0)
    , [projects]);

    const activeCount = projects.filter(p => p.status && p.status !== 'Done' && p.status !== 'Delivered').length;
    const deliveryThisWeek = projects.filter(p => {
        if (!p.due_date) return false;
        const due = new Date(p.due_date);
        const now = new Date();
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return due >= now && due <= weekEnd;
    }).length;

    const handleAdd = async () => {
        if (!newProject.name.trim()) return;
        if (!newProject.clientId) {
            showError('Pick a client before creating the project.');
            return;
        }
        setSaving(true);
        try {
            const user = await getCurrentUserAction();
            const today = new Date().toISOString().split('T')[0];
            const due = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
            const res = await createProjectAction({
                clientId: newProject.clientId,
                projectName: newProject.name.trim(),
                projectDate: today as string,
                dueDate: due as string,
                accountManagerId: (user as any)?.userId || '',
                projectValue: parseFloat(newProject.value) || 0,
                paidStatus: 'UNPAID',
            });
            if (res.success) {
                setShowAddModal(false);
                setNewProject({ name: '', value: '', clientId: '' });
                showSuccess('Project created');
                loadProjects();
            } else {
                showError(res.error || 'Could not create project. Try again.', { onRetry: handleAdd });
            }
        } catch (err: any) {
            showError(err?.message || 'Could not create project. Try again.', { onRetry: handleAdd });
        } finally {
            setSaving(false);
        }
    };

    if (!hydrated || loading) return <PageLoader isLoading type="list" count={5}><div /></PageLoader>;

    return (
        <div className="pj-page">
            <div className={`pj-layout${selectedProject ? ' pj-layout-split' : ''}`}>
                <div className="pj-content">
                    <div className="page-head">
                        <div>
                            <h2>{isAdmin ? 'Projects' : 'Your projects'}
                                <span style={{ fontWeight: 400, color: 'var(--ink-muted)', fontSize: 14, marginLeft: 8 }}>
                                    · {activeCount} active, {deliveryThisWeek} delivery this week
                                </span>
                            </h2>
                            <div className="sub">
                                {isAdmin
                                    ? `Edit jobs tied to closed deals · sorted by due date · ${fmt(totalUnpaid)} in outstanding balances`
                                    : `Projects tied to deals you closed · ${fmt(totalUnpaid)} in unpaid balances across your clients`
                                }
                            </div>
                        </div>
                        <div style={{ flex: 1 }} />
                        <button className="icon-btn"><Filter size={15} /></button>
                        <button className="btn btn-dark" onClick={() => setShowAddModal(true)}><Plus size={12} /> New project</button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {projects.map(p => {
                            const stage = p.status || 'Not Started';
                            const color = STAGE_COLOR[stage] || STAGE_COLOR[stage.toLowerCase()] || 'var(--ink-muted)';
                            const stageLabel = STAGE_LABEL[stage] || stage.toUpperCase();
                            const progress = estimateProgress(p);
                            const clientName = p.client_name || p.person || 'Unknown';
                            const editor = p.editor || 'Unassigned';
                            const budget = p.project_value || 0;
                            const isPaid = p.paid_status === 'PAID';
                            const unpaid = isPaid ? 0 : budget;
                            const isSelected = selectedProject?.id === p.id;

                            return (
                                <div
                                    key={p.id}
                                    className={`card${isSelected ? ' card-active' : ''}`}
                                    style={{ padding: 0, cursor: 'pointer' }}
                                    onClick={() => setSelectedProject(isSelected ? null : p)}
                                >
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 200px 140px', alignItems: 'center', padding: '14px 18px', gap: 18 }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                                                <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color, fontWeight: 600 }}>{stageLabel}</span>
                                                {(p.priority === 'HIGH' || p.priority === 'URGENT') && (
                                                    <span className="chip" style={{ color: 'var(--danger)', fontSize: 10 }}>● High priority</span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{p.project_name || 'Untitled'}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                                                <div className={`avatar ${avClass(clientName)}`} style={{ width: 16, height: 16, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontSize: 7.5, fontWeight: 600 }}>
                                                    {getInitials(clientName)}
                                                </div>
                                                {clientName} · Editor: <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{editor}</b> · {p.brief ? p.brief.slice(0, 20) : 'Pending'}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6 }}>Progress · {progress}%</div>
                                            <div className="progressbar"><div style={{ height: '100%', width: `${progress}%`, background: color }} /></div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>Budget · unpaid</div>
                                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                                                {fmt(budget)}
                                                {unpaid > 0 && <span style={{ color: 'var(--warn)', marginLeft: 6, fontSize: 11.5 }}>{fmt(unpaid)} open</span>}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>Due</div>
                                            <div style={{ fontSize: 13, fontWeight: 600 }}>{relDate(p.due_date) || '—'}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {projects.length === 0 && (
                            <div className="empty-state-v2">
                                <div className="empty-illu" aria-hidden="true">
                                    <Film size={26} />
                                </div>
                                <h3>No projects yet</h3>
                                <p>Once you close a deal, the project will show up here so you can track edits, deliveries, and balances.</p>
                                <button className="empty-cta" onClick={() => setShowAddModal(true)}>
                                    <Plus size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
                                    New project
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {selectedProject && (
                    <ProjectDetailPanel
                        project={selectedProject}
                        onClose={() => setSelectedProject(null)}
                    />
                )}
            </div>

            {showAddModal && (
                <div className="compose-scrim" onClick={() => setShowAddModal(false)}>
                    <div className="compose" onClick={e => e.stopPropagation()} style={{ maxHeight: 'fit-content', width: 480 }}>
                        <div className="compose-head">
                            <div className="title">New project</div>
                            <div className="spacer" />
                            <button className="icon-btn" onClick={() => setShowAddModal(false)} title="Close">×</button>
                        </div>
                        <div className="compose-body" style={{ padding: 24 }}>
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Project Name</label>
                                <input
                                    value={newProject.name}
                                    onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))}
                                    placeholder="e.g. Lake Como Wedding Film"
                                    autoFocus
                                    style={{ width: '100%', border: '1px solid var(--hairline-soft)', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-ui)' }}
                                />
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Client</label>
                                <select
                                    value={newProject.clientId}
                                    onChange={e => setNewProject(p => ({ ...p, clientId: e.target.value }))}
                                    disabled={loadingClients}
                                    style={{ width: '100%', border: '1px solid var(--hairline-soft)', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-ui)' }}
                                >
                                    <option value="">{loadingClients ? 'Loading clients…' : (clientOptions.length === 0 ? 'No clients yet — add one from /clients' : 'Pick a client…')}</option>
                                    {clientOptions.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}{c.email ? ` · ${c.email}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Budget ($)</label>
                                <input
                                    type="number"
                                    value={newProject.value}
                                    onChange={e => setNewProject(p => ({ ...p, value: e.target.value }))}
                                    placeholder="e.g. 2500"
                                    style={{ width: '100%', border: '1px solid var(--hairline-soft)', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-ui)' }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button className="btn" onClick={() => setShowAddModal(false)} style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)', color: 'var(--ink-2)' }}>Cancel</button>
                                <button className="btn btn-dark" onClick={handleAdd} disabled={saving || !newProject.name.trim() || !newProject.clientId}>
                                    {saving ? 'Creating…' : 'Create Project'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
.pj-page{height:100%;overflow:hidden;background:var(--shell);font-family:var(--font-ui);color:var(--ink)}
.pj-layout{display:flex;height:100%;overflow:hidden}
.pj-content{flex:1;overflow-y:auto;padding:22px 26px}
.pj-layout-split .pj-content{max-width:calc(100% - 420px)}
.pj-page .page-head{display:flex;align-items:baseline;gap:14px;margin-bottom:18px;flex-wrap:wrap}
.pj-page .page-head h2{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:0}
.pj-page .page-head .sub{color:var(--ink-muted);font-size:13px;margin-top:4px;width:100%}
.pj-page .icon-btn{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;color:var(--ink-muted);border:none;background:none;cursor:pointer;transition:background .12s}
.pj-page .icon-btn:hover{background:var(--surface);color:var(--ink)}
.pj-page .btn{padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:500;display:inline-flex;align-items:center;gap:6px;border:none;cursor:pointer;font-family:var(--font-ui);text-decoration:none;transition:background .12s}
.pj-page .btn-dark{background:var(--ink);color:var(--canvas)}
.pj-page .card{background:var(--surface);border:1px solid var(--hairline-soft);border-radius:14px;transition:box-shadow .15s,border-color .15s}
.pj-page .card:hover{box-shadow:0 2px 8px rgba(0,0,0,0.08)}
.pj-page .card-active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.pj-page .chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;font-size:10px;font-weight:500;border-radius:999px;background:color-mix(in oklab,var(--danger-soft),transparent 20%);border:none}
.pj-page .progressbar{height:4px;background:var(--surface-2);border-radius:99px;overflow:hidden}
.pj-page .progressbar div{border-radius:99px;transition:width .3s ease}
.pj-page .avatar{width:16px;height:16px}

/* Detail Panel */
.pj-panel{width:420px;flex-shrink:0;border-left:1px solid var(--hairline-soft);background:var(--shell);display:flex;flex-direction:column;overflow:hidden;animation:pjPanelSlide .2s ease}
@keyframes pjPanelSlide{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}
.pj-panel-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--hairline-soft);flex-shrink:0}
.pj-panel-close{width:28px;height:28px;display:grid;place-items:center;border-radius:6px;border:none;background:none;color:var(--ink-muted);cursor:pointer;transition:background .12s}
.pj-panel-close:hover{background:var(--surface);color:var(--ink)}
.pj-panel-body{flex:1;overflow-y:auto;padding:18px}
.pj-panel-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:500;background:var(--surface);border:1px solid var(--hairline-soft);color:var(--ink-2);cursor:pointer;font-family:var(--font-ui);transition:background .12s}
.pj-panel-btn:hover{background:var(--surface-2);color:var(--ink)}
.pj-panel-section-title{font-size:11px;font-weight:600;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
            `}</style>
        </div>
    );
}
