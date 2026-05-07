'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { getAllProjectsAction, createProjectAction, updateProjectAction, getManagersAction } from '../../src/actions/projectActions';
import { getClientsAction } from '../../src/actions/clientActions';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { addProjectTaskAction } from '../../src/actions/projectActions';
import { useUI } from '../context/UIContext';
import { useGlobalFilter } from '../context/FilterContext';

type Manager = { id: string; name: string; email: string; role: string };
type ResolvedAm = { id: string; name: string; email: string; source: 'mailbox' | 'manual' };
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

// ── Card stat tiles — click-to-edit ───────────────────────────────────────
// Each tile is a self-contained `editing` toggle. On enter, we render the
// matching SmartSelect / NumericCell / date input. On exit (popover closes,
// blur, Escape), we snap back to the static display. stopPropagation on the
// outer .pj-card-stats wrapper prevents the card body click (drawer-open)
// from firing when these tiles are interacted with.

function CardStatStatus({ label, progress, color, value, onChange }: {
    label: string;
    progress: number;
    color: string;
    value: string;
    onChange: (v: string | null) => void;
}) {
    const [editing, setEditing] = useState(false);
    return (
        <div
            className="pj-card-stat pj-card-stat-clickable"
            onClick={() => !editing && setEditing(true)}
            style={{ cursor: editing ? 'default' : 'pointer' }}
        >
            <div className="pj-card-stat-label">{label}</div>
            {editing ? (
                <SmartSelect
                    defaultOpen
                    onClose={() => setEditing(false)}
                    value={value}
                    onChange={onChange}
                    creatable
                    options={STATUS_OPTIONS}
                />
            ) : (
                <>
                    <div className="pj-card-stat-value">{progress}%</div>
                    <div className="progressbar"><div style={{ height: '100%', width: `${progress}%`, background: color }} /></div>
                </>
            )}
        </div>
    );
}

function CardStatBudget({ budget, project, onCommit, isPaid, isPartial, unpaid }: {
    budget: number;
    project: Project;
    onCommit: (n: number | null) => void;
    isPaid: boolean;
    isPartial: boolean;
    unpaid: number;
}) {
    return (
        <div className="pj-card-stat pj-card-stat-clickable">
            <div className="pj-card-stat-label">Budget</div>
            <div className="pj-card-stat-value">
                <NumericCell value={project.project_value} onCommit={onCommit} />
            </div>
            <div className="pj-card-stat-sub" style={{ color: isPaid ? 'var(--coach)' : (isPartial ? 'var(--warn)' : 'var(--danger)') }}>
                {PAID_LABEL[project.paid_status] || 'Unpaid'}
                {unpaid > 0 && <span style={{ color: 'var(--ink-muted)', marginLeft: 6 }}>· {fmt(unpaid)} open</span>}
            </div>
        </div>
    );
}

function CardStatDue({ dueLabel, dueIso, onCommit }: {
    dueLabel: string;
    dueIso: string | null | undefined;
    onCommit: (iso: string | null) => void;
}) {
    const [editing, setEditing] = useState(false);
    if (editing) {
        return (
            <div className="pj-card-stat pj-card-stat-clickable" style={{ cursor: 'default' }}>
                <div className="pj-card-stat-label">Due</div>
                <input
                    type="date"
                    autoFocus
                    value={toDateInputValue(dueIso)}
                    onChange={(e) => {
                        const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                        onCommit(v);
                    }}
                    onBlur={() => setEditing(false)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setEditing(false); }
                    }}
                    style={{
                        background: 'var(--canvas)', border: '1px solid var(--accent)',
                        borderRadius: 6, padding: '4px 8px', fontSize: 14,
                        color: 'var(--ink)', fontFamily: 'inherit', width: '100%',
                    }}
                />
            </div>
        );
    }
    return (
        <div
            className="pj-card-stat pj-card-stat-clickable"
            style={{ cursor: 'pointer' }}
            onClick={() => setEditing(true)}
        >
            <div className="pj-card-stat-label">Due</div>
            <div className="pj-card-stat-value">{dueLabel}</div>
            <div className="pj-card-stat-sub">{dueIso ? new Date(dueIso).toLocaleDateString('en-US', { weekday: 'short' }) : 'Click to set'}</div>
        </div>
    );
}

// One-click inline editor wrapper for the drawer's KPI tiles. Renders the
// `display` node by default. On click, swaps in `renderEditor` (a function
// receiving a `close` callback). The editor is normally a SmartSelect with
// defaultOpen+onClose so the popover appears in a single click and the tile
// snaps back to display once the popover closes.
function KpiEditable({ label, display, renderEditor }: {
    label: string;
    display: React.ReactNode;
    renderEditor: (close: () => void) => React.ReactNode;
}) {
    const [editing, setEditing] = useState(false);
    return (
        <div
            className="pj-kpi-editable"
            style={{ background: 'var(--surface)', padding: '14px 16px', cursor: editing ? 'default' : 'pointer' }}
            onClick={(e) => { if (!editing) { e.stopPropagation(); setEditing(true); } }}
        >
            <div style={{ fontSize: 10, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, marginBottom: 4 }}>{label}</div>
            {editing ? renderEditor(() => setEditing(false)) : display}
        </div>
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

function ProjectDetailPanel({ project, onClose, onUpdate, managers, clientOptions, accounts, isAdmin, onMessageClient, onAddTask }: {
    project: Project;
    onClose: () => void;
    onUpdate: (id: string, field: string, value: unknown) => void;
    managers: Manager[];
    clientOptions: { id: string; name: string; email: string }[];
    accounts: { id: string; email: string }[];
    isAdmin: boolean;
    onMessageClient: () => void;
    onAddTask: () => void;
}) {
    const stage = project.status || 'Not Started';
    const color = STAGE_COLOR[stage] || STAGE_COLOR[stage.toLowerCase()] || 'var(--ink-muted)';
    const label = STAGE_LABEL[stage] || stage.toUpperCase();
    const progress = estimateProgress(project);
    const clientName = project.client_name || project.person || 'Unknown';
    const budget = project.project_value || 0;
    const isPaid = project.paid_status === 'PAID';
    const isPartial = project.paid_status === 'PARTIALLY_PAID';
    const unpaid = isPaid ? 0 : (isPartial ? Math.round(budget / 2) : budget);
    const projectId = project.id?.slice(0, 8)?.toUpperCase() || 'N/A';
    const sourceInboxId = project.client_last_gmail_account_id || null;

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
                    <button
                        className="pj-panel-btn"
                        onClick={onMessageClient}
                        disabled={!project.client?.email}
                        title={project.client?.email ? `Compose to ${project.client.email}` : 'No client email on file'}
                    >
                        <MessageSquare size={12} /> Message client
                    </button>
                    <button className="pj-panel-btn" onClick={onAddTask}>
                        <CirclePlus size={12} /> Add task
                    </button>
                </div>

                {/* KPI row — every cell is interactive. Progress is a derived
                    value tied to status, so clicking it opens the Status
                    SmartSelect (defaultOpen=true so the popover lands in one
                    click). Budget edits projectValue directly. Unpaid is
                    derived from paidStatus; clicking it opens the Paid Status
                    picker. */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--hairline-soft)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
                    <KpiEditable
                        label="Progress"
                        display={(
                            <>
                                <div style={{ fontSize: 20, fontWeight: 700 }}>{progress}%</div>
                                <div className="progressbar" style={{ marginTop: 6 }}><div style={{ height: '100%', width: `${progress}%`, background: color }} /></div>
                            </>
                        )}
                        renderEditor={(close) => (
                            <SmartSelect
                                defaultOpen
                                onClose={close}
                                value={stage}
                                onChange={(v) => v && onUpdate(project.id, 'status', v)}
                                creatable
                                options={STATUS_OPTIONS}
                            />
                        )}
                    />
                    <div style={{ background: 'var(--surface)', padding: '14px 16px' }}>
                        <div style={{ fontSize: 10, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, marginBottom: 4 }}>Budget</div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>
                            <NumericCell
                                value={project.project_value}
                                onCommit={(n) => onUpdate(project.id, 'projectValue', n)}
                            />
                        </div>
                    </div>
                    <KpiEditable
                        label="Unpaid"
                        display={(
                            <div style={{ fontSize: 20, fontWeight: 700, color: unpaid > 0 ? 'var(--warn)' : 'var(--coach)' }}>{fmt(unpaid)}</div>
                        )}
                        renderEditor={(close) => (
                            <SmartSelect
                                defaultOpen
                                onClose={close}
                                value={project.paid_status || 'UNPAID'}
                                onChange={(v) => v && onUpdate(project.id, 'paidStatus', v)}
                                options={PAID_OPTIONS}
                            />
                        )}
                    />
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
                    {/* Source Gmail account — read-only display of the inbox the
                        contact first emailed us through. Surfacing it here so
                        the editor can see "this client lives in mailbox X" at a
                        glance. The link to a User goes through user_gmail_
                        assignments and feeds into resolvedAm above. */}
                    <KVCell k="Source Gmail">
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: sourceInboxId ? 'var(--ink)' : 'var(--ink-faint)' }}>
                            {sourceInboxId
                                ? (accounts.find(a => a.id === sourceInboxId)?.email || sourceInboxId)
                                : 'No source mailbox on contact'}
                        </span>
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

                {/* Milestones — derived from status, but each row is a one-click
                    promotion button. Clicking "First delivery" sets status to
                    Downloaded, "Revisions round 1" to In Progress (Editing),
                    "Final cut delivered" to Done. Already-completed milestones
                    are read-only (clicking would demote, which we don't want
                    by accident). */}
                <div style={{ marginBottom: 24 }}>
                    <div className="pj-panel-section-title">Milestones</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', paddingLeft: 20 }}>
                        <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 1, background: 'var(--hairline-soft)' }} />
                        {([
                            { label: 'Final cut delivered', date: relDate(project.due_date) || 'TBD', done: progress > 90, promoteTo: 'Done' as const, threshold: 90 },
                            { label: 'Revisions round 1', date: relDate(project.project_date) || 'TBD', done: progress > 50, promoteTo: 'In Progress' as const, threshold: 50 },
                            { label: 'First delivery', date: relDate(project.project_date) || 'TBD', done: progress > 30, promoteTo: 'Downloaded' as const, threshold: 30 },
                        ]).map((m, i) => {
                            const interactive = !m.done;
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => interactive && onUpdate(project.id, 'status', m.promoteTo)}
                                    disabled={!interactive}
                                    className="pj-milestone"
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 8px 8px 0',
                                        position: 'relative', background: 'none', border: 'none',
                                        textAlign: 'left', font: 'inherit',
                                        cursor: interactive ? 'pointer' : 'default',
                                        borderRadius: 6, marginLeft: -8, paddingLeft: 8,
                                        transition: 'background .12s',
                                    }}
                                >
                                    <div style={{ position: 'absolute', left: -16 }}>
                                        {m.done
                                            ? <CheckCircle2 size={14} style={{ color: 'var(--coach)' }} />
                                            : <Circle size={14} style={{ color: 'var(--ink-faint)' }} />
                                        }
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: m.done ? 500 : 400, color: m.done ? 'var(--ink)' : 'var(--ink-muted)' }}>{m.label}</div>
                                        <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                                            {m.done ? m.date : <span>Click to mark · sets status to <b style={{ color: 'var(--ink-muted)' }}>{STAGE_LABEL[m.promoteTo] || m.promoteTo}</b></span>}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
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
    const { setComposeOpen, setComposeDefaultTo, setComposeDefaultSubject, setComposeDefaultBody } = useUI();
    const { accounts } = useGlobalFilter();
    // Add-task modal state — keep terse so the button doesn't need a deep
    // routing flow, just an inline shell scrim that wraps the new action.
    const [addTaskFor, setAddTaskFor] = useState<string | null>(null);
    const [addTaskNote, setAddTaskNote] = useState('');
    const [addTaskSaving, setAddTaskSaving] = useState(false);
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

                    {/* Card list — original layout with the Status / Priority /
                        Paid pills swapped for SmartSelect chips so the inline
                        edit is a click away. Other fields (value, due, client,
                        owner) are read on the card and edited in the drawer.
                        Cards stop propagation around their interactive zones so
                        the SmartSelect popovers don't double-fire as a card
                        click that would open the drawer. */}
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {filteredProjects.map(p => {
                                const isSelected = selectedId === p.id;
                                const stage = p.status || 'Not Started';
                                const color = STAGE_COLOR[stage] || STAGE_COLOR[stage.toLowerCase()] || 'var(--ink-muted)';
                                const progress = estimateProgress(p);
                                const clientName = p.client_name || p.client?.name || p.person || 'Unknown';
                                // Owner is strictly the SALES rep assigned to the
                                // contact's source mailbox. No fallback — admins /
                                // AMs never bleed into this column even if they
                                // happen to be on user_gmail_assignments too.
                                const resolvedAm = p.resolvedAm as ResolvedAm | null;
                                const ownerName = resolvedAm?.name || 'Unassigned';
                                const ownerSource = resolvedAm?.source ?? null;
                                const budget = p.project_value || 0;
                                const isPaid = p.paid_status === 'PAID';
                                const isPartial = p.paid_status === 'PARTIALLY_PAID';
                                const unpaid = isPaid ? 0 : (isPartial ? Math.round(budget / 2) : budget);
                                const briefPreview = p.brief ? String(p.brief).slice(0, 60) : 'No brief yet';
                                const dueLabel = relDate(p.due_date) || '—';

                                return (
                                    <div
                                        key={p.id}
                                        className={`pj-card${isSelected ? ' pj-card-active' : ''}`}
                                        onClick={() => setSelectedId(isSelected ? null : p.id)}
                                    >
                                        {/* PM-id chip — top-right anchor so it never
                                            competes with the title for visual weight */}
                                        <div className="pj-card-topbar">
                                            <span className="pj-stage-dot" style={{ background: color }} />
                                            <span className="pj-card-stage">{(STAGE_LABEL[stage] || stage).toUpperCase()}</span>
                                            <div className="pj-card-spacer" />
                                            <span className="pj-card-id">PM-{p.id?.slice(0, 8)?.toUpperCase()}</span>
                                        </div>

                                        {/* Header — title + client subtitle on the left,
                                            pills on the right. Pills stop propagation so
                                            opening their popovers doesn't open the drawer. */}
                                        <div className="pj-card-header">
                                            <div className="pj-card-titlewrap">
                                                <h3 className="pj-card-title">{p.project_name || 'Untitled'}</h3>
                                                <div className="pj-card-client">
                                                    <span className={`avatar ${avClass(clientName)}`} style={{ width: 18, height: 18, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', color: 'white', fontSize: 8, fontWeight: 600 }}>
                                                        {getInitials(clientName)}
                                                    </span>
                                                    <span>{clientName}</span>
                                                </div>
                                            </div>
                                            <div className="pj-card-pills" onClick={e => e.stopPropagation()}>
                                                <SmartSelect
                                                    value={stage}
                                                    onChange={(v) => v && handleProjectUpdate(p.id, 'status', v)}
                                                    creatable
                                                    options={STATUS_OPTIONS}
                                                />
                                                <SmartSelect
                                                    value={p.priority || 'MEDIUM'}
                                                    onChange={(v) => v && handleProjectUpdate(p.id, 'priority', v)}
                                                    options={PRIORITY_OPTIONS}
                                                />
                                                <SmartSelect
                                                    value={p.paid_status || 'UNPAID'}
                                                    onChange={(v) => v && handleProjectUpdate(p.id, 'paidStatus', v)}
                                                    options={PAID_OPTIONS}
                                                />
                                            </div>
                                        </div>

                                        {/* 4-column stats grid — Progress | Budget | Due |
                                            Owner. The first three are interactive: clicking
                                            the tile flips it into edit mode (Status picker
                                            for Progress, NumericCell for Budget, native date
                                            input for Due). Owner is read-only because it's
                                            derived from the AM resolution chain — manual
                                            override still happens in the drawer's Account
                                            manager picker. */}
                                        <div className="pj-card-stats" onClick={e => e.stopPropagation()}>
                                            <CardStatStatus
                                                label="Progress"
                                                progress={progress}
                                                color={color}
                                                value={stage}
                                                onChange={(v) => v && handleProjectUpdate(p.id, 'status', v)}
                                            />
                                            <CardStatBudget
                                                budget={budget}
                                                project={p}
                                                onCommit={(n) => handleProjectUpdate(p.id, 'projectValue', n)}
                                                isPaid={isPaid}
                                                isPartial={isPartial}
                                                unpaid={unpaid}
                                            />
                                            <CardStatDue
                                                dueLabel={dueLabel}
                                                dueIso={p.due_date}
                                                onCommit={(iso) => handleProjectUpdate(p.id, 'dueDate', iso)}
                                            />
                                            <div className="pj-card-stat">
                                                <div className="pj-card-stat-label">Owner</div>
                                                <div className="pj-card-stat-owner">
                                                    {ownerName !== 'Unassigned' ? (
                                                        <>
                                                            <span className={`avatar ${avClass(ownerName)}`} style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', color: 'white', fontSize: 9.5, fontWeight: 600 }}>
                                                                {getInitials(ownerName)}
                                                            </span>
                                                            <span className="pj-card-stat-value" style={{ fontSize: 14 }}>{ownerName}</span>
                                                        </>
                                                    ) : (
                                                        <span className="pj-card-stat-value" style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>Unassigned</span>
                                                    )}
                                                </div>
                                                <div className="pj-card-stat-sub">
                                                    {ownerSource === 'mailbox'
                                                        ? <span title="Resolved from contact's source mailbox">via mailbox · {briefPreview}</span>
                                                        : briefPreview}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {selected && (
                    <ProjectDetailPanel
                        project={selected}
                        onClose={() => setSelectedId(null)}
                        onUpdate={handleProjectUpdate}
                        managers={managers}
                        clientOptions={clientOptions}
                        accounts={accounts}
                        isAdmin={isAdmin}
                        onMessageClient={() => {
                            const email = selected.client?.email || '';
                            if (!email) { showError('No client email on file'); return; }
                            setComposeDefaultTo(email);
                            setComposeDefaultSubject(selected.project_name ? `Re: ${selected.project_name}` : '');
                            setComposeDefaultBody('');
                            setComposeOpen(true);
                        }}
                        onAddTask={() => {
                            setAddTaskFor(selected.id);
                            setAddTaskNote('');
                        }}
                    />
                )}
            </div>

            {addTaskFor && (
                <div className="compose-scrim" onClick={() => setAddTaskFor(null)}>
                    <div className="compose pj-modal" onClick={e => e.stopPropagation()} style={{ maxHeight: 'fit-content', width: 480 }}>
                        <div className="compose-head">
                            <div className="title">Add task</div>
                            <div className="spacer" />
                            <button className="icon-btn" onClick={() => setAddTaskFor(null)} title="Close">×</button>
                        </div>
                        <div className="compose-body pj-modal-body">
                            <div className="pj-field">
                                <label>Task</label>
                                <textarea
                                    value={addTaskNote}
                                    onChange={(e) => setAddTaskNote(e.target.value)}
                                    placeholder="Describe what needs to happen — color grade, second cut, send invoice…"
                                    autoFocus
                                    rows={4}
                                    style={{ resize: 'vertical', minHeight: 100, lineHeight: 1.5 }}
                                />
                            </div>
                            <div className="pj-modal-foot">
                                <button
                                    className="btn"
                                    onClick={() => setAddTaskFor(null)}
                                    style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)', color: 'var(--ink-2)' }}
                                >Cancel</button>
                                <button
                                    className="btn btn-dark"
                                    disabled={addTaskSaving || !addTaskNote.trim()}
                                    onClick={async () => {
                                        if (!addTaskFor) return;
                                        setAddTaskSaving(true);
                                        const res = await addProjectTaskAction(addTaskFor, addTaskNote);
                                        setAddTaskSaving(false);
                                        if (res.success) {
                                            setAddTaskFor(null);
                                            setAddTaskNote('');
                                            showSuccess('Task added');
                                        } else {
                                            showError(res.error || 'Could not add task');
                                        }
                                    }}
                                >
                                    {addTaskSaving ? 'Adding…' : 'Add task'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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

/* Spacious "block" cards — top section (id chip + title row + pills)
   over a 4-up stats grid that breaks down to 2-up then 1-up on
   narrower viewports. Two-tone surface system gives the stats grid
   visible separation: card outer = surface-2, stats tiles = surface
   with a 1px hairline grid between them. */
.pj-page .pj-card{
    background:var(--surface-2);
    border:1px solid color-mix(in oklab, var(--hairline-soft), transparent 30%);
    border-radius:16px;
    padding:22px 24px 20px;
    cursor:pointer;
    transition:border-color .15s, box-shadow .15s, transform .15s;
    /* Layered ambient shadow — close + soft tight, then a wider
       diffuse halo. Reads as "floating block" in both themes. */
    box-shadow:
        0 1px 2px color-mix(in oklab, var(--ink) 4%, transparent),
        0 8px 24px color-mix(in oklab, var(--ink) 5%, transparent);
}
.pj-page .pj-card:hover{
    border-color:var(--hairline);
    transform:translateY(-2px);
    box-shadow:
        0 2px 4px color-mix(in oklab, var(--ink) 5%, transparent),
        0 16px 32px color-mix(in oklab, var(--ink) 8%, transparent);
}
.pj-page .pj-card-active{
    border-color:var(--accent);
    box-shadow:
        0 0 0 1px var(--accent),
        0 16px 32px color-mix(in oklab, var(--accent) 14%, transparent);
}

/* Topbar — stage dot + uppercase stage label on the left, PM-id on
   the right. Sits ABOVE the title block so it never competes for
   visual weight. */
.pj-page .pj-card-topbar{
    display:flex;
    align-items:center;
    gap:8px;
    margin-bottom:12px;
}
.pj-page .pj-stage-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.pj-page .pj-card-stage{
    font-size:10.5px;
    font-weight:600;
    letter-spacing:.08em;
    color:var(--ink-muted);
    text-transform:uppercase;
}
.pj-page .pj-card-spacer{flex:1}
.pj-page .pj-card-id{
    font-size:10.5px;
    color:var(--ink-faint);
    font-family:var(--font-mono, monospace);
    letter-spacing:.04em;
}

/* Header — title (large, bold) + client subtitle on the left, pill
   group on the right. flex-wrap so on cramped widths the pills drop
   to a new line under the title. */
.pj-page .pj-card-header{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:16px;
    margin-bottom:18px;
    flex-wrap:wrap;
}
.pj-page .pj-card-titlewrap{flex:1;min-width:0}
.pj-page .pj-card-title{
    font-size:18px;
    font-weight:700;
    color:var(--ink);
    letter-spacing:-0.01em;
    margin:0 0 6px;
    line-height:1.2;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
}
.pj-page .pj-card-client{
    display:inline-flex;
    align-items:center;
    gap:6px;
    font-size:13px;
    color:var(--ink-muted);
}
.pj-page .pj-card-pills{
    display:flex;
    align-items:center;
    gap:6px;
    flex-shrink:0;
    flex-wrap:wrap;
}

/* Stats grid — 4-up. The trick: the GRID has a hairline-soft bg and
   1px gaps between tiles, so each tile gets a hairline divider for
   free without per-side borders. */
.pj-page .pj-card-stats{
    display:grid;
    grid-template-columns:repeat(4, minmax(0, 1fr));
    gap:1px;
    background:var(--hairline-soft);
    border-radius:12px;
    overflow:hidden;
}
.pj-page .pj-card-stat{
    background:var(--surface);
    padding:14px 16px;
    display:flex;
    flex-direction:column;
    gap:6px;
    min-width:0;
}
.pj-page .pj-card-stat-label{
    font-size:10px;
    font-weight:600;
    color:var(--ink-muted);
    text-transform:uppercase;
    letter-spacing:.06em;
}
.pj-page .pj-card-stat-value{
    font-size:18px;
    font-weight:700;
    color:var(--ink);
    font-variant-numeric:tabular-nums;
    line-height:1.1;
    letter-spacing:-0.01em;
}
.pj-page .pj-card-stat-sub{
    font-size:11px;
    color:var(--ink-muted);
    line-height:1.3;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
}
.pj-page .pj-card-stat-owner{display:flex;align-items:center;gap:8px;min-width:0}
.pj-page .pj-card-stat-owner .pj-card-stat-value{
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
}

.pj-page .progressbar{
    height:6px;
    background:var(--surface-2);
    border-radius:99px;
    overflow:hidden;
    margin-top:2px;
}
.pj-page .progressbar div{border-radius:99px;transition:width .3s ease}

/* SmartSelect chips inside the card header read as compact pills,
   not full-width inputs. */
.pj-page .pj-card-pills .ep-ss-trigger{width:auto;flex-shrink:0}

/* Responsive — collapse the 4-up to 2-up then to a vertical stack so
   the cards stay readable on narrow / mobile viewports. */
@media (max-width: 980px){
    .pj-page .pj-card-stats{grid-template-columns:repeat(2, minmax(0, 1fr))}
}
@media (max-width: 600px){
    .pj-page .pj-card{padding:18px 18px 16px}
    .pj-page .pj-card-stats{grid-template-columns:1fr}
    .pj-page .pj-card-header{flex-direction:column;align-items:stretch;gap:12px}
    .pj-page .pj-card-pills{justify-content:flex-start}
}

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
