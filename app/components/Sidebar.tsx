'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGlobalFilter } from '../context/FilterContext';
import { logoutAction, getCurrentUserAction } from '../../src/actions/authActions';

const Icons = {
    Inbox: () => (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
        </svg>
    ),

    Clients: () => (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    ),
    Accounts: () => (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
    ),
    Projects: () => (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
    ),
    Campaigns: () => (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 11 18-5v12L3 14v-3z" />
            <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
    ),
    Templates: () => (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
    ),
    BarChart: () => (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
    ),
    Settings: () => (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    ),
    Team: () => (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
    ),
    Compose: () => (
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14m-7-7h14" />
        </svg>
    ),
};

const NAV_MAIN = [
    { href: '/', label: 'Inbox', icon: <Icons.Inbox /> },
    { href: '/clients', label: 'Clients', icon: <Icons.Clients /> },
    { href: '/accounts', label: 'Accounts', icon: <Icons.Accounts /> },
    { href: '/projects', label: 'Projects', icon: <Icons.Projects /> },
    { href: '/campaigns', label: 'Campaigns', icon: <Icons.Campaigns /> },
    { href: '/templates', label: 'Templates', icon: <Icons.Templates /> },
    { href: '/analytics', label: 'Analytics', icon: <Icons.BarChart /> },
];

const NAV_FOOTER = [
    { href: '/settings', label: 'Settings', icon: <Icons.Settings /> },
];


interface SidebarProps {
    onOpenCompose: () => void;
}

export default function Sidebar({ onOpenCompose }: SidebarProps) {
    const pathname = usePathname();
    const { selectedAccountId, setSelectedAccountId, accounts } = useGlobalFilter();
    const [userRole, setUserRole] = React.useState<string | null>(null);
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
        // Restore from localStorage first for instant render, then verify from server
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

    const handleLogout = async () => {
        if (confirm('Are you sure you want to log out?')) {
            await logoutAction();
        }
    };

    const navItems = [
        ...NAV_MAIN,
        ...((userRole === 'ADMIN' || userRole === 'ACCOUNT_MANAGER') ? [{ href: '/team', label: 'Team', icon: <Icons.Team /> }] : []),
    ];


    return (
        <aside className="sidebar">
            {/* Brand */}
            <div className="brand-logo">
                <div className="logo-icon">
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                        <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
                    </svg>
                </div>
                Unibox
            </div>

            {/* Compose */}
            <button className="compose-btn" onClick={onOpenCompose} id="compose-btn">
                <Icons.Compose />
                Compose
            </button>

            {/* Main Nav */}
            <div className="nav-items">
                {navItems.map(({ href, label, icon }) => (
                    <Link
                        key={href}
                        href={href}
                        prefetch={true}
                        className={`nav-item${pathname === href ? ' active' : ''}`}
                        {...(pathname === href ? { 'aria-current': 'page' as const } : {})}
                        title={label}
                        onClick={() => {
                            if (pathname === href) {
                                window.dispatchEvent(new CustomEvent('nav-reset'));
                            }
                        }}
                    >
                        {icon}
                        {label}
                    </Link>
                ))}

                {/* Account Filter Section */}
                <div className="sidebar-section">
                    <div className="sidebar-section-title">FILTER BY ACCOUNT</div>
                    <div className="account-filter-container" suppressHydrationWarning>
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
                        <svg aria-hidden="true" className="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Footer Nav */}
            <div className="sidebar-footer">
                {NAV_FOOTER.map(({ href, label, icon }) => (
                    <Link
                        key={href}
                        href={href}
                        prefetch={true}
                        className={`nav-item${pathname === href ? ' active' : ''}`}
                        {...(pathname === href ? { 'aria-current': 'page' as const } : {})}
                        title={label}
                    >
                        {icon}
                        {label}
                    </Link>
                ))}
                <button className="nav-item logout-btn-sidebar" onClick={handleLogout} title="Logout">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Logout
                </button>
            </div>
        </aside>
    );
}
