'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGlobalFilter } from '../context/FilterContext';
import { logoutAction, getCurrentUserAction } from '../../src/actions/authActions';

/* ── Icons (14px for compact sidebar) ── */
const I = {
    Inbox: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
        </svg>
    ),
    Clients: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    ),
    Accounts: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
    ),
    Projects: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
    ),
    Campaigns: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
    ),
    Templates: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
        </svg>
    ),
    Analytics: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
    ),
    Opportunities: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    ),
    Settings: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    ),
    Team: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
        </svg>
    ),
    Intelligence: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
        </svg>
    ),
    Finance: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
        </svg>
    ),
    Actions: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
        </svg>
    ),
    Dashboard: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
    ),
    Compose: () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14m-7-7h14" />
        </svg>
    ),
    Collapse: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" />
        </svg>
    ),
    Expand: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
        </svg>
    ),
    Logout: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    ),
    Scraper: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
        </svg>
    ),
    Jarvis: () => <span style={{ fontSize: 14, lineHeight: 1 }}>{'\uD83E\uDD16'}</span>,
    EditProj: () => <span style={{ fontSize: 14, lineHeight: 1 }}>{'\uD83C\uDFAC'}</span>,
};

interface NavEntry { href: string; label: string; icon: React.ReactNode; badge?: number }
interface NavGroup { title: string; items: NavEntry[] }

interface SidebarProps {
    onOpenCompose: () => void;
    isOpen?: boolean;
    onClose?: () => void;
}

export default function Sidebar({ onOpenCompose, isOpen, onClose }: SidebarProps) {
    const pathname = usePathname();
    const { selectedAccountId, setSelectedAccountId, accounts } = useGlobalFilter();
    const [userRole, setUserRole] = React.useState<string | null>(null);
    const [mounted, setMounted] = React.useState(false);
    const [collapsed, setCollapsed] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
        try {
            const saved = localStorage.getItem('unibox_sidebar_collapsed');
            if (saved === '1') setCollapsed(true);
        } catch {}
        try {
            const cached = localStorage.getItem('unibox_user_role');
            if (cached) setUserRole(cached);
        } catch {}
        getCurrentUserAction().then(session => {
            if (session) {
                setUserRole(session.role);
                try { localStorage.setItem('unibox_user_role', session.role); } catch {}
            }
        });
    }, []);

    const toggleCollapsed = () => {
        setCollapsed(prev => {
            const next = !prev;
            try { localStorage.setItem('unibox_sidebar_collapsed', next ? '1' : '0'); } catch {}
            return next;
        });
    };

    const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);
    const confirmLogout = async () => {
        setShowLogoutConfirm(false);
        await logoutAction();
    };

    const isSales = userRole === 'SALES';
    const isAdminLike = userRole === 'ADMIN' || userRole === 'ACCOUNT_MANAGER';
    const isEditor = userRole === 'VIDEO_EDITOR';

    const [actionCount, setActionCount] = React.useState(0);
    React.useEffect(() => {
        const fetchCount = async () => {
            try {
                const mod = await import('../../src/actions/actionQueueActions');
                const result = await mod.getActionQueueAction();
                if (result?.counts) {
                    setActionCount(Number(result.counts.critical || 0) + Number(result.counts.high || 0));
                }
            } catch {}
        };
        fetchCount();
        const interval = setInterval(fetchCount, 60000);
        return () => clearInterval(interval);
    }, []);

    /* ── Build grouped navigation ── */

    // VIDEO_EDITOR: minimal nav — Dashboard, My Projects, Profile only
    const editorGroup: NavGroup = {
        title: 'Workstation',
        items: [
            { href: '/dashboard', label: 'Dashboard', icon: <I.Dashboard /> },
            { href: '/projects', label: 'My Projects', icon: <I.EditProj /> },
        ],
    };

    const crmGroup: NavGroup = {
        title: 'CRM',
        items: [
            { href: '/actions', label: 'Actions', icon: <I.Actions />, badge: actionCount },
            { href: '/', label: 'Inbox', icon: <I.Inbox /> },
            { href: '/dashboard', label: 'Dashboard', icon: <I.Dashboard /> },
            { href: '/clients', label: isSales ? 'My Clients' : 'Clients', icon: <I.Clients /> },
            { href: '/my-projects', label: 'My Projects', icon: <I.Projects /> },
            { href: '/accounts', label: 'Accounts', icon: <I.Accounts /> },
            { href: '/opportunities', label: 'Opportunities', icon: <I.Opportunities /> },
        ],
    };

    const marketingGroup: NavGroup = {
        title: 'Marketing',
        items: [
            { href: '/campaigns', label: isSales ? 'My Campaigns' : 'Campaigns', icon: <I.Campaigns /> },
            ...(isAdminLike ? [{ href: '/scraper', label: 'Scraper', icon: <I.Scraper /> }] : []),
            { href: '/templates', label: 'Templates', icon: <I.Templates /> },
            { href: '/analytics', label: 'Analytics', icon: <I.Analytics /> },
        ],
    };

    const workGroup: NavGroup = {
        title: 'Work',
        items: [
            { href: '/projects', label: 'Edit Projects', icon: <I.EditProj /> },
            { href: '/link-projects', label: 'Link Projects', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> },
            { href: '/jarvis', label: 'Jarvis AI', icon: <I.Jarvis /> },
        ],
    };

    const groups = isEditor ? [editorGroup] : [crmGroup, marketingGroup, workGroup];

    /* Bottom items (admin-only items + settings + logout) */
    const bottomItems: NavEntry[] = [
        ...(isAdminLike ? [
            { href: '/intelligence', label: 'Intelligence', icon: <I.Intelligence /> },
            { href: '/finance', label: 'Finance', icon: <I.Finance /> },
            { href: '/data-health', label: 'Data Health', icon: <I.Intelligence /> },
            { href: '/team', label: 'Team', icon: <I.Team /> },
        ] : []),
        { href: '/settings', label: isEditor ? 'Profile' : 'Settings', icon: <I.Settings /> },
    ];

    const handleNavClick = () => { onClose?.(); };

    const renderNavItem = (item: NavEntry) => (
        <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            className={`sb-nav-item${pathname === item.href ? ' active' : ''}`}
            {...(pathname === item.href ? { 'aria-current': 'page' as const } : {})}
            title={item.label}
            onClick={() => {
                handleNavClick();
                if (pathname === item.href) window.dispatchEvent(new CustomEvent('nav-reset'));
            }}
        >
            <span className="sb-nav-icon">{item.icon}</span>
            {!collapsed && <span className="sb-nav-label">{item.label}</span>}
            {!collapsed && item.badge && item.badge > 0 ? (
                <span className="sb-badge">{item.badge}</span>
            ) : null}
            {collapsed && item.badge && item.badge > 0 ? (
                <span className="sb-badge-dot" />
            ) : null}
        </Link>
    );

    return (
        <>
            {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
            <aside className={`sidebar${isOpen ? ' open' : ''}${collapsed ? ' collapsed' : ''}`} suppressHydrationWarning>
                {/* Brand */}
                <div className="sb-header">
                    <div className="sb-brand">
                        <div className="logo-icon">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                                <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
                            </svg>
                        </div>
                        {!collapsed && <span className="sb-brand-text">Unibox</span>}
                    </div>
                    {!isEditor && (
                        <button className="sb-compose" onClick={onOpenCompose} id="compose-btn" title="Compose">
                            <I.Compose />
                            {!collapsed && <span>Compose</span>}
                        </button>
                    )}
                </div>

                {/* Grouped navigation */}
                <div className="sb-nav-scroll">
                    {groups.map(group => (
                        <div key={group.title} className="sb-group">
                            {!collapsed && <div className="sb-group-title">{group.title}</div>}
                            {collapsed && <div className="sb-group-divider" />}
                            {group.items.map(renderNavItem)}
                        </div>
                    ))}

                    {/* Account filter — only when expanded, hidden for editors */}
                    {!collapsed && !isEditor && (
                        <div className="sb-account-filter">
                            <div className="sb-group-title">Account</div>
                            <div className="account-filter-container">
                                <select
                                    className="sidebar-account-select"
                                    value={selectedAccountId}
                                    onChange={(e) => setSelectedAccountId(e.target.value)}
                                    aria-label="Filter by account"
                                    suppressHydrationWarning
                                >
                                    <option value="ALL">All Accounts</option>
                                    {mounted && accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.email}</option>
                                    ))}
                                </select>
                                <svg className="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom section: admin items + settings + theme + logout + collapse toggle */}
                <div className="sb-footer">
                    {bottomItems.map(renderNavItem)}
                    <button
                        className="sb-nav-item"
                        onClick={() => {
                            const current = document.body.getAttribute('data-theme');
                            const next = current === 'dark' ? 'light' : 'dark';
                            document.body.setAttribute('data-theme', next);
                            localStorage.setItem('unibox_theme', next);
                        }}
                        title="Toggle dark mode"
                    >
                        <span className="sb-nav-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                            </svg>
                        </span>
                        {!collapsed && <span className="sb-nav-label">Theme</span>}
                    </button>
                    <button
                        className="sb-nav-item"
                        onClick={() => setShowLogoutConfirm(true)}
                        title="Logout"
                    >
                        <span className="sb-nav-icon"><I.Logout /></span>
                        {!collapsed && <span className="sb-nav-label">Logout</span>}
                    </button>
                    <button
                        className="sb-collapse-toggle"
                        onClick={toggleCollapsed}
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? <I.Expand /> : <I.Collapse />}
                        {!collapsed && <span>Collapse</span>}
                    </button>
                </div>
            </aside>

            {/* Logout confirm modal */}
            {showLogoutConfirm && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setShowLogoutConfirm(false)}
                >
                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 24, width: 340, boxShadow: 'var(--shadow-xl)', textAlign: 'center', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 36, marginBottom: 12 }}>{'\uD83D\uDEAA'}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Log out?</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Are you sure you want to log out of Unibox?</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setShowLogoutConfirm(false)} style={{ flex: 1, padding: '10px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-muted)' }}>Cancel</button>
                            <button onClick={confirmLogout} style={{ flex: 1, padding: '10px 16px', background: '#dc2626', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#fff' }}>Log Out</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
