import type { Metadata } from 'next'
import './globals.css'

import { FilterProvider } from './context/FilterContext'
import { UIProvider } from './context/UIContext'
import { UndoToastProvider } from './context/UndoToastContext'
import { GlobalSearchProvider } from './context/GlobalSearchContext'
import ClientLayout from './components/ClientLayout'

// Every authenticated page reads the unibox_session cookie via getFreshSession()
// or ensureAuthenticated(); Next 16's prerender path can't satisfy that and
// crashes with a workUnitAsyncStorage invariant during build. Force-dynamic at
// the root cascades to all pages and prevents a regression every time a new
// page is added.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: {
        default: 'Unibox',
        template: '%s | Unibox',
    },
    description: 'Professional email CRM for Wedits — unified inbox, sales pipeline, and AI-powered outreach.',
    applicationName: 'Unibox',
    authors: [{ name: 'Wedits' }],
    icons: { icon: '/icon.svg' },
    robots: {
        index: false,
        follow: false,
        nocache: true,
    },
}

const themeScript = `(function(){try{var t=localStorage.getItem('unibox_theme');if(t==='light'){document.body.setAttribute('data-theme','light')}}catch(e){}})()`;


export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body suppressHydrationWarning>
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
                <FilterProvider>
                    <UIProvider>
                        <UndoToastProvider>
                            <GlobalSearchProvider>
                                <div className="layout-container">
                                    <ClientLayout>
                                        {children}
                                    </ClientLayout>
                                </div>
                            </GlobalSearchProvider>
                        </UndoToastProvider>
                    </UIProvider>
                </FilterProvider>
            </body>
        </html>
    )
}

