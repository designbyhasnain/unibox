'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { getAllProjectsAction, createProjectAction, updateProjectAction, getManagersAction } from '../../src/actions/projectActions';
import { getClientsAction } from '../../src/actions/clientActions';
import { getCurrentUserAction } from '../../src/actions/authActions';

type Manager = { id: string; name: string; email: string; role: string };
import { useUndoToast } from '../context/UndoToastContext';
import { useRegisterGlobalSearch } from '../context/GlobalSearchContext';
import SmartSelect from '../../components/projects/cells/SmartSelect';
import { Filter, Plus, X, MessageSquare, CirclePlus, CheckCircle2, Circle, Film } from 'lucide-react';

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

const STATUS_OPTIONS = [
    { value: 'Not Started', label: 'Intake' },
    { value: 'Downloading', label: 'Downloading' },
    { value: 'Downloaded', label: 'Downloaded' },
    { value: 'In Progress', label: 'Editing' },
    { value: 'on Hold', label: 'On Hold' },
    { value: 'Delivered', label: 'Delivered' },
    { value: 'Done', label: 'Done' },
];

const PRIORITY_OPTIONS = [
    { value: 'LOW', label: 'Low', bg: 'transparent', fg: 'var(--ink-muted)' },
    { value: 'MEDIUM', label: 'Medium', bg: 'transparent', fg: 'var(--info)' },
    { value: 'HIGH', label: 'High', bg: 'transparent', fg: 'var(--warn)' },
    { value: 'URGENT', label: 'Urgent', bg: 'transparent', fg: 'var(--danger)' },
];

const PAID_OPTIONS = [
    { value: 'UNPAID', label: 'Unpaid', bg: 'transparent', fg: 'var(--danger)' },
    { value: 'PARTIALLY_PAID', label: 'Partially paid', bg: 'transparent', fg: 'var(--warn)' },
    { value: 'PAID', label: 'Paid', bg: 'transparent', fg: 'var(--coach)' },
];

const PAID_LABEL: Record<string, string> = {
    UNPAID: 'Unpaid',
    PARTIALLY_PAID: 'Partial',
    PAID: 'Paid',
};

const PRIORITY_LABEL: Record<string, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    URGENT: 'Urgent',
};

function fmt(n: number) {
    return '$' + n.toLocaleString();
}

function relDate(d: string | null) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toDateInputValue(d: string | null | undefined): string {
    if (!d) return '';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
}

function getInitials(name: string) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// SmartSelect renders the raw `value` when it can't find a matching option,
// which is how the table started showing UUIDs for projects whose contact /
// owner was outside the loaded picker rosters. These helpers prepend a
// synthetic option using the row's joined label so the cell paints a real
// human-readable name even when the underlying ID isn't in the dropdown.

type ClientOpt = { id: string; name: string; email: string };

function mergeClientOption(clientOptions: ClientOpt[], project: Project): { value: string; label: string; subtitle?: string; avatar?: string }[] {
    const base = clientOptions.map(c => ({
        value: c.id,
        label: c.name,
        subtitle: c.email,
        avatar: getInitials(c.name),
    }));
    if (project.client_id && !base.some(o => o.value === project.client_id)) {
        const name = project.client_name || project.client?.name || project.person || 'Unknown';
        const email = project.client?.email || '';
        base.unshift({ value: project.client_id, label: name, subtitle: email, avatar: getInitials(name) });
    }
    return base;
}

function mergeManagerOption(managers: Manager[], project: Project): { value: string; label: string; subtitle: string; avatar: string }[] {
    const base = managers.map(u => ({
        value: u.id,
        label: u.name,
        subtitle: u.email,
        avatar: getInitials(u.name),
    }));
    if (project.account_manager_id && !base.some(o => o.value === project.account_manager_id)) {
        const fallbackName = (project.account_manager && String(project.account_manager).trim()) || 'Unknown user';
        base.unshift({ value: project.account_manager_id, label: fallbackName, subtitle: '', avatar: getInitials(fallbackName) });
    }
    return base;
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

// ── Inline editors ────────────────────────────────────────────────────────
// Mirror the cells used on /clients so the editing UX is identical across
// pages. NumericCell renders $ prefix when noPrefix is omitted; TextCell is
// click-to-edit with Enter-to-save / Escape-to-cancel and only fires onCommit
// when the value actually changed. Both keep cursor focus management simple.

function NumericCell({ value, onCommit, noPrefix }: { value: number | null | undefined; onCommit: (n: number | null) => void; noPrefix?: boolean }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<string>(value != null ? String(value) : '');
    useEffect(() => { if (!editing) setDraft(value != null ? String(value) : ''); }, [value, editing]);

    const fmtDisplay = (n: number) => noPrefix
        ? n.toLocaleString()
        : (n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + n.toLocaleString());

    const display = value == null
        ? <span style={{ color: 'var(--ink-muted)' }}>—</span>
        : <span style={{ fontWeight: 600 }}>{fmtDisplay(value)}</span>;

    const commit = () => {
        setEditing(false);
        const trimmed = draft.trim();
        if (!trimmed) {
            if (value != null) onCommit(null);
            return;
        }
        const parsed = Number(trimmed.replace(/[$,]/g, ''));
        if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
    };

    if (editing) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                {!noPrefix && <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>$</span>}
                <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commit(); }
                        else if (e.key === 'Escape') { setEditing(false); setDraft(value != null ? String(value) : ''); }
                    }}
                    style={{
                        background: 'var(--canvas)', border: '1px solid var(--accent)',
                        borderRadius: 6, padding: '3px 6px', fontSize: 12,
                        color: 'var(--ink)', width: 90, fontFamily: 'inherit',
                    }}
                />
            </span>
        );
    }
    return (
        <span
            tabIndex={0}
            role="button"
            onClick={() => setEditing(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); } }}
            style={{
                display: 'inline-block', minWidth: 50, padding: '3px 6px',
                borderRadius: 6, cursor: 'pointer', border: '1px solid transparent',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--hairline-soft)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
        >
            {display}
        </span>
    );
}

function TextCell({ value, onCommit, mono, placeholder, multiline }: {
    value: string | null | undefined;
    onCommit: (s: string | null) => void;
    mono?: boolean;
    placeholder?: string;
    multiline?: boolean;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<string>(value ?? '');
    useEffect(() => { if (!editing) setDraft(value ?? ''); }, [value, editing]);

    const commit = () => {
        setEditing(false);
        const trimmed = draft.trim();
        const next = trimmed === '' ? null : trimmed;
        if (next !== (value ?? null)) onCommit(next);
    };

    const sharedStyle = {
        width: '100%', background: 'var(--canvas)',
        border: '1px solid var(--accent)', borderRadius: 6,
        padding: '4px 8px', fontSize: mono ? 12 : 12.5,
        color: 'var(--ink)', fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        outline: 'none', resize: 'vertical' as const,
    };

    if (editing) {
        return multiline ? (
            <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
                    else if (e.key === 'Escape') { setEditing(false); setDraft(value ?? ''); }
                }}
                placeholder={placeholder}
                rows={4}
                style={sharedStyle}
            />
        ) : (
            <input
                type="text"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commit(); }
                    else if (e.key === 'Escape') { setEditing(false); setDraft(value ?? ''); }
                }}
                placeholder={placeholder}
                style={sharedStyle}
            />
        );
    }
    const display = value && value.trim() !== ''
        ? <span style={{ color: 'var(--ink)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', fontSize: mono ? 12 : 12.5, wordBreak: 'break-word', whiteSpace: multiline ? 'pre-wrap' : 'normal' }}>{value}</span>
        : <span style={{ color: 'var(--ink-faint)' }}>{placeholder ?? '—'}</span>;
    return (
        <span
            tabIndex={0}
            role="button"
            onClick={() => setEditing(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); } }}
            style={{ display: 'block', minHeight: 18, cursor: 'text', outline: 'none', width: '100%' }}
        >
            {display}
        </span>
    );
}

// Editable KV row used inside the right drawer. Hover background + pencil
// glyph mimic the /clients drawer so the "this field is editable" affordance
// is identical across pages.
function KVCell({ k, children }: { k: string; children: React.ReactNode }) {
    return (
        <div
            className="pj-kv-cell"
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', fontSize: 12.5, borderBottom: '1px solid var(--hairline-soft)', minHeight: 32 }}
        >
            <div style={{ width: 140, color: 'var(--ink-muted)', flexShrink: 0 }}>{k}</div>
            <div className="pj-kv-cell-value" style={{ flex: 1, minWidth: 0, position: 'relative', padding: '4px 8px', margin: '-4px -8px', borderRadius: 6, transition: 'background 0.12s' }}>
                {children}
                <span
                    aria-hidden="true"
                    className="pj-kv-cell-pencil"
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--ink-faint)', pointerEvents: 'none', opacity: 0, transition: 'opacity 0.12s' }}
                >
                    ✎
                </span>
            </div>
        </div>
    );
}

function ProjectDetailPanel({ project, onClose, onUpdate, managers, clientOptions, isAdmin }: {
    project: Project;
    onClose: () => void;
    onUpdate: (id: string, field: string, value: unknown) => void;
    managers: Manager[];
    clientOptions: { id: string; name: string; email: string }[];
    isAdmin: boolean;
}) {
    const stage = project.status || 'Not Started';
    const color = STAGE_COLOR[stage] || STAGE_COLOR[stage.toLowerCase()] || 'var(--ink-muted)';
    const label = STAGE_LABEL[stage] || stage.toUpperCase();
    const progress = estimateProgress(project);
    const clientName = project.client_name || project.person || 'Unknown';
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
                {/* Stage + priority badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color, fontWeight: 600 }}>{label}</span>
                    {(project.priority === 'HIGH' || project.priority === 'URGENT') && (
                        <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 500 }}>● High priority</span>
                    )}
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono, monospace)' }}>PM-{projectId}</span>
                </div>

                {/* Title — inline-editable */}
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.01em' }}>
                    <TextCell
                        value={project.project_name}
                        onCommit={(v) => onUpdate(project.id, 'projectName', v)}
                        placeholder="Untitled project"
                    />
                </h2>

                {/* Quick context */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--ink-muted)', marginBottom: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div className={`avatar ${avClass(clientName)}`} style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontSize: 8, fontWeight: 600 }}>
                            {getInitials(clientName)}
                        </div>
                        <span style={{ fontWeight: 500, color: 'var(--ink-2)' }}>{clientName}</span>
                    </div>
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
                        <div style={{ fontSize: 20, fontWeight: 700 }}>
                            <NumericCell
                                value={project.project_value}
                                onCommit={(n) => onUpdate(project.id, 'projectValue', n)}
                            />
                        </div>
                    </div>
                    <div style={{ background: 'var(--surface)', padding: '14px 16px' }}>
                        <div style={{ fontSize: 10, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, marginBottom: 4 }}>Unpaid</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: unpaid > 0 ? 'var(--warn)' : 'var(--coach)' }}>{fmt(unpaid)}</div>
                    </div>
                </div>

                {/* Editable details */}
                <div style={{ marginBottom: 24 }}>
                    <div className="pj-panel-section-title">Details</div>
                    <KVCell k="Status">
                        <SmartSelect
                            value={project.status || 'Not Started'}
                            onChange={(v) => v && onUpdate(project.id, 'status', v)}
                            creatable
                            options={STATUS_OPTIONS}
                        />
                    </KVCell>
                    <KVCell k="Priority">
                        <SmartSelect
                            value={project.priority || 'MEDIUM'}
                            onChange={(v) => v && onUpdate(project.id, 'priority', v)}
                            options={PRIORITY_OPTIONS}
                        />
                    </KVCell>
                    <KVCell k="Paid status">
                        <SmartSelect
                            value={project.paid_status || 'UNPAID'}
                            onChange={(v) => v && onUpdate(project.id, 'paidStatus', v)}
                            options={PAID_OPTIONS}
                        />
                    </KVCell>
                    <KVCell k="Due date">
                        <input
                            type="date"
                            value={toDateInputValue(project.due_date)}
                            onChange={(e) => {
                                const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                                onUpdate(project.id, 'dueDate', v);
                            }}
                            style={{
                                background: 'transparent', border: '1px solid transparent',
                                color: 'var(--ink)', fontSize: 12.5, padding: '3px 6px',
                                borderRadius: 6, fontFamily: 'inherit', cursor: 'pointer', width: '100%',
                            }}
                        />
                    </KVCell>
                    <KVCell k="Client">
                        <SmartSelect
                            value={project.client_id || null}
                            onChange={(v) => onUpdate(project.id, 'clientId', v)}
                            placeholder="Pick a client…"
                            options={mergeClientOption(clientOptions, project)}
                        />
                    </KVCell>
                    {isAdmin && (
                        <KVCell k="Account manager">
                            <SmartSelect
                                value={project.account_manager_id || null}
                                onChange={(v) => onUpdate(project.id, 'accountManagerId', v)}
                                clearable
                                clearLabel="Unassigned"
                                placeholder="Unassigned"
                                options={managers.map(u => ({
                                    value: u.id,
                                    label: u.name,
                                    subtitle: u.email,
                                    avatar: getInitials(u.name),
                                }))}
                            />
                        </KVCell>
                    )}
                    <KVCell k="Project link">
                        <TextCell
                            value={project.project_link}
                            onCommit={(v) => onUpdate(project.id, 'projectLink', v)}
                            mono
                            placeholder="Paste a Drive / Frame.io / Vimeo link…"
                        />
                    </KVCell>
                </div>

                {/* Brief — inline-editable multiline */}
                <div style={{ marginBottom: 24 }}>
                    <div className="pj-panel-section-title">Brief</div>
                    <TextCell
                        value={project.brief}
                        onCommit={(v) => onUpdate(project.id, 'brief', v)}
                        multiline
                        placeholder="Describe the project, requirements, must-haves…"
                    />
                </div>

                {/* Reference */}
                <div style={{ marginBottom: 24 }}>
                    <div className="pj-panel-section-title">Reference / inspo</div>
                    <TextCell
                        value={project.reference}
                        onCommit={(v) => onUpdate(project.id, 'reference', v)}
                        multiline
                        placeholder="Reference links, mood board, prior films…"
                    />
                </div>

                {/* Milestones (read-only — derived from status) */}
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

                {/* Comments placeholder — kept read-only for now */}
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
    const [, setTotalCount] = useState(0);
    const [isAdmin, setIsAdmin] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    // Modal carries every field the table now exposes so a project can be
    // shaped fully on creation without a follow-up edit pass.
    const [newProject, setNewProject] = useState({
        name: '',
        clientId: '',
        status: 'Not Started',
        priority: 'MEDIUM',
        paidStatus: 'UNPAID',
        value: '',
        dueDate: '',
        accountManagerId: '',
    });
    const [saving, setSaving] = useState(false);
    // Drawer reads the LIVE row from `projects` via `selected = projects.find(...)`
    // so optimistic table edits flow through to the panel and panel edits flow
    // back into the table without manual sync — same pattern as /clients.
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selected = selectedId ? projects.find(p => p.id === selectedId) || null : null;

    const [clientOptions, setClientOptions] = useState<{ id: string; name: string; email: string }[]>([]);
    const [loadingClients, setLoadingClients] = useState(false);
    // Use getManagersAction (returns ALL non-editor users — admin + AM + sales)
    // rather than listSalesUsersAction so an existing project owned by an
    // admin/AM still resolves to a name in the Owner cell. The user explicitly
    // asked for "names not IDs" — the SALES-only roster was the bug.
    const [managers, setManagers] = useState<Manager[]>([]);

    // Topbar search
    const [searchTerm, setSearchTerm] = useState('');
    useRegisterGlobalSearch('/my-projects', {
        placeholder: 'Search projects, client, status',
        value: searchTerm,
        onChange: setSearchTerm,
        onClear: () => setSearchTerm(''),
    });

    useEffect(() => {
        getCurrentUserAction().then((u: any) => {
            if (u?.role === 'ADMIN' || u?.role === 'ACCOUNT_MANAGER') setIsAdmin(true);
        });
        // Owner roster — covers admin/AM/sales so every existing
        // account_manager_id resolves to a real name.
        getManagersAction().then(setManagers).catch(() => {});
        // Pre-load the first 100 clients so the inline Client picker (in
        // both the table and drawer) doesn't have to wait for a round trip
        // when first opened.
        getClientsAction(undefined, 1, 100)
            .then(res => setClientOptions((res.clients || []).map((c: any) => ({
                id: c.id, name: c.name || c.email || 'Unknown', email: c.email || '',
            }))))
            .catch(() => {});
    }, []);

    // /my-projects?clientId=<uuid> auto-opens the New Project modal pre-filled
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const cid = params.get('clientId');
        if (cid) {
            setNewProject(p => ({ ...p, clientId: cid }));
            setShowAddModal(true);
        }
    }, []);

    // Default the modal's owner to the signed-in user when it opens, unless
    // the user explicitly cleared it. Mirrors how the modal worked before
    // the redesign — admins can still change it before creating.
    useEffect(() => {
        if (!showAddModal) return;
        getCurrentUserAction().then((u: any) => {
            const uid = u?.userId;
            if (!uid) return;
            setNewProject(p => p.accountManagerId ? p : { ...p, accountManagerId: uid });
        });
    }, [showAddModal]);

    // Lazy-load client picker for the New Project modal (separate from the
    // pre-load above because the pre-load might still be in-flight when the
    // user opens the modal — this guarantees we always have the current set).
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

    // ── Optimistic per-cell update ─────────────────────────────────────────
    // Mirrors handleCellUpdate from /clients. The `field` argument is the
    // ProjectUpdatePayload key (camelCase: projectName / paidStatus / etc.);
    // we map it back to the snake_case column for the local state mirror so
    // the table cell, the drawer, and the totals all reflect immediately.
    const fieldToColumn: Record<string, string> = {
        projectName: 'project_name',
        projectDate: 'project_date',
        dueDate: 'due_date',
        accountManagerId: 'account_manager_id',
        paidStatus: 'paid_status',
        quote: 'quote',
        projectValue: 'project_value',
        projectLink: 'project_link',
        brief: 'brief',
        reference: 'reference',
        deductionOnDelay: 'deduction_on_delay',
        finalReview: 'final_review',
        priority: 'priority',
        status: 'status',
        clientId: 'client_id',
    };

    const handleProjectUpdate = useCallback(async (projectId: string, field: string, value: unknown) => {
        const column = fieldToColumn[field] ?? field;
        const prev = projects.find(p => p.id === projectId);
        const previousValue = prev ? (prev as Record<string, unknown>)[column] : undefined;
        // Optimistic: mirror locally first. For client_id changes also refresh
        // the joined `client_name` so the table cell repaints immediately.
        setProjects(ps => ps.map(p => {
            if (p.id !== projectId) return p;
            const next: any = { ...p, [column]: value };
            if (field === 'clientId') {
                const opt = clientOptions.find(c => c.id === value);
                next.client = opt ? { id: opt.id, name: opt.name, email: opt.email } : null;
                next.client_name = opt?.name || null;
            }
            return next;
        }));
        try {
            const res = await updateProjectAction(projectId, { [field]: value } as any);
            if (!res.success) throw new Error(res.error || 'Update failed');
        } catch (e: any) {
            // Revert on failure with retry toast.
            setProjects(ps => ps.map(p => p.id === projectId ? { ...p, [column]: previousValue } : p));
            showError(e?.message || `Couldn't update ${field}`, {
                onRetry: () => handleProjectUpdate(projectId, field, value),
            });
        }

    }, [projects, clientOptions, showError]);

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

    const filteredProjects = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return projects;
        return projects.filter(p => {
            const fields = [p.project_name, p.client_name, p.person, p.status, p.editor];
            return fields.some(f => (f || '').toString().toLowerCase().includes(q));
        });
    }, [projects, searchTerm]);

    const resetNewProject = () => setNewProject({
        name: '', clientId: '', status: 'Not Started', priority: 'MEDIUM',
        paidStatus: 'UNPAID', value: '', dueDate: '', accountManagerId: '',
    });

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
            // Fall back to "two weeks out" when the user didn't pick a due
            // date — same legacy behaviour as before. Date inputs return
            // YYYY-MM-DD which createProjectAction accepts directly.
            const due = newProject.dueDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
            const res = await createProjectAction({
                clientId: newProject.clientId,
                projectName: newProject.name.trim(),
                projectDate: today as string,
                dueDate: due as string,
                accountManagerId: newProject.accountManagerId || (user as any)?.userId || '',
                projectValue: parseFloat(newProject.value) || 0,
                paidStatus: newProject.paidStatus,
                priority: newProject.priority,
                status: newProject.status,
            });
            if (res.success) {
                setShowAddModal(false);
                resetNewProject();
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
            <div className={`pj-layout${selected ? ' pj-layout-split' : ''}`}>
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

                    {/* Editable table — every column except Project name → Client
                        is interactive. Click anywhere outside an editable cell
                        opens the right-side detail drawer. */}
                    {filteredProjects.length === 0 ? (
                        <div className="empty-state-v2">
                            <div className="empty-illu" aria-hidden="true">
                                <Film size={26} />
                            </div>
                            <h3>{projects.length === 0 ? 'No projects yet' : 'No results found'}</h3>
                            <p>
                                {projects.length === 0
                                    ? 'Once you close a deal, the project will show up here so you can track edits, deliveries, and balances.'
                                    : `Nothing matches "${searchTerm}". Try a different project name, client, or status.`}
                            </p>
                            {projects.length === 0 && (
                                <button className="empty-cta" onClick={() => setShowAddModal(true)}>
                                    <Plus size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
                                    New project
                                </button>
                            )}
                        </div>
                    ) : (
                        <table className="pj-table">
                            <thead>
                                <tr>
                                    <th>Project</th>
                                    <th>Client</th>
                                    <th>Status</th>
                                    <th>Priority</th>
                                    <th className="num">Value</th>
                                    <th>Paid</th>
                                    <th>Due</th>
                                    {isAdmin && <th>Owner</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProjects.map(p => {
                                    const isSelected = selectedId === p.id;
                                    return (
                                        <tr
                                            key={p.id}
                                            className={isSelected ? 'is-selected' : ''}
                                        >
                                            {/* Project — click to open drawer; the project_name itself
                                                is editable inside the drawer (kept terse here). */}
                                            <td onClick={() => setSelectedId(isSelected ? null : p.id)} style={{ cursor: 'pointer' }}>
                                                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.project_name || 'Untitled'}</div>
                                                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>
                                                    PM-{p.id?.slice(0, 8)?.toUpperCase()}
                                                </div>
                                            </td>
                                            <td onClick={e => e.stopPropagation()}>
                                                <SmartSelect
                                                    value={p.client_id || null}
                                                    onChange={(v) => handleProjectUpdate(p.id, 'clientId', v)}
                                                    placeholder="Pick client…"
                                                    options={mergeClientOption(clientOptions, p)}
                                                />
                                            </td>
                                            <td onClick={e => e.stopPropagation()}>
                                                <SmartSelect
                                                    value={p.status || 'Not Started'}
                                                    onChange={(v) => v && handleProjectUpdate(p.id, 'status', v)}
                                                    creatable
                                                    options={STATUS_OPTIONS}
                                                />
                                            </td>
                                            <td onClick={e => e.stopPropagation()}>
                                                <SmartSelect
                                                    value={p.priority || 'MEDIUM'}
                                                    onChange={(v) => v && handleProjectUpdate(p.id, 'priority', v)}
                                                    options={PRIORITY_OPTIONS}
                                                />
                                            </td>
                                            <td className="num" onClick={e => e.stopPropagation()}>
                                                <NumericCell
                                                    value={p.project_value}
                                                    onCommit={(n) => handleProjectUpdate(p.id, 'projectValue', n)}
                                                />
                                            </td>
                                            <td onClick={e => e.stopPropagation()}>
                                                <SmartSelect
                                                    value={p.paid_status || 'UNPAID'}
                                                    onChange={(v) => v && handleProjectUpdate(p.id, 'paidStatus', v)}
                                                    options={PAID_OPTIONS}
                                                />
                                            </td>
                                            <td onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="date"
                                                    value={toDateInputValue(p.due_date)}
                                                    onChange={(e) => {
                                                        const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                                                        handleProjectUpdate(p.id, 'dueDate', v);
                                                    }}
                                                    style={{
                                                        background: 'transparent', border: '1px solid transparent',
                                                        color: 'var(--ink-muted)', fontSize: 12, padding: '4px 6px',
                                                        borderRadius: 6, fontFamily: 'inherit', cursor: 'pointer',
                                                        width: '100%',
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--hairline-soft)')}
                                                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                                                />
                                            </td>
                                            {isAdmin && (
                                                <td onClick={e => e.stopPropagation()}>
                                                    <SmartSelect
                                                        value={p.account_manager_id || null}
                                                        onChange={(v) => handleProjectUpdate(p.id, 'accountManagerId', v)}
                                                        clearable
                                                        clearLabel="Unassigned"
                                                        placeholder="Unassigned"
                                                        options={mergeManagerOption(managers, p)}
                                                    />
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {selected && (
                    <ProjectDetailPanel
                        project={selected}
                        onClose={() => setSelectedId(null)}
                        onUpdate={handleProjectUpdate}
                        managers={managers}
                        clientOptions={clientOptions}
                        isAdmin={isAdmin}
                    />
                )}
            </div>

            {showAddModal && (
                <div className="compose-scrim" onClick={() => setShowAddModal(false)}>
                    <div className="compose pj-modal" onClick={e => e.stopPropagation()} style={{ maxHeight: 'fit-content', width: 540 }}>
                        <div className="compose-head">
                            <div className="title">New project</div>
                            <div className="spacer" />
                            <button className="icon-btn" onClick={() => setShowAddModal(false)} title="Close">×</button>
                        </div>
                        <div className="compose-body pj-modal-body">
                            <div className="pj-field">
                                <label>Project name</label>
                                <input
                                    value={newProject.name}
                                    onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))}
                                    placeholder="e.g. Lake Como Wedding Film"
                                    autoFocus
                                />
                            </div>
                            <div className="pj-field">
                                <label>Client</label>
                                <SmartSelect
                                    value={newProject.clientId || null}
                                    onChange={(v) => setNewProject(p => ({ ...p, clientId: v || '' }))}
                                    placeholder={loadingClients ? 'Loading clients…' : (clientOptions.length === 0 ? 'No clients yet — add one from /clients' : 'Search clients…')}
                                    options={clientOptions.map(c => ({
                                        value: c.id,
                                        label: c.name,
                                        subtitle: c.email,
                                        avatar: getInitials(c.name),
                                    }))}
                                />
                            </div>
                            <div className="pj-field-row">
                                <div className="pj-field">
                                    <label>Status</label>
                                    <SmartSelect
                                        value={newProject.status}
                                        onChange={(v) => v && setNewProject(p => ({ ...p, status: v }))}
                                        options={STATUS_OPTIONS}
                                    />
                                </div>
                                <div className="pj-field">
                                    <label>Priority</label>
                                    <SmartSelect
                                        value={newProject.priority}
                                        onChange={(v) => v && setNewProject(p => ({ ...p, priority: v }))}
                                        options={PRIORITY_OPTIONS}
                                    />
                                </div>
                            </div>
                            <div className="pj-field-row">
                                <div className="pj-field">
                                    <label>Project value</label>
                                    <div className="pj-num-input">
                                        <span>$</span>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            value={newProject.value}
                                            onChange={e => setNewProject(p => ({ ...p, value: e.target.value }))}
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                                <div className="pj-field">
                                    <label>Paid status</label>
                                    <SmartSelect
                                        value={newProject.paidStatus}
                                        onChange={(v) => v && setNewProject(p => ({ ...p, paidStatus: v }))}
                                        options={PAID_OPTIONS}
                                    />
                                </div>
                            </div>
                            <div className="pj-field-row">
                                <div className="pj-field">
                                    <label>Due date</label>
                                    <input
                                        type="date"
                                        value={newProject.dueDate}
                                        onChange={e => setNewProject(p => ({ ...p, dueDate: e.target.value }))}
                                    />
                                </div>
                                <div className="pj-field">
                                    <label>Owner</label>
                                    <SmartSelect
                                        value={newProject.accountManagerId || null}
                                        onChange={(v) => setNewProject(p => ({ ...p, accountManagerId: v || '' }))}
                                        clearable
                                        clearLabel="Unassigned"
                                        placeholder="Unassigned"
                                        options={managers.map(u => ({
                                            value: u.id,
                                            label: u.name,
                                            subtitle: u.email,
                                            avatar: getInitials(u.name),
                                        }))}
                                    />
                                </div>
                            </div>
                            <div className="pj-modal-foot">
                                <button className="btn" onClick={() => setShowAddModal(false)} style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)', color: 'var(--ink-2)' }}>Cancel</button>
                                <button className="btn btn-dark" onClick={handleAdd} disabled={saving || !newProject.name.trim() || !newProject.clientId}>
                                    {saving ? 'Creating…' : 'Create project'}
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
.pj-page .btn-dark:hover{opacity:.9}

/* Editable table — sister to the .cl-page table on /clients. Same row
   hover, same header treatment, kept its own class so the column
   widths can be tuned independently. */
.pj-page .pj-table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--hairline-soft);border-radius:14px}
.pj-page .pj-table th,.pj-page .pj-table td{padding:11px 14px;text-align:left;font-size:12.5px}
.pj-page .pj-table th{font-weight:500;color:var(--ink-muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em;background:color-mix(in oklab,var(--surface-2),transparent 20%);border-bottom:1px solid var(--hairline-soft)}
.pj-page .pj-table tbody tr{border-bottom:1px solid var(--hairline-soft);transition:background .12s}
.pj-page .pj-table tbody tr:last-child{border-bottom:0}
.pj-page .pj-table tbody tr:hover{background:var(--surface-hover)}
.pj-page .pj-table tbody tr.is-selected{background:color-mix(in oklab,var(--accent-soft),transparent 70%)}
.pj-page .pj-table .num{text-align:right;font-variant-numeric:tabular-nums}
.pj-page .progressbar{height:4px;background:var(--surface-2);border-radius:99px;overflow:hidden}
.pj-page .progressbar div{border-radius:99px;transition:width .3s ease}

/* Detail Panel — same animation as before, plus the editable-affordance
   hover styles (pencil + soft background) lifted from /clients KVCell. */
.pj-panel{width:420px;flex-shrink:0;border-left:1px solid var(--hairline-soft);background:var(--shell);display:flex;flex-direction:column;overflow:hidden;animation:pjPanelSlide .2s ease}
@keyframes pjPanelSlide{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}
.pj-panel-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--hairline-soft);flex-shrink:0}
.pj-panel-close{width:28px;height:28px;display:grid;place-items:center;border-radius:6px;border:none;background:none;color:var(--ink-muted);cursor:pointer;transition:background .12s}
.pj-panel-close:hover{background:var(--surface);color:var(--ink)}
.pj-panel-body{flex:1;overflow-y:auto;padding:18px}
.pj-panel-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:500;background:var(--surface);border:1px solid var(--hairline-soft);color:var(--ink-2);cursor:pointer;font-family:var(--font-ui);transition:background .12s}
.pj-panel-btn:hover{background:var(--surface-2);color:var(--ink)}
.pj-panel-section-title{font-size:11px;font-weight:600;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
.pj-panel .pj-kv-cell:hover .pj-kv-cell-pencil{opacity:.6}
.pj-panel .pj-kv-cell:hover .pj-kv-cell-value{background:var(--surface-hover)}
.pj-panel .pj-kv-cell-value{cursor:pointer}
.pj-panel .ep-ss-trigger{cursor:pointer;width:100%}

/* New Project modal — grid-of-fields layout matching the table density */
.pj-modal-body{padding:20px 24px 24px;display:flex;flex-direction:column;gap:14px}
.pj-field{display:flex;flex-direction:column;gap:6px;flex:1;min-width:0}
.pj-field label{font-size:11px;font-weight:600;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.04em}
.pj-field input[type="text"],
.pj-field input[type="number"],
.pj-field input[type="date"],
.pj-field input:not([type]){
    width:100%;
    border:1px solid var(--hairline-soft);
    border-radius:8px;
    padding:9px 12px;
    font-size:13px;
    background:var(--surface);
    color:var(--ink);
    font-family:var(--font-ui);
    outline:none;
    transition:border-color .12s,box-shadow .12s;
}
.pj-field input:focus{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in oklab,var(--accent),transparent 80%)}
.pj-field-row{display:flex;gap:12px}
.pj-num-input{display:flex;align-items:center;border:1px solid var(--hairline-soft);border-radius:8px;background:var(--surface);transition:border-color .12s,box-shadow .12s}
.pj-num-input:focus-within{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in oklab,var(--accent),transparent 80%)}
.pj-num-input span{padding:0 8px 0 12px;color:var(--ink-muted);font-size:13px}
.pj-num-input input{border:none !important;box-shadow:none !important;padding:9px 12px 9px 0 !important;background:transparent !important;flex:1}
/* Inside the modal, SmartSelect should look like a styled input rather
   than a tight pill so the form rhythm stays clean. */
.pj-modal .ep-ss-trigger{
    width:100%;
    border:1px solid var(--hairline-soft);
    border-radius:8px;
    padding:8px 12px;
    background:var(--surface);
    cursor:pointer;
    min-height:36px;
    transition:border-color .12s;
}
.pj-modal .ep-ss-trigger:hover{border-color:var(--hairline)}
.pj-modal-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
            `}</style>
        </div>
    );
}
