'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { getAllProjectsAction } from '../../src/actions/projectActions';

/* ── Helpers ── */
function fmt(n: number) {
    if (n >= 10000) return '$' + (n / 1000).toFixed(0) + 'k';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
    return '$' + n.toLocaleString();
}
function relDate(d: string | null) {
    if (!d) return '\u2014';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_OPTIONS = ['All', 'Not Started', 'In Progress', 'Downloaded', 'Downloading', 'on Hold', 'Delivered', 'Done'];
const PAYMENT_OPTIONS = ['All', 'PAID', 'UNPAID', 'PARTIAL'];
const PAYMENT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    PAID: { label: 'Paid', color: '#22c55e', bg: '#f0fdf4' },
    UNPAID: { label: 'Unpaid', color: '#ef4444', bg: '#fef2f2' },
    PARTIAL: { label: 'Partial', color: '#f59e0b', bg: '#fffbeb' },
};

type SortField = 'project_name' | 'project_value' | 'project_date' | 'paid_status' | 'status';
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
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const pageSize = 20;

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

    // Client-side filtering & sorting
    const filtered = useMemo(() => {
        let data = [...projects];
        if (statusFilter !== 'All') data = data.filter(p => p.status === statusFilter);
        if (paymentFilter !== 'All') data = data.filter(p => p.paid_status === paymentFilter);
        if (sortField) {
            data.sort((a, b) => {
                let av = a[sortField], bv = b[sortField];
                if (sortField === 'project_value') { av = av || 0; bv = bv || 0; return sortDir === 'asc' ? av - bv : bv - av; }
                if (sortField === 'project_date') { av = av || ''; bv = bv || ''; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); }
                av = String(av || ''); bv = String(bv || '');
                return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
            });
        }
        return data;
    }, [projects, statusFilter, paymentFilter, sortField, sortDir]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            if (sortDir === 'asc') setSortDir('desc');
            else { setSortField(null); setSortDir('desc'); }
        } else { setSortField(field); setSortDir('asc'); }
    };

    const sortIcon = (field: SortField) => {
        if (sortField !== field) return ' \u2195';
        return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
    };

    const exportCSV = () => {
        const headers = ['Project Name', 'Client', 'Status', 'Revenue', 'Payment', 'Date'];
        const rows = filtered.map(p => [
            p.project_name || '',
            p.contacts?.name || '',
            p.status || '',
            p.project_value || 0,
            p.paid_status || '',
            p.project_date || '',
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'my-projects.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    if (!hydrated) return <PageLoader isLoading type="list"><div /></PageLoader>;

    return (
        <>
        <style>{`
.mp{height:100%;overflow-y:auto;background:#fff;font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#171717}
.mp-in{max-width:1440px;margin:0 auto;padding:32px}
.mp-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
.mp-hd h1{font-size:24px;font-weight:700;letter-spacing:-.03em;margin:0}
.mp-hd-actions{display:flex;gap:8px}
.mp-btn{background:#f5f5f5;border:1px solid #e5e5e5;color:#525252;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s}
.mp-btn:hover{background:#e5e5e5;color:#171717}
.mp-btn-primary{background:#0ea5e9;color:#fff;border:1px solid #0ea5e9}
.mp-btn-primary:hover{background:#0284c7}
.mp-filters{display:flex;gap:10px;align-items:center;margin-bottom:20px;flex-wrap:wrap}
.mp-search{border:1px solid #e5e5e5;border-radius:8px;padding:8px 14px;font-size:13px;width:260px;outline:none;transition:border .15s}
.mp-search:focus{border-color:#0ea5e9;box-shadow:0 0 0 3px rgba(14,165,233,.1)}
.mp-select{border:1px solid #e5e5e5;border-radius:8px;padding:8px 12px;font-size:12px;background:#fff;cursor:pointer;color:#525252}
.mp-chips{display:flex;gap:6px;flex-wrap:wrap}
.mp-chip{font-size:11px;padding:4px 10px;border-radius:6px;background:#f5f5f5;color:#525252;display:flex;align-items:center;gap:4px;cursor:pointer}
.mp-chip-x{font-size:14px;line-height:1;opacity:.5;margin-left:2px}
.mp-chip-x:hover{opacity:1}
.mp-tbl{width:100%;border-collapse:collapse}
.mp-tbl th{font-size:11px;font-weight:600;color:#a3a3a3;text-align:left;padding:10px 14px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e5e5;cursor:pointer;user-select:none;white-space:nowrap}
.mp-tbl th:hover{color:#171717}
.mp-tbl td{font-size:13px;padding:14px;border-bottom:1px solid #f5f5f5;vertical-align:top}
.mp-tbl tr:hover td{background:#fafafa}
.mp-tbl tr.mp-expanded td{background:#fafafa;border-bottom:none}
.mp-expand{background:#f5f5f5;border-radius:8px;padding:16px 20px;margin:0 14px 14px}
.mp-expand-row{display:flex;gap:24px;font-size:12px;margin-bottom:6px}
.mp-expand-label{color:#a3a3a3;font-weight:500;min-width:100px}
.mp-expand-value{color:#171717}
.mp-pay{font-size:10px;font-weight:600;padding:3px 10px;border-radius:6px}
.mp-status{font-size:11px;color:#525252}
.mp-pag{display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:16px;border-top:1px solid #f5f5f5}
.mp-pag-info{font-size:12px;color:#a3a3a3}
.mp-pag-btns{display:flex;gap:4px}
.mp-pag-btn{width:32px;height:32px;border:1px solid #e5e5e5;border-radius:6px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;font-weight:500;color:#525252}
.mp-pag-btn:hover{background:#f5f5f5}
.mp-pag-btn.active{background:#0ea5e9;color:#fff;border-color:#0ea5e9}
.mp-pag-btn:disabled{opacity:.3;cursor:not-allowed}
.mp-empty{text-align:center;padding:48px 24px;color:#a3a3a3}
.mp-empty-icon{font-size:32px;margin-bottom:8px;opacity:.4}
.mp-empty-text{font-size:14px;font-weight:500}
.mp-empty-sub{font-size:12px;color:#d4d4d4;margin-top:4px}
        `}</style>

        <div className="mp"><div className="mp-in">
            <div className="mp-hd">
                <h1>My Projects</h1>
                <div className="mp-hd-actions">
                    <button className="mp-btn" onClick={exportCSV}>Export CSV</button>
                </div>
            </div>

            {/* Filters */}
            <div className="mp-filters">
                <input
                    className="mp-search"
                    placeholder="Search projects..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); }}
                    onKeyDown={e => { if (e.key === 'Enter') loadProjects(1); }}
                />
                <select className="mp-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === 'All' ? 'All Status' : s}</option>)}
                </select>
                <select className="mp-select" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
                    {PAYMENT_OPTIONS.map(s => <option key={s} value={s}>{s === 'All' ? 'All Payments' : PAYMENT_LABELS[s]?.label || s}</option>)}
                </select>
                {(statusFilter !== 'All' || paymentFilter !== 'All') && (
                    <div className="mp-chips">
                        {statusFilter !== 'All' && (
                            <span className="mp-chip">{statusFilter} <span className="mp-chip-x" onClick={() => setStatusFilter('All')}>&times;</span></span>
                        )}
                        {paymentFilter !== 'All' && (
                            <span className="mp-chip">{PAYMENT_LABELS[paymentFilter]?.label || paymentFilter} <span className="mp-chip-x" onClick={() => setPaymentFilter('All')}>&times;</span></span>
                        )}
                        <span className="mp-chip" style={{ cursor: 'pointer', color: '#0ea5e9' }} onClick={() => { setStatusFilter('All'); setPaymentFilter('All'); }}>Clear All</span>
                    </div>
                )}
            </div>

            {/* Table */}
            {loading ? (
                <PageLoader isLoading type="list"><div /></PageLoader>
            ) : filtered.length === 0 ? (
                <div className="mp-empty">
                    <div className="mp-empty-icon">&#128203;</div>
                    <div className="mp-empty-text">No projects found</div>
                    <div className="mp-empty-sub">{search ? 'Try adjusting your search or filters.' : 'Your first project will appear here once you close a deal.'}</div>
                </div>
            ) : (
                <>
                <table className="mp-tbl">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('project_name')}>Project Name{sortIcon('project_name')}</th>
                            <th>Client</th>
                            <th onClick={() => handleSort('status')}>Status{sortIcon('status')}</th>
                            <th onClick={() => handleSort('project_value')} style={{ textAlign: 'right' }}>Revenue{sortIcon('project_value')}</th>
                            <th onClick={() => handleSort('paid_status')}>Payment{sortIcon('paid_status')}</th>
                            <th onClick={() => handleSort('project_date')} style={{ textAlign: 'right' }}>Date{sortIcon('project_date')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((p: Project) => {
                            const pay = PAYMENT_LABELS[p.paid_status] || PAYMENT_LABELS.UNPAID!;
                            const isExpanded = expandedId === p.id;
                            return (
                                <>{/* Fragment key on first element */}
                                <tr key={p.id} className={isExpanded ? 'mp-expanded' : ''} onClick={() => setExpandedId(isExpanded ? null : p.id)} style={{ cursor: 'pointer' }}>
                                    <td>
                                        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.project_name || 'Untitled'}</div>
                                    </td>
                                    <td style={{ fontSize: 12, color: '#525252' }}>{p.contacts?.name || '\u2014'}</td>
                                    <td><span className="mp-status">{p.status || 'Not Started'}</span></td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p.project_value > 0 ? fmt(p.project_value) : '\u2014'}</td>
                                    <td><span className="mp-pay" style={{ color: pay.color, background: pay.bg }}>{pay.label}</span></td>
                                    <td style={{ textAlign: 'right', fontSize: 12, color: '#a3a3a3', fontVariantNumeric: 'tabular-nums' }}>{relDate(p.project_date)}</td>
                                </tr>
                                {isExpanded && (
                                    <tr key={p.id + '-expand'}>
                                        <td colSpan={6} style={{ padding: 0 }}>
                                            <div className="mp-expand">
                                                {p.brief && <div className="mp-expand-row"><span className="mp-expand-label">Brief</span><span className="mp-expand-value">{p.brief}</span></div>}
                                                {p.project_link && <div className="mp-expand-row"><span className="mp-expand-label">Raw Data URL</span><a href={p.project_link} target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', fontSize: 12 }}>{p.project_link}</a></div>}
                                                {p.due_date && <div className="mp-expand-row"><span className="mp-expand-label">Due Date</span><span className="mp-expand-value">{relDate(p.due_date)}</span></div>}
                                                {p.account_manager && <div className="mp-expand-row"><span className="mp-expand-label">Account Manager</span><span className="mp-expand-value">{p.account_manager}</span></div>}
                                                {p.priority && <div className="mp-expand-row"><span className="mp-expand-label">Priority</span><span className="mp-expand-value">{p.priority}</span></div>}
                                                {p.quote > 0 && <div className="mp-expand-row"><span className="mp-expand-label">Quote</span><span className="mp-expand-value">{fmt(p.quote)}</span></div>}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                </>
                            );
                        })}
                    </tbody>
                </table>

                {/* Pagination */}
                <div className="mp-pag">
                    <span className="mp-pag-info">Showing {filtered.length} of {totalCount} projects &middot; Page {page} of {totalPages}</span>
                    <div className="mp-pag-btns">
                        <button className="mp-pag-btn" disabled={page <= 1} onClick={() => loadProjects(page - 1)}>&laquo;</button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                            const p = page <= 3 ? i + 1 : page + i - 2;
                            if (p < 1 || p > totalPages) return null;
                            return <button key={p} className={`mp-pag-btn ${p === page ? 'active' : ''}`} onClick={() => loadProjects(p)}>{p}</button>;
                        })}
                        <button className="mp-pag-btn" disabled={page >= totalPages} onClick={() => loadProjects(page + 1)}>&raquo;</button>
                    </div>
                </div>
                </>
            )}
        </div></div>
        </>
    );
}
