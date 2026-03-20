'use client';

import { usePathname } from 'next/navigation';
import { useUI } from '../context/UIContext';
import Sidebar from './Sidebar';
import ComposeModal from './ComposeModal';
interface ClientLayoutProps {
    children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
    const pathname = usePathname();
    const { isComposeOpen, setComposeOpen, composeDefaultTo } = useUI();

    // Login page gets its own full-screen layout — no sidebar, compose modal, or trackers
    if (pathname === '/login') {
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
                />
            )}
        </>
    );
}
