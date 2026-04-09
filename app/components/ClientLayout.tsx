'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useUI } from '../context/UIContext';
import { useGlobalFilter } from '../context/FilterContext';
import { usePrefetch } from '../hooks/usePrefetch';
import Sidebar from './Sidebar';
import ComposeModal from './ComposeModal';
import JarvisVoiceOrb from './JarvisVoiceOrb';
import { ErrorBoundary } from './ErrorBoundary';
interface ClientLayoutProps {
    children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
    const pathname = usePathname();
    const { isComposeOpen, setComposeOpen, composeDefaultTo, composeDefaultSubject, composeDefaultBody } = useUI();
    const { selectedAccountId } = useGlobalFilter();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Prefetch data for other pages in background
    usePrefetch(selectedAccountId, pathname);

    // Close sidebar on route change
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    // Login and invite pages get their own full-screen layout — no sidebar, compose modal, or trackers
    if (pathname === '/login' || pathname.startsWith('/invite')) {
        return <>{children}</>;
    }

    return (
        <>
            <Sidebar onOpenCompose={() => { setComposeOpen(true); setSidebarOpen(false); }} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <div className="layout-content">
                {/* Mobile hamburger button */}
                <button className="mobile-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>
                <ErrorBoundary section="Page">
                    {children}
                </ErrorBoundary>
            </div>
            {isComposeOpen && (
                <ErrorBoundary section="Compose">
                    <ComposeModal
                        onClose={() => setComposeOpen(false)}
                        defaultTo={composeDefaultTo}
                        defaultSubject={composeDefaultSubject}
                        defaultBody={composeDefaultBody}
                    />
                </ErrorBoundary>
            )}
            <JarvisVoiceOrb />
        </>
    );
}
