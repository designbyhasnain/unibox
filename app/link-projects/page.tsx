'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import {
    getOrphanedProjectsAction,
    searchContactsForLinkingAction,
    linkProjectToContactAction,
    getSuspiciousLinksAction,
    unlinkContactProjectsAction,
} from '../../src/actions/projectActions';

function fmt(n: number) {
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
    return '$' + Math.round(n).toLocaleString();
}
function ini(n: string) { return (n || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }

type Project = any;
type Contact = any;

export default function LinkProjectsPage() {
    const hydrated = useHydrated();
    const [tab, setTab] = useState<'orphaned' | 'suspicious'>('orphaned');

    // Orphaned state
    const [projects, setProjects] = useState<Project[]>([]);
    const [suggestions, setSuggestions] = useState<Record<string, any[]>>({});
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [activeProject, setActiveProject] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Contact[]>([]);
    const [searching, setSearching] = useState(false);
    const [linking, setLinking] = useState<string | null>(null);
    const [todayLinked, setTodayLinked] = useState(0);
    const searchTimeout = useRef<NodeJS.Timeout>(undefined);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Suspicious state
    const [suspects, setSuspects] = useState<any[]>([]);
    const [suspectLoading, setSuspectLoading] = useState(false);
    const [unlinking, setUnlinking] = useState<string | null>(null);

    const DAILY_TARGET = 5;

    const loadProjects = useCallback(async (p: number) => {
        setLoading(true);
        const res = await getOrphanedProjectsAction(p, 8);
        setProjects(res.projects);
        setSuggestions(res.suggestions || {});
        setTotal(res.total);
        setPage(res.page);
        setTotalPages(res.totalPages);
        setLoading(false);
    }, []);

    const loadSuspects = useCallback(async () => {
        setSuspectLoading(true);
        const data = await getSuspiciousLinksAction();
        setSuspects(data);
        setSuspectLoading(false);
    }, []);

    useEffect(() => { loadProjects(1); }, [loadProjects]);
    useEffect(() => { if (tab === 'suspicious' && suspects.length === 0) loadSuspects(); }, [tab, loadSuspects, suspects.length]);

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
            setTodayLinked(prev => prev + 1);
            setActiveProject(null);
            setSearchQuery('');
            setSearchResults([]);
            setTimeout(() => {
                setProjects(prev => prev.filter(p => p.id !== projectId));
                setTotal(prev => prev - 1);
            }, 400);
        }
        setLinking(null);
    };

    const handleUnlink = async (contactId: string) => {
        setUnlinking(contactId);
        const res = await unlinkContactProjectsAction(contactId);
        if (res.success) {
            setSuspects(prev => prev.filter(s => s.id !== contactId));
            loadProjects(page); // Refresh orphaned list
        }
        setUnlinking(null);
    };

    if (!hydrated) return <PageLoader isLoading type="list"><div /></PageLoader>;

    const progress = Math.min(100, Math.round((todayLinked / DAILY_TARGET) * 100));

    return (
        <>
        <style>{`
.lp{height:100%;overflow-y:auto;background:#fff;font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#171717}
.lp-in{max-width:960px;margin:0 auto;padding:32px}
.lp-hd{margin-bottom:24px}
.lp-hd h1{font-size:24px;font-weight:700;letter-spacing:-.03em;margin:0}
.lp-hd p{font-size:13px;color:#a3a3a3;margin:4px 0 0}

/* Tabs */
.lp-tabs{display:flex;gap:2px;background:#f5f5f5;border-radius:10px;padding:3px;margin-bottom:24px;width:fit-content}
.lp-tab{padding:8px 20px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;color:#737373;background:none;border:none;transition:all .15s}
.lp-tab.active{background:#fff;color:#171717;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.08)}

/* Progress */
.lp-progress{background:#fafafa;border:1px solid #e5e5e5;border-radius:12px;padding:18px 24px;margin-bottom:20px;display:flex;align-items:center;gap:20px}
.lp-progress-info{flex:1}
.lp-progress-title{font-size:13px;font-weight:600}
.lp-progress-sub{font-size:11px;color:#a3a3a3;margin-top:2px}
.lp-progress-bar{flex:2;height:6px;background:#e5e5e5;border-radius:3px;overflow:hidden}
.lp-progress-fill{height:100%;border-radius:3px;transition:width .5s ease}
.lp-progress-pct{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;min-width:44px;text-align:right}

/* Stats */
.lp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
.lp-stat{background:#fafafa;border:1px solid #e5e5e5;border-radius:10px;padding:14px;text-align:center}
.lp-stat-v{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
.lp-stat-l{font-size:10px;color:#a3a3a3;font-weight:500;text-transform:uppercase;letter-spacing:.04em;margin-top:2px}

/* Project card */
.lp-card{border:1px solid #e5e5e5;border-radius:12px;margin-bottom:10px;overflow:hidden;transition:all .3s}
.lp-card.active{border-color:#171717;box-shadow:0 4px 16px rgba(0,0,0,.08)}
.lp-card-main{display:flex;align-items:center;gap:14px;padding:14px 18px;cursor:pointer;transition:background .1s}
.lp-card-main:hover{background:#fafafa}
.lp-card-idx{width:26px;height:26px;border-radius:7px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#525252;flex-shrink:0}
.lp-card-body{flex:1;min-width:0}
.lp-card-name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lp-card-meta{font-size:11px;color:#a3a3a3;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap}
.lp-card-right{display:flex;gap:10px;align-items:center;flex-shrink:0}
.lp-card-val{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
.lp-badge{font-size:9px;font-weight:600;padding:3px 8px;border-radius:5px}

/* Search panel */
.lp-panel{background:#fafafa;border-top:1px solid #f0f0f0;padding:16px 18px}
.lp-panel-title{font-size:12px;font-weight:600;color:#525252;margin-bottom:6px}
.lp-panel-context{font-size:11px;color:#a3a3a3;margin-bottom:12px;line-height:1.5}

/* Suggestions */
.lp-suggest{margin-bottom:12px}
.lp-suggest-title{font-size:11px;font-weight:600;color:#0ea5e9;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em}
.lp-suggest-list{display:flex;flex-direction:column;gap:4px}

/* Contact item */
.lp-contact{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;transition:background .1s;border:1px solid transparent}
.lp-contact:hover{background:#e5e5e5;border-color:#d4d4d4}
.lp-contact-av{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#fff;flex-shrink:0}
.lp-contact-info{flex:1;min-width:0}
.lp-contact-name{font-size:12px;font-weight:600}
.lp-contact-email{font-size:10px;color:#a3a3a3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lp-contact-stats{text-align:right;flex-shrink:0}
.lp-contact-rev{font-size:11px;font-weight:600;color:#22c55e}
.lp-contact-count{font-size:9px;color:#a3a3a3}

/* Search input */
.lp-search{width:100%;border:1px solid #e5e5e5;border-radius:8px;padding:9px 12px;font-size:12px;outline:none;background:#fff;transition:border .15s}
.lp-search:focus{border-color:#171717}
.lp-search-empty{padding:12px;text-align:center;color:#a3a3a3;font-size:11px}
.lp-panel-actions{display:flex;gap:6px;margin-top:10px}
.lp-btn{padding:7px 14px;border-radius:7px;font-size:11px;font-weight:500;cursor:pointer;transition:all .15s;border:1px solid #e5e5e5;background:#fff;color:#525252}
.lp-btn:hover{background:#f5f5f5;color:#171717}

/* Suspicious tab */
.lp-suspect{border:1px solid #fecaca;border-radius:12px;padding:16px 18px;margin-bottom:10px;display:flex;align-items:center;gap:14px}
.lp-suspect-info{flex:1}
.lp-suspect-name{font-size:13px;font-weight:600}
.lp-suspect-meta{font-size:11px;color:#a3a3a3;margin-top:2px}
.lp-suspect-stats{display:flex;gap:16px;font-size:12px;margin-top:6px}
.lp-suspect-stat{display:flex;flex-direction:column;align-items:center}
.lp-suspect-stat-v{font-weight:700;font-variant-numeric:tabular-nums}
.lp-suspect-stat-l{font-size:9px;color:#a3a3a3;text-transform:uppercase}
.lp-suspect-action{flex-shrink:0}
.lp-btn-danger{background:#fef2f2;color:#ef4444;border-color:#fecaca}
.lp-btn-danger:hover{background:#fee2e2;color:#dc2626}

/* Pagination */
.lp-pag{display:flex;align-items:center;justify-content:space-between;margin-top:16px}
.lp-pag-info{font-size:11px;color:#a3a3a3}
.lp-pag-btns{display:flex;gap:4px}
.lp-pag-btn{width:30px;height:30px;border:1px solid #e5e5e5;border-radius:6px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;color:#525252}
.lp-pag-btn:hover{background:#f5f5f5}
.lp-pag-btn:disabled{opacity:.3;cursor:not-allowed}

.lp-done{text-align:center;padding:32px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px}
.lp-done-icon{font-size:40px;margin-bottom:6px}
.lp-done-text{font-size:15px;font-weight:600;color:#22c55e}
.lp-done-sub{font-size:12px;color:#86efac;margin-top:4px}
        `}</style>

        <div className="lp"><div className="lp-in">
            <div className="lp-hd">
                <h1>Link Projects</h1>
                <p>Match orphaned projects to the correct filmmaker client. Fix misattributed links.</p>
            </div>

            {/* Tabs */}
            <div className="lp-tabs">
                <button className={`lp-tab ${tab === 'orphaned' ? 'active' : ''}`} onClick={() => setTab('orphaned')}>
                    Orphaned ({total})
                </button>
                <button className={`lp-tab ${tab === 'suspicious' ? 'active' : ''}`} onClick={() => setTab('suspicious')}>
                    Suspicious Links ({suspects.length})
                </button>
            </div>

            {/* ── ORPHANED TAB ── */}
            {tab === 'orphaned' && (
                <>
                <div className="lp-progress">
                    <div className="lp-progress-info">
                        <div className="lp-progress-title">Today&apos;s Progress</div>
                        <div className="lp-progress-sub">{todayLinked}/{DAILY_TARGET} linked</div>
                    </div>
                    <div className="lp-progress-bar">
                        <div className="lp-progress-fill" style={{ width: `${progress}%`, background: progress >= 100 ? '#22c55e' : '#171717' }} />
                    </div>
                    <div className="lp-progress-pct" style={{ color: progress >= 100 ? '#22c55e' : '#171717' }}>{progress}%</div>
                </div>

                <div className="lp-stats">
                    <div className="lp-stat"><div className="lp-stat-v">{total}</div><div className="lp-stat-l">Remaining</div></div>
                    <div className="lp-stat"><div className="lp-stat-v" style={{ color: '#22c55e' }}>{todayLinked}</div><div className="lp-stat-l">Linked Today</div></div>
                    <div className="lp-stat"><div className="lp-stat-v">{Math.ceil(total / DAILY_TARGET)}</div><div className="lp-stat-l">Days Left</div></div>
                </div>

                {loading ? (
                    <PageLoader isLoading type="list"><div /></PageLoader>
                ) : projects.length === 0 ? (
                    <div className="lp-done"><div className="lp-done-icon">&#9989;</div><div className="lp-done-text">All projects linked!</div></div>
                ) : (
                    <>
                    {projects.map((p, idx) => {
                        const isActive = activeProject === p.id;
                        const pay = p.paid_status === 'PAID' ? { color: '#22c55e', bg: '#f0fdf4', label: 'Paid' } : { color: '#ef4444', bg: '#fef2f2', label: 'Unpaid' };
                        const projectSuggestions = suggestions[p.id] || [];

                        return (
                            <div key={p.id} className={`lp-card ${isActive ? 'active' : ''}`}>
                                <div className="lp-card-main" onClick={() => { setActiveProject(isActive ? null : p.id); setSearchQuery(''); setSearchResults([]); }}>
                                    <div className="lp-card-idx">{(page - 1) * 8 + idx + 1}</div>
                                    <div className="lp-card-body">
                                        <div className="lp-card-name">{p.project_name || 'Untitled'}</div>
                                        <div className="lp-card-meta">
                                            {p.account_manager && <span>AM: {p.account_manager}</span>}
                                            {p.project_date && <span>{new Date(p.project_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                                            {p.status && <span>{p.status}</span>}
                                        </div>
                                    </div>
                                    <div className="lp-card-right">
                                        <span className="lp-badge" style={{ color: pay.color, background: pay.bg }}>{pay.label}</span>
                                        <span className="lp-card-val">{p.project_value > 0 ? fmt(p.project_value) : '$0'}</span>
                                    </div>
                                </div>

                                {isActive && (
                                    <div className="lp-panel">
                                        <div className="lp-panel-context">
                                            This project was managed by <strong>{p.account_manager || 'Unknown'}</strong>
                                            {p.project_date ? ` around ${new Date(p.project_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : ''}.
                                            Search for the filmmaker who sent this footage.
                                        </div>

                                        {/* AI Suggestions */}
                                        {projectSuggestions.length > 0 && (
                                            <div className="lp-suggest">
                                                <div className="lp-suggest-title">Suggested (emailed by AM around this date)</div>
                                                <div className="lp-suggest-list">
                                                    {projectSuggestions.map((c: any) => (
                                                        <div key={c.id} className="lp-contact" onClick={() => handleLink(p.id, c.id)}>
                                                            <div className="lp-contact-av" style={{ background: '#0ea5e9' }}>{ini(c.name)}</div>
                                                            <div className="lp-contact-info">
                                                                <div className="lp-contact-name">{c.name}</div>
                                                                <div className="lp-contact-email">{c.email}</div>
                                                            </div>
                                                            <div className="lp-contact-stats">
                                                                {c.total_revenue > 0 && <div className="lp-contact-rev">{fmt(c.total_revenue)}</div>}
                                                                <div className="lp-contact-count">{c.emailCount} emails nearby</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Manual search */}
                                        <div className="lp-panel-title">Or search manually:</div>
                                        <input
                                            ref={searchInputRef}
                                            className="lp-search"
                                            placeholder="Type filmmaker name, email, or company..."
                                            value={searchQuery}
                                            onChange={e => handleSearch(e.target.value)}
                                        />

                                        {(searching || searchResults.length > 0 || searchQuery.length >= 2) && (
                                            <div style={{ marginTop: 8 }}>
                                                {searching ? (
                                                    <div className="lp-search-empty">Searching...</div>
                                                ) : searchResults.length > 0 ? (
                                                    searchResults.map(c => (
                                                        <div key={c.id} className="lp-contact" onClick={() => handleLink(p.id, c.id)}>
                                                            <div className="lp-contact-av" style={{ background: '#525252' }}>{ini(c.name)}</div>
                                                            <div className="lp-contact-info">
                                                                <div className="lp-contact-name">{c.name}</div>
                                                                <div className="lp-contact-email">{c.email}{c.company ? ' \u00B7 ' + c.company : ''}{c.location ? ' \u00B7 ' + c.location : ''}</div>
                                                            </div>
                                                            <div className="lp-contact-stats">
                                                                {c.total_revenue > 0 && <div className="lp-contact-rev">{fmt(c.total_revenue)}</div>}
                                                                <div className="lp-contact-count">{c.total_projects || 0} projects</div>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="lp-search-empty">No matches found</div>
                                                )}
                                            </div>
                                        )}

                                        <div className="lp-panel-actions">
                                            <button className="lp-btn" onClick={() => { setActiveProject(null); setSearchQuery(''); setSearchResults([]); }}>Skip</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    <div className="lp-pag">
                        <span className="lp-pag-info">Page {page}/{totalPages} &middot; {total} remaining</span>
                        <div className="lp-pag-btns">
                            <button className="lp-pag-btn" disabled={page <= 1} onClick={() => loadProjects(page - 1)}>&laquo;</button>
                            <button className="lp-pag-btn" disabled={page >= totalPages} onClick={() => loadProjects(page + 1)}>&raquo;</button>
                        </div>
                    </div>
                    </>
                )}
                </>
            )}

            {/* ── SUSPICIOUS LINKS TAB ── */}
            {tab === 'suspicious' && (
                <>
                <div style={{ fontSize: 13, color: '#737373', marginBottom: 16, lineHeight: 1.6 }}>
                    These contacts have many projects linked but very few emails. This usually means projects were auto-matched by name
                    (e.g., a filmmaker named &ldquo;Nick&rdquo; gets all projects with &ldquo;Nick&rdquo; in the couple name).
                    Click &ldquo;Unlink All&rdquo; to put their projects back in the orphaned queue for manual review.
                </div>

                {suspectLoading ? (
                    <PageLoader isLoading type="list"><div /></PageLoader>
                ) : suspects.length === 0 ? (
                    <div className="lp-done"><div className="lp-done-icon">&#9989;</div><div className="lp-done-text">No suspicious links!</div></div>
                ) : (
                    suspects.map(s => (
                        <div key={s.id} className="lp-suspect">
                            <div className="lp-suspect-info">
                                <div className="lp-suspect-name">{s.name}</div>
                                <div className="lp-suspect-meta">{s.email}</div>
                                <div className="lp-suspect-stats">
                                    <div className="lp-suspect-stat">
                                        <span className="lp-suspect-stat-v">{s.total_projects}</span>
                                        <span className="lp-suspect-stat-l">Projects</span>
                                    </div>
                                    <div className="lp-suspect-stat">
                                        <span className="lp-suspect-stat-v">{s.totalEmails}</span>
                                        <span className="lp-suspect-stat-l">Emails</span>
                                    </div>
                                    <div className="lp-suspect-stat">
                                        <span className="lp-suspect-stat-v">{fmt(s.total_revenue || 0)}</span>
                                        <span className="lp-suspect-stat-l">Revenue</span>
                                    </div>
                                    <div className="lp-suspect-stat">
                                        <span className="lp-suspect-stat-v" style={{ color: '#ef4444' }}>{s.ratio.toFixed(1)}</span>
                                        <span className="lp-suspect-stat-l">Email/Proj</span>
                                    </div>
                                </div>
                            </div>
                            <div className="lp-suspect-action">
                                <button
                                    className="lp-btn lp-btn-danger"
                                    onClick={() => handleUnlink(s.id)}
                                    disabled={unlinking === s.id}
                                >
                                    {unlinking === s.id ? 'Unlinking...' : 'Unlink All'}
                                </button>
                            </div>
                        </div>
                    ))
                )}
                </>
            )}
        </div></div>
        </>
    );
}
