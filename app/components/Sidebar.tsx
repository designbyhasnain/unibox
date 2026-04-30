'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGlobalFilter } from '../context/FilterContext';
import { logoutAction, getCurrentUserAction } from '../../src/actions/authActions';
import AccountSettingsModal from './AccountSettingsModal';
import { initials as nameInitials } from '../utils/nameDisplay';

/* ── 15×15 SVG icons matching design prototype ── */
const Icon = {
    inbox: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>,
    users: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    dashboard: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>,
    briefcase: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
    mail: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
    pipeline: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    target: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>,
    template: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
    chart: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    bolt: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    file: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
    link: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    spark: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>,
    brain: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>,
    money: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
    shield: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    team: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
    settings: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    logout: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    compose: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14m-7-7h14"/></svg>,
    search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
    sun: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
    chevDown: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
    scraper: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
    /* editor-specific icons */
    queue:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
    calNav:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    revisions: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    delivered: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
    footage:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>,
    brand:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
};

interface NavItem { href: string; label: string; icon: React.ReactNode; badge?: { n: number | string; kind: 'priority' | 'unread' } }
interface NavGroup { name: string; items: NavItem[] }

interface SidebarProps {
    onOpenCompose: () => void;
    isOpen?: boolean;
    onClose?: () => void;
}

export default function Sidebar({ onOpenCompose, isOpen, onClose }: SidebarProps) {
    const pathname = usePathname();
    const { selectedAccountId, setSelectedAccountId, accounts } = useGlobalFilter();
    const [userRole, setUserRole] = React.useState<string | null>(null);
    const [userName, setUserName] = React.useState('');
    const [userAvatarUrl, setUserAvatarUrl] = React.useState<string | null>(null);
    const [mounted, setMounted] = React.useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);
    const [showAccountSettings, setShowAccountSettings] = React.useState(false);

    const refreshProfile = React.useCallback(() => {
        getCurrentUserAction().then(session => {
            if (session) {
                setUserRole(session.role);
                setUserName(session.name || '');
                setUserAvatarUrl(session.avatarUrl || null);
                try { localStorage.setItem('unibox_user_role', session.role); } catch {}
                try { localStorage.setItem('unibox_user_name', session.name || ''); } catch {}
                try {
                    if (session.avatarUrl) localStorage.setItem('unibox_user_avatar', session.avatarUrl);
                    else localStorage.removeItem('unibox_user_avatar');
                } catch {}
            }
        });
    }, []);

    React.useEffect(() => {
        setMounted(true);
        try { const cached = localStorage.getItem('unibox_user_role'); if (cached) setUserRole(cached); } catch {}
        try { const cached = localStorage.getItem('unibox_user_name'); if (cached) setUserName(cached); } catch {}
        try { const cached = localStorage.getItem('unibox_user_avatar'); if (cached) setUserAvatarUrl(cached); } catch {}
        refreshProfile();
    }, [refreshProfile]);

    // Synthetic-workflow run found persona stayed stale after logout+login as
    // a different user — sidebar still showed the previous role/name until
    // the user manually called /api/auth/refresh-session. Two refresh
    // triggers cover the realistic flows:
    //   (a) pathname change — login redirects to /, /dashboard, etc.
    //   (b) tab visibility flipping back to visible — covers the case where
    //       another tab swapped the cookie or did a role change.
    React.useEffect(() => {
        if (!mounted) return;
        refreshProfile();
    }, [pathname, mounted, refreshProfile]);

    React.useEffect(() => {
        if (!mounted) return;
        const onVis = () => { if (document.visibilityState === 'visible') refreshProfile(); };
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
    }, [mounted, refreshProfile]);

    const [actionCount, setActionCount] = React.useState(0);
    React.useEffect(() => {
        // Editors don't have an Actions queue and the action throws EDITOR_FORBIDDEN —
        // skip the poll entirely once we know the role. While role is unknown we wait.
        if (userRole === null || userRole === 'VIDEO_EDITOR') return;
        const fetchCount = async () => {
            try {
                const mod = await import('../../src/actions/actionQueueActions');
                const result = await mod.getActionQueueAction();
                if (result?.counts) setActionCount(Number(result.counts.critical || 0) + Number(result.counts.high || 0));
            } catch {}
        };
        fetchCount();
        // Poll every 60s — but only while the tab is visible. Hidden tabs don't
        // generate user-relevant changes; resuming on visibilitychange gives the
        // user a fresh count immediately when they return.
        let interval: ReturnType<typeof setInterval> | null = null;
        const start = () => { if (!interval) interval = setInterval(fetchCount, 60000); };
        const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                fetchCount();
                start();
            } else {
                stop();
            }
        };
        if (document.visibilityState === 'visible') start();
        document.addEventListener('visibilitychange', onVisibility);
        return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
    }, [userRole]);

    const confirmLogout = async () => { setShowLogoutConfirm(false); await logoutAction(); };

    const isSales = userRole === 'SALES';
    const isAdminLike = userRole === 'ADMIN' || userRole === 'ACCOUNT_MANAGER';
    const isEditor = userRole === 'VIDEO_EDITOR';

    const [editorActiveCount, setEditorActiveCount] = React.useState(0);
    const [editorRevisionCount, setEditorRevisionCount] = React.useState(0);
    React.useEffect(() => {
        if (!isEditor) return;
        import('../../lib/projects/editorStats').then(m => {
            m.getEditorActiveCountAction().then(c => {
                setEditorActiveCount(c.active);
                setEditorRevisionCount(c.revisions);
            }).catch(() => {});
        });
    }, [isEditor]);

    const crmItems: NavItem[] = [
        { href: '/actions', label: 'Actions', icon: Icon.bolt, badge: actionCount > 0 ? { n: actionCount, kind: 'priority' } : undefined },
        { href: '/', label: 'Inbox', icon: Icon.inbox },
        { href: '/dashboard', label: 'Dashboard', icon: Icon.dashboard },
        { href: '/clients', label: isSales ? 'My Clients' : 'Clients', icon: Icon.users },
        { href: '/my-projects', label: 'My Projects', icon: Icon.briefcase },
        ...(isAdminLike ? [{ href: '/accounts', label: 'Accounts', icon: Icon.mail }] : []),
        { href: '/opportunities', label: isSales ? 'My Pipeline' : 'Opportunities', icon: Icon.pipeline },
    ];
    const mktItems: NavItem[] = [
        { href: '/campaigns', label: isSales ? 'My Campaigns' : 'Campaigns', icon: Icon.target },
        ...(isAdminLike ? [{ href: '/scraper', label: 'Scraper', icon: Icon.scraper }] : []),
        { href: '/templates', label: 'Templates', icon: Icon.template },
        { href: '/analytics', label: isSales ? 'My Analytics' : 'Analytics', icon: Icon.chart },
    ];
    const workItems: NavItem[] = [
        ...(isAdminLike ? [
            { href: '/projects', label: 'Edit Projects', icon: Icon.file },
            { href: '/link-projects', label: 'Link Projects', icon: Icon.link },
        ] : []),
        { href: '/jarvis', label: 'Jarvis AI', icon: Icon.spark },
    ];
    const adminItems: NavItem[] = isAdminLike ? [
        { href: '/intelligence', label: 'Intelligence', icon: Icon.brain },
        { href: '/finance', label: 'Finance', icon: Icon.money },
        { href: '/data-health', label: 'Data Health', icon: Icon.shield },
        { href: '/team', label: 'Team', icon: Icon.team },
    ] : [];

    const groups: NavGroup[] = isEditor
        ? [
            {
                name: 'MY WORK',
                items: [
                    { href: '/dashboard',        label: 'Today',           icon: Icon.dashboard },
                    { href: '/my-queue',         label: 'My Queue',        icon: Icon.queue,     badge: editorActiveCount  > 0 ? { n: editorActiveCount,  kind: 'unread' }   : undefined },
                    { href: '/calendar',         label: 'Calendar',        icon: Icon.calNav },
                    { href: '/revisions',        label: 'Revisions',       icon: Icon.revisions, badge: editorRevisionCount > 0 ? { n: editorRevisionCount, kind: 'priority' } : undefined },
                    { href: '/delivered',        label: 'Delivered',       icon: Icon.delivered },
                ],
            },
            {
                name: 'RESOURCES',
                items: [
                    { href: '/footage-library',  label: 'Footage Library', icon: Icon.footage },
                    { href: '/brand-guides',     label: 'Brand Guides',    icon: Icon.brand },
                    // Jarvis AI dropped from the editor sidebar — /api/jarvis,
                    // /api/jarvis/agent, and /api/jarvis/tts all reject
                    // VIDEO_EDITOR (Phase 2 commit a3bf0e5). Showing the link
                    // produced a 403 spiral. Add back when editors get their
                    // own scoped Jarvis tool surface.
                ],
            },
          ]
        : [
            { name: 'CRM', items: crmItems },
            { name: 'Marketing', items: mktItems },
            { name: isAdminLike ? 'Work' : 'Assistant', items: workItems },
            ...(adminItems.length > 0 ? [{ name: 'Admin', items: adminItems }] : []),
        ];

    const initials = nameInitials(userName, 'U');
    const accountLabel = isAdminLike ? `${accounts.length} accounts · Admin` : isSales ? `${accounts.length} accounts · Sales` : 'Editor';

    return (
        <>
            {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
            <aside className={`sidebar${isOpen ? ' open' : ''}`}>
                {/* Brand */}
                <div className="sb-brand">
                    <div className="logo-icon">U</div>
                    <span className="sb-brand-text">Unibox</span>
                    <div className="sb-brand-env">
                        <span className="sb-live-dot" />
                        Live
                    </div>
                </div>

                {/* Compose */}
                {!isEditor && (
                    <button className="sb-compose" onClick={onOpenCompose} title="Compose (C)">
                        {Icon.compose}
                        <span>Compose</span>
                        <span className="kbd">C</span>
                    </button>
                )}

                {/* Navigation */}
                <div className="sb-nav-scroll">
                    {groups.map(({ name, items }) => (
                        <div className="sb-group" key={name}>
                            <div className="sb-group-title">{name}</div>
                            {items.map(it => (
                                <Link
                                    key={it.href}
                                    href={it.href}
                                    prefetch={true}
                                    className={`sb-nav-item${pathname === it.href ? ' active' : ''}`}
                                    title={it.label}
                                    onClick={() => {
                                        onClose?.();
                                        if (pathname === it.href) window.dispatchEvent(new CustomEvent('nav-reset'));
                                    }}
                                >
                                    <span className="sb-nav-icon">{it.icon}</span>
                                    <span className="sb-nav-label">{it.label}</span>
                                    {it.badge && <span className={`sb-badge ${it.badge.kind}`}>{it.badge.n}</span>}
                                </Link>
                            ))}
                        </div>
                    ))}

                    {/* Account section */}
                    <div className="sb-group">
                        <div className="sb-group-title">Account</div>
                        <Link href="/settings" className={`sb-nav-item${pathname === '/settings' ? ' active' : ''}`} onClick={() => onClose?.()}>
                            <span className="sb-nav-icon">{Icon.settings}</span>
                            <span className="sb-nav-label">{isEditor ? 'Profile' : 'Settings'}</span>
                        </Link>
                        <button className="sb-nav-item" onClick={() => {
                            const current = document.documentElement.getAttribute('data-theme');
                            const next = current === 'light' ? '' : 'light';
                            if (next) {
                                document.documentElement.setAttribute('data-theme', next);
                                document.body.setAttribute('data-theme', next);
                                localStorage.setItem('unibox_theme', next);
                            } else {
                                document.documentElement.removeAttribute('data-theme');
                                document.body.removeAttribute('data-theme');
                                localStorage.removeItem('unibox_theme');
                            }
                        }} title="Toggle theme">
                            <span className="sb-nav-icon">{Icon.sun}</span>
                            <span className="sb-nav-label">Theme</span>
                        </button>
                        <button className="sb-nav-item" onClick={() => setShowLogoutConfirm(true)} title="Logout">
                            <span className="sb-nav-icon">{Icon.logout}</span>
                            <span className="sb-nav-label">Logout</span>
                        </button>
                    </div>
                </div>

                {/* User profile card — shows the LOGGED-IN USER's name + avatar
                    from the users table, NOT a Gmail persona. Click opens the
                    Account Settings modal (display name + change password). */}
                {mounted && (
                    <button
                        type="button"
                        className="sb-account-filter"
                        onClick={() => setShowAccountSettings(true)}
                        title="Account settings"
                        style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
                    >
                        {userAvatarUrl
                            ? <img src={userAvatarUrl} alt={userName || 'You'} className="sb-avatar sb-avatar-img" referrerPolicy="no-referrer" />
                            : <div className="sb-avatar av-e">{initials}</div>}
                        <div className="sb-meta">
                            <div className="sb-name">{userName || (isEditor ? 'Editor' : 'User')}</div>
                            <div className="sb-sub">
                                {isEditor
                                    ? (editorActiveCount > 0 ? `${editorActiveCount} active jobs · Editor` : 'Editor')
                                    : accountLabel}
                            </div>
                        </div>
                        {Icon.chevDown}
                    </button>
                )}
            </aside>

            {/* Account Settings — controlled here so any page surface can
                trigger via the sidebar profile button. */}
            {showAccountSettings && (
                <AccountSettingsModal
                    onClose={() => setShowAccountSettings(false)}
                    onUpdated={refreshProfile}
                />
            )}

            {/* Logout confirm */}
            {showLogoutConfirm && (
                <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in oklab, black, transparent 50%)', backdropFilter: 'blur(6px)', zIndex: 10000, display: 'grid', placeItems: 'center' }} onClick={() => setShowLogoutConfirm(false)}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--shell)', borderRadius: 'var(--radius-card)', padding: 24, width: 340, boxShadow: 'var(--shadow-pop)', textAlign: 'center', border: '1px solid var(--hairline)' }}>
                        <div style={{ fontSize: 36, marginBottom: 12 }}>{'\uD83D\uDEAA'}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Log out?</div>
                        <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 20 }}>Are you sure you want to log out of Unibox?</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setShowLogoutConfirm(false)} style={{ flex: 1, padding: '10px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--ink-muted)' }}>Cancel</button>
                            <button onClick={confirmLogout} style={{ flex: 1, padding: '10px 16px', background: 'var(--danger)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#fff' }}>Log Out</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
