'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { getAllProjectsAction, updateProjectAction, createProjectAction } from '../../src/actions/projectActions';
import { getCurrentUserAction } from '../../src/actions/authActions';

const RevenueBarChart = dynamic(() => import('../components/RevenueBarChart'), { ssr: false });

/* ── Helpers ── */
function fmt(n: number) {
    if (n >= 10000) return '$' + (n / 1000).toFixed(0) + 'k';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
    return '$' + Math.round(n).toLocaleString();
}
function relDate(d: string | null) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATUS_OPTIONS = ['Not Started', 'Downloading', 'Downloaded', 'In Progress', 'on Hold', 'Delivered', 'Done'];
const PAYMENT_OPTIONS = ['PAID', 'UNPAID', 'PARTIAL'];
const PAY: Record<string, { label: string; color: string; bg: string }> = {
    PAID: { label: 'Paid', color: '#22c55e', bg: '#f0fdf4' },
    UNPAID: { label: 'Unpaid', color: '#ef4444', bg: '#fef2f2' },
    PARTIAL: { label: 'Partial', color: '#f59e0b', bg: '#fffbeb' },
};

type Project = any;

export default function MyProjectsPage() {
    const hydrated = useHydrated();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [paymentFilter, setPaymentFilter] = useState('All');
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
    const [editValue, setEditValue] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [saving, setSaving] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const editInputRef = useRef<HTMLInputElement>(null);
    const pageSize = 30;

    // Load user
    useEffect(() => {
        getCurrentUserAction().then(u => setUserName(u?.name?.split(' ')[0] || ''));
    }, []);

    // Load projects
    const loadProjects = useCallback(async (p: number) => {
        setLoading(true);
        const res = await getAllProjectsAction(undefined, p, pageSize, search || undefined);
        if (res && 'projects' in res) {
            setProjects(res.projects);
            setTotalPages(res.totalPages);
            setTotalCount(res.totalCount);
            setPage(res.page);
        } else if (Array.isArray(res)) {
            setProjects(res);
            setTotalCount(res.length);
            setTotalPages(1);
        }
        setLoading(false);
    }, [search]);

    useEffect(() => { loadProjects(1); }, [loadProjects]);

    // Focus edit input
    useEffect(() => {
        if (editingCell) editInputRef.current?.focus();
    }, [editingCell]);

    // Filter & sort
    const filtered = useMemo(() => {
        let data = [...projects];
        if (statusFilter !== 'All') data = data.filter(p => p.status === statusFilter);
        if (paymentFilter !== 'All') data = data.filter(p => p.paid_status === paymentFilter);
        if (sortField) {
            data.sort((a, b) => {
                const av = a[sortField] ?? '', bv = b[sortField] ?? '';
                if (sortField === 'project_value' || sortField === 'quote') return sortDir === 'asc' ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0);
                return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
            });
        }
        return data;
    }, [projects, statusFilter, paymentFilter, sortField, sortDir]);

    // Stats
    const stats = useMemo(() => {
        const total = filtered.reduce((s, p) => s + (p.project_value || 0), 0);
        const paid = filtered.filter(p => p.paid_status === 'PAID').reduce((s, p) => s + (p.project_value || 0), 0);
        const unpaid = total - paid;
        const count = filtered.length;
        const avgValue = count > 0 ? Math.round(total / count) : 0;
        return { total, paid, unpaid, count, avgValue };
    }, [filtered]);

    // Monthly data for chart
    const chartData = useMemo(() => {
        const monthly: Record<string, { revenue: number; projects: number }> = {};
        projects.forEach(p => {
            if (!p.project_date || !p.project_value) return;
            const d = new Date(p.project_date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!monthly[key]) monthly[key] = { revenue: 0, projects: 0 };
            monthly[key].revenue += p.project_value;
            monthly[key].projects++;
        });
        return Object.keys(monthly).sort().slice(-6).map(m => ({ month: m, ...monthly[m]! }));
    }, [projects]);

    // Inline edit
    const startEdit = (id: string, field: string, value: any) => {
        setEditingCell({ id, field });
        setEditValue(String(value ?? ''));
    };

    const saveEdit = async () => {
        if (!editingCell) return;
        setSaving(editingCell.id);
        const payload: any = {};
        if (editingCell.field === 'project_value') payload.projectValue = parseFloat(editValue) || 0;
        else if (editingCell.field === 'project_name') payload.projectName = editValue;
        else if (editingCell.field === 'paid_status') payload.paidStatus = editValue;
        else if (editingCell.field === 'status') payload.status = editValue;
        else if (editingCell.field === 'project_date') payload.projectDate = editValue;

        // Optimistic update
        setProjects(prev => prev.map(p => p.id === editingCell.id ? { ...p, [editingCell.field]: editingCell.field === 'project_value' ? parseFloat(editValue) || 0 : editValue } : p));
        setEditingCell(null);

        const res = await updateProjectAction(editingCell.id, payload);
        if (!res.success) loadProjects(page); // Revert on failure
        setSaving(null);
    };

    const handleEditKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') saveEdit();
        if (e.key === 'Escape') setEditingCell(null);
    };

    // Toggle paid status
    const togglePaid = async (p: Project) => {
        const newStatus = p.paid_status === 'PAID' ? 'UNPAID' : 'PAID';
        setProjects(prev => prev.map(x => x.id === p.id ? { ...x, paid_status: newStatus } : x));
        await updateProjectAction(p.id, { paidStatus: newStatus });
    };

    // Sort
    const handleSort = (field: string) => {
        if (sortField === field) {
            if (sortDir === 'asc') setSortDir('desc');
            else { setSortField(null); setSortDir('desc'); }
        } else { setSortField(field); setSortDir('asc'); }
    };
    const sortIcon = (field: string) => sortField !== field ? ' \u2195' : sortDir === 'asc' ? ' \u25B2' : ' \u25BC';

    // CSV export
    const exportCSV = () => {
        const headers = ['Project', 'Client', 'Status', 'Revenue', 'Payment', 'Date'];
        const rows = filtered.map(p => [p.project_name || '', p.client_name || '', p.status || '', p.project_value || 0, p.paid_status || '', p.project_date || '']);
        const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'my-projects.csv';
        a.click();
    };

    // Add project
    const [newProject, setNewProject] = useState({ name: '', value: '' });
    const handleAddProject = async () => {
        if (!newProject.name.trim()) return;
        setSaving('new');
        const today = new Date().toISOString().split('T')[0];
        const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
        // Get current user ID for account_manager_id
        const user = await getCurrentUserAction();
        const res = await createProjectAction({
            clientId: '' as string,
            projectName: newProject.name,
            projectDate: today as string,
            dueDate: dueDate as string,
            accountManagerId: (user as any)?.userId || '' as string,
            projectValue: parseFloat(newProject.value) || 0,
            paidStatus: 'UNPAID',
        });
        if (res.success) {
            setShowAddModal(false);
            setNewProject({ name: '', value: '' });
            loadProjects(1);
        }
        setSaving(null);
    };

    if (!hydrated) return <PageLoader isLoading type="list" context="projects"><div /></PageLoader>;

    return (
        <>
        <style>{`
/* ── My Projects — Notion Style ── */
.mp{height:100%;overflow-y:auto;background:#fff;font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#171717}
.mp-in{max-width:1440px;margin:0 auto;padding:32px}

/* Header */
.mp-hd{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:28px}
.mp-hd h1{font-size:24px;font-weight:700;letter-spacing:-.03em;margin:0}
.mp-hd p{font-size:13px;color:#a3a3a3;margin:4px 0 0}
.mp-hd-actions{display:flex;gap:8px}

/* Buttons */
.mp-btn{background:#f5f5f5;border:1px solid #e5e5e5;color:#525252;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s}
.mp-btn:hover{background:#e5e5e5;color:#171717}
.mp-btn-primary{background:#171717;color:#fff;border:1px solid #171717}
.mp-btn-primary:hover{background:#333}

/* KPI Strip */
.mp-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:#e5e5e5;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;margin-bottom:24px}
.mp-kpi{background:#fff;padding:18px 20px}
.mp-kpi:first-child{border-radius:12px 0 0 12px}
.mp-kpi:last-child{border-radius:0 12px 12px 0}
.mp-kpi-l{font-size:11px;color:#a3a3a3;font-weight:500;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
.mp-kpi-v{font-size:22px;font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums}

/* Chart Section */
.mp-chart{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:24px;margin-bottom:24px}
.mp-chart-h{font-size:14px;font-weight:600;margin-bottom:16px}

/* Filters */
.mp-filters{display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
.mp-search{border:1px solid #e5e5e5;border-radius:8px;padding:8px 14px;font-size:13px;width:260px;outline:none;transition:border .15s}
.mp-search:focus{border-color:#171717}
.mp-select{border:1px solid #e5e5e5;border-radius:8px;padding:8px 12px;font-size:12px;background:#fff;cursor:pointer;color:#525252}
.mp-chip{font-size:11px;padding:4px 10px;border-radius:6px;background:#f5f5f5;color:#525252;cursor:pointer;display:flex;align-items:center;gap:4px}
.mp-chip-x{opacity:.5;cursor:pointer}.mp-chip-x:hover{opacity:1}

/* Table */
.mp-tbl{width:100%;border-collapse:collapse;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden}
.mp-tbl th{font-size:11px;font-weight:600;color:#a3a3a3;text-align:left;padding:10px 14px;text-transform:uppercase;letter-spacing:.04em;background:#fafafa;border-bottom:1px solid #e5e5e5;cursor:pointer;user-select:none;white-space:nowrap}
.mp-tbl th:hover{color:#171717}
.mp-tbl td{font-size:13px;padding:0;border-bottom:1px solid #f5f5f5;height:44px}
.mp-tbl tr:hover td{background:#fafafa}
.mp-tbl tr:last-child td{border-bottom:none}
.mp-cell{padding:10px 14px;cursor:default;min-height:44px;display:flex;align-items:center}
.mp-cell-edit{cursor:text}
.mp-cell-edit:hover{background:#f0f9ff;border-radius:4px}
.mp-cell input,.mp-cell select{border:2px solid #171717;border-radius:6px;padding:4px 8px;font-size:13px;outline:none;width:100%;background:#fff;font-family:inherit}

/* Payment Badge */
.mp-pay{font-size:10px;font-weight:600;padding:3px 10px;border-radius:6px;cursor:pointer;transition:all .15s;user-select:none}
.mp-pay:hover{opacity:.8}

/* Status Select */
.mp-status-sel{font-size:11px;padding:3px 8px;border-radius:6px;border:1px solid #e5e5e5;background:#fff;cursor:pointer;color:#525252}

/* Expand Row */
.mp-expand{background:#fafafa;padding:16px 20px;border-bottom:1px solid #f0f0f0}
.mp-expand-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.mp-expand-item{font-size:12px}
.mp-expand-label{color:#a3a3a3;font-weight:500;margin-bottom:2px}
.mp-expand-value{color:#171717}

/* Pagination */
.mp-pag{display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:16px;border-top:1px solid #f5f5f5}
.mp-pag-info{font-size:12px;color:#a3a3a3}
.mp-pag-btns{display:flex;gap:4px}
.mp-pag-btn{width:32px;height:32px;border:1px solid #e5e5e5;border-radius:6px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;font-weight:500;color:#525252}
.mp-pag-btn:hover{background:#f5f5f5}
.mp-pag-btn.active{background:#171717;color:#fff;border-color:#171717}
.mp-pag-btn:disabled{opacity:.3;cursor:not-allowed}

/* Empty */
.mp-empty{text-align:center;padding:48px;color:#a3a3a3}
.mp-empty-icon{font-size:32px;margin-bottom:8px;opacity:.4}

/* Modal */
.mp-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center}
.mp-modal{background:#fff;border-radius:16px;padding:32px;width:480px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.15)}
.mp-modal h2{font-size:18px;font-weight:700;margin:0 0 24px;letter-spacing:-.02em}
.mp-modal-field{margin-bottom:16px}
.mp-modal-field label{display:block;font-size:12px;font-weight:500;color:#a3a3a3;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em}
.mp-modal-field input{width:100%;border:1px solid #e5e5e5;border-radius:8px;padding:10px 14px;font-size:14px;outline:none;transition:border .15s}
.mp-modal-field input:focus{border-color:#171717}
.mp-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:24px}

/* Saving indicator */
.mp-saving{opacity:.5;pointer-events:none}

/* Row add button */
.mp-add-row{border:none;background:none;color:#a3a3a3;cursor:pointer;font-size:12px;padding:10px 14px;width:100%;text-align:left;transition:all .15s}
.mp-add-row:hover{color:#171717;background:#f5f5f5}
        `}</style>

        <div className="mp"><div className="mp-in">
            {/* Header */}
            <div className="mp-hd">
                <div>
                    <h1>{userName ? `${userName}'s Projects` : 'My Projects'}</h1>
                    <p>{totalCount} projects &middot; {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                </div>
                <div className="mp-hd-actions">
                    <button className="mp-btn" onClick={exportCSV}>Export CSV</button>
                    <button className="mp-btn-primary mp-btn" onClick={() => setShowAddModal(true)}>+ New Project</button>
                </div>
            </div>

            {/* KPI Strip */}
            <div className="mp-kpis">
                <div className="mp-kpi">
                    <div className="mp-kpi-l">Total Revenue</div>
                    <div className="mp-kpi-v">{fmt(stats.total)}</div>
                </div>
                <div className="mp-kpi">
                    <div className="mp-kpi-l">Paid</div>
                    <div className="mp-kpi-v" style={{ color: '#22c55e' }}>{fmt(stats.paid)}</div>
                </div>
                <div className="mp-kpi">
                    <div className="mp-kpi-l">Unpaid</div>
                    <div className="mp-kpi-v" style={{ color: stats.unpaid > 0 ? '#ef4444' : '#22c55e' }}>{fmt(stats.unpaid)}</div>
                </div>
                <div className="mp-kpi">
                    <div className="mp-kpi-l">Projects</div>
                    <div className="mp-kpi-v">{stats.count}</div>
                </div>
                <div className="mp-kpi">
                    <div className="mp-kpi-l">Avg Value</div>
                    <div className="mp-kpi-v">{fmt(stats.avgValue)}</div>
                </div>
            </div>

            {/* Revenue Chart */}
            {chartData.length > 0 && (
                <div className="mp-chart">
                    <div className="mp-chart-h">Monthly Revenue</div>
                    <div style={{ height: 200 }}>
                        <RevenueBarChart data={chartData} paidTotal={stats.paid} totalRevenue={stats.total} />
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="mp-filters">
                <input
                    className="mp-search"
                    placeholder="Search projects..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') loadProjects(1); }}
                />
                <select className="mp-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="All">All Status</option>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="mp-select" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
                    <option value="All">All Payments</option>
                    {PAYMENT_OPTIONS.map(s => <option key={s} value={s}>{PAY[s]?.label || s}</option>)}
                </select>
                {(statusFilter !== 'All' || paymentFilter !== 'All') && (
                    <>
                        {statusFilter !== 'All' && <span className="mp-chip">{statusFilter} <span className="mp-chip-x" onClick={() => setStatusFilter('All')}>&times;</span></span>}
                        {paymentFilter !== 'All' && <span className="mp-chip">{PAY[paymentFilter]?.label} <span className="mp-chip-x" onClick={() => setPaymentFilter('All')}>&times;</span></span>}
                        <span className="mp-chip" style={{ color: '#171717', cursor: 'pointer' }} onClick={() => { setStatusFilter('All'); setPaymentFilter('All'); }}>Clear</span>
                    </>
                )}
            </div>

            {/* Table */}
            {loading ? (
                <PageLoader isLoading type="list"><div /></PageLoader>
            ) : filtered.length === 0 ? (
                <div className="mp-empty">
                    <div className="mp-empty-icon">&#128203;</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>No projects found</div>
                    <div style={{ fontSize: 12, color: '#d4d4d4', marginTop: 4 }}>{search ? 'Try adjusting your search.' : 'Click "+ New Project" to create your first project.'}</div>
                </div>
            ) : (
                <>
                <table className="mp-tbl">
                    <thead>
                        <tr>
                            <th style={{ width: 28 }}></th>
                            <th onClick={() => handleSort('project_name')} style={{ minWidth: 200 }}>Project{sortIcon('project_name')}</th>
                            <th style={{ minWidth: 120 }}>Client</th>
                            <th onClick={() => handleSort('status')}>Status{sortIcon('status')}</th>
                            <th onClick={() => handleSort('project_value')} style={{ textAlign: 'right', minWidth: 100 }}>Value{sortIcon('project_value')}</th>
                            <th onClick={() => handleSort('paid_status')} style={{ minWidth: 80 }}>Payment{sortIcon('paid_status')}</th>
                            <th onClick={() => handleSort('project_date')} style={{ textAlign: 'right' }}>Date{sortIcon('project_date')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(p => {
                            const pay = PAY[p.paid_status] || PAY.UNPAID!;
                            const isExpanded = expandedId === p.id;
                            const isSaving = saving === p.id;
                            return (
                                <>{/* Keyed on first tr */}
                                <tr key={p.id} className={isSaving ? 'mp-saving' : ''}>
                                    {/* Expand toggle */}
                                    <td>
                                        <div className="mp-cell" onClick={() => setExpandedId(isExpanded ? null : p.id)} style={{ cursor: 'pointer', color: '#d4d4d4', fontSize: 10 }}>
                                            {isExpanded ? '\u25BC' : '\u25B6'}
                                        </div>
                                    </td>

                                    {/* Project Name — inline editable */}
                                    <td>
                                        {editingCell?.id === p.id && editingCell?.field === 'project_name' ? (
                                            <div className="mp-cell">
                                                <input ref={editInputRef} value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={handleEditKeyDown} onBlur={saveEdit} />
                                            </div>
                                        ) : (
                                            <div className="mp-cell mp-cell-edit" onClick={() => startEdit(p.id, 'project_name', p.project_name)} style={{ fontWeight: 600 }}>
                                                {p.project_name || 'Untitled'}
                                            </div>
                                        )}
                                    </td>

                                    {/* Client */}
                                    <td><div className="mp-cell" style={{ color: '#525252', fontSize: 12 }}>{p.client_name || '\u2014'}</div></td>

                                    {/* Status — dropdown */}
                                    <td>
                                        <div className="mp-cell">
                                            <select
                                                className="mp-status-sel"
                                                value={p.status || 'Not Started'}
                                                onChange={async e => {
                                                    const val = e.target.value;
                                                    setProjects(prev => prev.map(x => x.id === p.id ? { ...x, status: val } : x));
                                                    await updateProjectAction(p.id, { status: val });
                                                }}
                                            >
                                                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                    </td>

                                    {/* Value — inline editable */}
                                    <td>
                                        {editingCell?.id === p.id && editingCell?.field === 'project_value' ? (
                                            <div className="mp-cell" style={{ justifyContent: 'flex-end' }}>
                                                <input ref={editInputRef} type="number" value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={handleEditKeyDown} onBlur={saveEdit} style={{ textAlign: 'right', width: 80 }} />
                                            </div>
                                        ) : (
                                            <div className="mp-cell mp-cell-edit" onClick={() => startEdit(p.id, 'project_value', p.project_value)} style={{ justifyContent: 'flex-end', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                                {p.project_value > 0 ? fmt(p.project_value) : '\u2014'}
                                            </div>
                                        )}
                                    </td>

                                    {/* Payment — click to toggle */}
                                    <td>
                                        <div className="mp-cell">
                                            <span className="mp-pay" style={{ color: pay.color, background: pay.bg }} onClick={() => togglePaid(p)}>
                                                {pay.label}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Date */}
                                    <td>
                                        <div className="mp-cell" style={{ justifyContent: 'flex-end', fontSize: 12, color: '#a3a3a3', fontVariantNumeric: 'tabular-nums' }}>
                                            {relDate(p.project_date)}
                                        </div>
                                    </td>
                                </tr>

                                {/* Expanded details */}
                                {isExpanded && (
                                    <tr key={p.id + '-exp'}>
                                        <td colSpan={7} style={{ padding: 0 }}>
                                            <div className="mp-expand">
                                                <div className="mp-expand-grid">
                                                    <div className="mp-expand-item">
                                                        <div className="mp-expand-label">Brief</div>
                                                        <div className="mp-expand-value">{p.brief || 'No brief'}</div>
                                                    </div>
                                                    <div className="mp-expand-item">
                                                        <div className="mp-expand-label">Due Date</div>
                                                        <div className="mp-expand-value">{relDate(p.due_date) || 'Not set'}</div>
                                                    </div>
                                                    <div className="mp-expand-item">
                                                        <div className="mp-expand-label">Quote</div>
                                                        <div className="mp-expand-value">{p.quote > 0 ? fmt(p.quote) : 'Not set'}</div>
                                                    </div>
                                                    <div className="mp-expand-item">
                                                        <div className="mp-expand-label">Account Manager</div>
                                                        <div className="mp-expand-value">{p.account_manager || 'Unassigned'}</div>
                                                    </div>
                                                    <div className="mp-expand-item">
                                                        <div className="mp-expand-label">Priority</div>
                                                        <div className="mp-expand-value">{p.priority || 'Normal'}</div>
                                                    </div>
                                                    {p.project_link && (
                                                        <div className="mp-expand-item">
                                                            <div className="mp-expand-label">Raw Data</div>
                                                            <a href={p.project_link} target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', fontSize: 12 }}>Open link</a>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                </>
                            );
                        })}

                        {/* Add row button */}
                        <tr>
                            <td colSpan={7} style={{ padding: 0 }}>
                                <button className="mp-add-row" onClick={() => setShowAddModal(true)}>+ New Project</button>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* Pagination */}
                <div className="mp-pag">
                    <span className="mp-pag-info">Showing {filtered.length} of {totalCount} &middot; Page {page}/{totalPages}</span>
                    <div className="mp-pag-btns">
                        <button className="mp-pag-btn" disabled={page <= 1} onClick={() => loadProjects(page - 1)}>&laquo;</button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                            const n = page <= 3 ? i + 1 : page + i - 2;
                            if (n < 1 || n > totalPages) return null;
                            return <button key={n} className={`mp-pag-btn ${n === page ? 'active' : ''}`} onClick={() => loadProjects(n)}>{n}</button>;
                        })}
                        <button className="mp-pag-btn" disabled={page >= totalPages} onClick={() => loadProjects(page + 1)}>&raquo;</button>
                    </div>
                </div>
                </>
            )}
        </div></div>

        {/* Add Project Modal */}
        {showAddModal && (
            <div className="mp-overlay" onClick={() => setShowAddModal(false)}>
                <div className="mp-modal" onClick={e => e.stopPropagation()}>
                    <h2>New Project</h2>
                    <div className="mp-modal-field">
                        <label>Project Name</label>
                        <input value={newProject.name} onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Sarah & Mike Wedding" autoFocus />
                    </div>
                    <div className="mp-modal-field">
                        <label>Value ($)</label>
                        <input type="number" value={newProject.value} onChange={e => setNewProject(p => ({ ...p, value: e.target.value }))} placeholder="e.g. 350" />
                    </div>
                    <div className="mp-modal-actions">
                        <button className="mp-btn" onClick={() => setShowAddModal(false)}>Cancel</button>
                        <button className="mp-btn mp-btn-primary" onClick={handleAddProject} disabled={saving === 'new' || !newProject.name.trim()}>
                            {saving === 'new' ? 'Creating...' : 'Create Project'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
