import type { Metadata } from 'next'
import './globals.css'

import { FilterProvider } from './context/FilterContext'
import { UIProvider } from './context/UIContext'
import { UndoToastProvider } from './context/UndoToastContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { GlobalSearchProvider } from './context/GlobalSearchContext'
import ClientLayout from './components/ClientLayout'
import ServiceWorkerRegister from './components/ServiceWorkerRegister'

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
    manifest: '/manifest.json',
    robots: {
        index: false,
        follow: false,
        nocache: true,
    },
}

// Auto theme: follow the OS / browser preference and stay in sync as it
// changes. Runs synchronously in <head> so the CSS cascade sees the right
// tokens BEFORE any descendant paints — eliminates the dark↔light flash.
// We also mirror onto <body> for any selector still scoped that way, and
// keep listening to prefers-color-scheme so a user toggling Windows / macOS
// dark mode flips the app live without a refresh.
const themeScript = `(function(){try{var mq=window.matchMedia('(prefers-color-scheme: dark)');function apply(isDark){var h=document.documentElement,b=document.body;if(isDark){h.removeAttribute('data-theme');b&&b.removeAttribute('data-theme')}else{h.setAttribute('data-theme','light');b&&b.setAttribute('data-theme','light')}}apply(mq.matches);if(mq.addEventListener)mq.addEventListener('change',function(e){apply(e.matches)});else if(mq.addListener)mq.addListener(function(e){apply(e.matches)});try{localStorage.removeItem('unibox_theme')}catch(_){}}catch(e){}})()`;


export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body suppressHydrationWarning>
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
                <ServiceWorkerRegister />
                <FilterProvider>
                    <UIProvider>
                        <UndoToastProvider>
                            <ConfirmProvider>
                                <GlobalSearchProvider>
                                    <div className="layout-container">
                                        <ClientLayout>
                                            {children}
                                        </ClientLayout>
                                    </div>
                                </GlobalSearchProvider>
                            </ConfirmProvider>
                        </UndoToastProvider>
                    </UIProvider>
                </FilterProvider>
            </body>
        </html>
    )
}

