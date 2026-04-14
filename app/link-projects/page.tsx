'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import {
    getOrphanedProjectsAction,
    searchContactsForLinkingAction,
    linkProjectToContactAction,
} from '../../src/actions/projectActions';

function fmt(n: number) {
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
    return '$' + Math.round(n).toLocaleString();
}

type Project = any;
type Contact = any;

export default function LinkProjectsPage() {
    const hydrated = useHydrated();
    const [projects, setProjects] = useState<Project[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [activeProject, setActiveProject] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Contact[]>([]);
    const [searching, setSearching] = useState(false);
    const [linking, setLinking] = useState<string | null>(null);
    const [linked, setLinked] = useState<Set<string>>(new Set());
    const [todayLinked, setTodayLinked] = useState(0);
    const searchTimeout = useRef<NodeJS.Timeout>(undefined);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const DAILY_TARGET = 5;

    const loadProjects = useCallback(async (p: number) => {
        setLoading(true);
        const res = await getOrphanedProjectsAction(p, 10);
        setProjects(res.projects);
        setTotal(res.total);
        setPage(res.page);
        setTotalPages(res.totalPages);
        setLoading(false);
    }, []);

    useEffect(() => { loadProjects(1); }, [loadProjects]);

    // Focus search when project is selected
    useEffect(() => {
        if (activeProject) searchInputRef.current?.focus();
    }, [activeProject]);

    const handleSearch = (q: string) => {
        setSearchQuery(q);
        clearTimeout(searchTimeout.current);
        if (q.trim().length < 2) { setSearchResults([]); return; }
        searchTimeout.current = setTimeout(async () => {
            setSearching(true);
            const results = await searchContactsForLinkingAction(q);
            setSearchResults(results);
            setSearching(false);
        }, 300);
    };

    const handleLink = async (projectId: string, contactId: string) => {
        setLinking(projectId);
        const res = await linkProjectToContactAction(projectId, contactId);
        if (res.success) {
            setLinked(prev => new Set(prev).add(projectId));
            setTodayLinked(prev => prev + 1);
            setActiveProject(null);
            setSearchQuery('');
            setSearchResults([]);
            // Remove from list after brief animation
            setTimeout(() => {
                setProjects(prev => prev.filter(p => p.id !== projectId));
                setTotal(prev => prev - 1);
            }, 600);
        }
        setLinking(null);
    };

    const handleSkip = () => {
        setActiveProject(null);
        setSearchQuery('');
        setSearchResults([]);
    };

    if (!hydrated) return <PageLoader isLoading type="list"><div /></PageLoader>;

    const progress = Math.min(100, Math.round((todayLinked / DAILY_TARGET) * 100));

    return (
        <>
        <style>{`
.lp{height:100%;overflow-y:auto;background:#fff;font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#171717}
.lp-in{max-width:900px;margin:0 auto;padding:32px}
.lp-hd{margin-bottom:28px}
.lp-hd h1{font-size:24px;font-weight:700;letter-spacing:-.03em;margin:0}
.lp-hd p{font-size:13px;color:#a3a3a3;margin:4px 0 0}

/* Progress bar */
.lp-progress{background:#f5f5f5;border:1px solid #e5e5e5;border-radius:12px;padding:20px 24px;margin-bottom:24px;display:flex;align-items:center;gap:20px}
.lp-progress-info{flex:1}
.lp-progress-title{font-size:14px;font-weight:600;margin-bottom:8px}
.lp-progress-sub{font-size:12px;color:#a3a3a3}
.lp-progress-bar{flex:2;height:8px;background:#e5e5e5;border-radius:4px;overflow:hidden}
.lp-progress-fill{height:100%;border-radius:4px;transition:width .5s ease;background:#22c55e}
.lp-progress-pct{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;min-width:48px;text-align:right}
.lp-progress-done{color:#22c55e}

/* Stats */
.lp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
.lp-stat{background:#fafafa;border:1px solid #e5e5e5;border-radius:10px;padding:16px 18px;text-align:center}
.lp-stat-v{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
.lp-stat-l{font-size:11px;color:#a3a3a3;font-weight:500;text-transform:uppercase;letter-spacing:.04em;margin-top:2px}

/* Project card */
.lp-card{border:1px solid #e5e5e5;border-radius:12px;margin-bottom:12px;overflow:hidden;transition:all .3s}
.lp-card.active{border-color:#171717;box-shadow:0 4px 12px rgba(0,0,0,.08)}
.lp-card.linked{opacity:.5;transform:scale(.98);border-color:#22c55e}
.lp-card-main{display:flex;align-items:center;gap:16px;padding:16px 20px;cursor:pointer;transition:background .1s}
.lp-card-main:hover{background:#fafafa}
.lp-card-idx{width:28px;height:28px;border-radius:8px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#525252;flex-shrink:0}
.lp-card-name{font-size:14px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lp-card-meta{display:flex;gap:12px;align-items:center}
.lp-card-val{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
.lp-card-badge{font-size:10px;font-weight:600;padding:3px 10px;border-radius:6px}
.lp-card-date{font-size:11px;color:#a3a3a3}
.lp-card-am{font-size:11px;color:#737373;margin-left:8px}

/* Search panel */
.lp-search-panel{background:#fafafa;border-top:1px solid #f0f0f0;padding:16px 20px}
.lp-search-title{font-size:12px;font-weight:600;color:#525252;margin-bottom:10px}
.lp-search-input{width:100%;border:1px solid #e5e5e5;border-radius:8px;padding:10px 14px;font-size:13px;outline:none;background:#fff;transition:border .15s}
.lp-search-input:focus{border-color:#171717}
.lp-search-results{margin-top:10px}
.lp-search-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;transition:background .1s}
.lp-search-item:hover{background:#e5e5e5}
.lp-search-av{width:32px;height:32px;border-radius:8px;background:#171717;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0}
.lp-search-info{flex:1;min-width:0}
.lp-search-name{font-size:13px;font-weight:600}
.lp-search-email{font-size:11px;color:#a3a3a3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lp-search-rev{font-size:12px;font-weight:600;color:#22c55e;font-variant-numeric:tabular-nums}
.lp-search-empty{padding:16px;text-align:center;color:#a3a3a3;font-size:12px}
.lp-search-actions{display:flex;gap:8px;margin-top:12px}
.lp-btn{padding:8px 16px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;border:1px solid #e5e5e5;background:#fff;color:#525252}
.lp-btn:hover{background:#f5f5f5;color:#171717}

/* Pagination */
.lp-pag{display:flex;align-items:center;justify-content:space-between;margin-top:16px}
.lp-pag-info{font-size:12px;color:#a3a3a3}
.lp-pag-btns{display:flex;gap:4px}
.lp-pag-btn{width:32px;height:32px;border:1px solid #e5e5e5;border-radius:6px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;color:#525252}
.lp-pag-btn:hover{background:#f5f5f5}
.lp-pag-btn:disabled{opacity:.3;cursor:not-allowed}

/* Celebration */
.lp-celebrate{text-align:center;padding:32px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:24px}
.lp-celebrate-icon{font-size:48px;margin-bottom:8px}
.lp-celebrate-text{font-size:16px;font-weight:600;color:#22c55e}
.lp-celebrate-sub{font-size:12px;color:#86efac;margin-top:4px}
        `}</style>

        <div className="lp"><div className="lp-in">
            <div className="lp-hd">
                <h1>Link Orphaned Projects</h1>
                <p>Match projects to their correct client. Daily target: {DAILY_TARGET} projects.</p>
            </div>

            {/* Daily Progress */}
            <div className="lp-progress">
                <div className="lp-progress-info">
                    <div className="lp-progress-title">Today&apos;s Progress</div>
                    <div className="lp-progress-sub">{todayLinked} of {DAILY_TARGET} linked today</div>
                </div>
                <div className="lp-progress-bar">
                    <div className="lp-progress-fill" style={{ width: `${progress}%`, background: progress >= 100 ? '#22c55e' : '#171717' }} />
                </div>
                <div className={`lp-progress-pct ${progress >= 100 ? 'lp-progress-done' : ''}`}>{progress}%</div>
            </div>

            {/* Celebration */}
            {todayLinked >= DAILY_TARGET && (
                <div className="lp-celebrate">
                    <div className="lp-celebrate-icon">&#127881;</div>
                    <div className="lp-celebrate-text">Daily target complete!</div>
                    <div className="lp-celebrate-sub">Keep going or come back tomorrow</div>
                </div>
            )}

            {/* Stats */}
            <div className="lp-stats">
                <div className="lp-stat">
                    <div className="lp-stat-v">{total}</div>
                    <div className="lp-stat-l">Remaining</div>
                </div>
                <div className="lp-stat">
                    <div className="lp-stat-v" style={{ color: '#22c55e' }}>{todayLinked}</div>
                    <div className="lp-stat-l">Linked Today</div>
                </div>
                <div className="lp-stat">
                    <div className="lp-stat-v">{Math.ceil(total / DAILY_TARGET)}</div>
                    <div className="lp-stat-l">Days Left</div>
                </div>
            </div>

            {/* Project Cards */}
            {loading ? (
                <PageLoader isLoading type="list"><div /></PageLoader>
            ) : projects.length === 0 ? (
                <div className="lp-celebrate">
                    <div className="lp-celebrate-icon">&#9989;</div>
                    <div className="lp-celebrate-text">All projects are linked!</div>
                    <div className="lp-celebrate-sub">No orphaned projects remaining</div>
                </div>
            ) : (
                <>
                {projects.map((p, idx) => {
                    const isActive = activeProject === p.id;
                    const isLinked = linked.has(p.id);
                    const pay = p.paid_status === 'PAID'
                        ? { color: '#22c55e', bg: '#f0fdf4', label: 'Paid' }
                        : { color: '#ef4444', bg: '#fef2f2', label: 'Unpaid' };

                    return (
                        <div key={p.id} className={`lp-card ${isActive ? 'active' : ''} ${isLinked ? 'linked' : ''}`}>
                            <div className="lp-card-main" onClick={() => setActiveProject(isActive ? null : p.id)}>
                                <div className="lp-card-idx">{(page - 1) * 10 + idx + 1}</div>
                                <div className="lp-card-name">{p.project_name || 'Untitled'}</div>
                                <div className="lp-card-meta">
                                    {p.account_manager && <span className="lp-card-am">{p.account_manager}</span>}
                                    <span className="lp-card-date">{p.project_date ? new Date(p.project_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                                    <span className="lp-card-badge" style={{ color: pay.color, background: pay.bg }}>{pay.label}</span>
                                    <span className="lp-card-val">{p.project_value > 0 ? fmt(p.project_value) : '$0'}</span>
                                </div>
                            </div>

                            {isActive && (
                                <div className="lp-search-panel">
                                    <div className="lp-search-title">Search for the client this project belongs to:</div>
                                    <input
                                        ref={searchInputRef}
                                        className="lp-search-input"
                                        placeholder="Type client name, email, or company..."
                                        value={searchQuery}
                                        onChange={e => handleSearch(e.target.value)}
                                    />

                                    <div className="lp-search-results">
                                        {searching ? (
                                            <div className="lp-search-empty">Searching...</div>
                                        ) : searchResults.length > 0 ? (
                                            searchResults.map(c => (
                                                <div key={c.id} className="lp-search-item" onClick={() => handleLink(p.id, c.id)}>
                                                    <div className="lp-search-av">
                                                        {(c.name || '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                                                    </div>
                                                    <div className="lp-search-info">
                                                        <div className="lp-search-name">{c.name}</div>
                                                        <div className="lp-search-email">{c.email}{c.company ? ' \u00B7 ' + c.company : ''}{c.location ? ' \u00B7 ' + c.location : ''}</div>
                                                    </div>
                                                    {c.total_revenue > 0 && <div className="lp-search-rev">{fmt(c.total_revenue)}</div>}
                                                    <div style={{ fontSize: 11, color: '#a3a3a3' }}>{c.total_projects || 0} proj</div>
                                                </div>
                                            ))
                                        ) : searchQuery.length >= 2 ? (
                                            <div className="lp-search-empty">No matching contacts found</div>
                                        ) : null}
                                    </div>

                                    <div className="lp-search-actions">
                                        <button className="lp-btn" onClick={handleSkip}>Skip for now</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                <div className="lp-pag">
                    <span className="lp-pag-info">Page {page} of {totalPages} &middot; {total} orphaned projects</span>
                    <div className="lp-pag-btns">
                        <button className="lp-pag-btn" disabled={page <= 1} onClick={() => loadProjects(page - 1)}>&laquo;</button>
                        <button className="lp-pag-btn" disabled={page >= totalPages} onClick={() => loadProjects(page + 1)}>&raquo;</button>
                    </div>
                </div>
                </>
            )}
        </div></div>
        </>
    );
}
