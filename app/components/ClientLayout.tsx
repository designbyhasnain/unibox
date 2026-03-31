'use client';

import { usePathname } from 'next/navigation';
import { useUI } from '../context/UIContext';
import { useGlobalFilter } from '../context/FilterContext';
import { usePrefetch } from '../hooks/usePrefetch';
import Sidebar from './Sidebar';
import ComposeModal from './ComposeModal';
interface ClientLayoutProps {
    children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
    const pathname = usePathname();
    const { isComposeOpen, setComposeOpen, composeDefaultTo, composeDefaultSubject, composeDefaultBody } = useUI();
    const { selectedAccountId } = useGlobalFilter();

    // Prefetch data for other pages in background
    usePrefetch(selectedAccountId);

    // Login and invite pages get their own full-screen layout — no sidebar, compose modal, or trackers
    if (pathname === '/login' || pathname.startsWith('/invite')) {
        return <>{children}</>;
    }

    return (
        <>
            <Sidebar onOpenCompose={() => setComposeOpen(true)} />
            <div className="layout-content">
                {children}
            </div>
            {isComposeOpen && (
                <ComposeModal
                    onClose={() => setComposeOpen(false)}
                    defaultTo={composeDefaultTo}
                    defaultSubject={composeDefaultSubject}
                    defaultBody={composeDefaultBody}
                />
            )}
        </>
    );
}
