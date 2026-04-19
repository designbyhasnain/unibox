import type { Metadata } from 'next'
import './globals.css'

import { FilterProvider } from './context/FilterContext'
import { UIProvider } from './context/UIContext'
import { UndoToastProvider } from './context/UndoToastContext'
import ClientLayout from './components/ClientLayout'

export const metadata: Metadata = {
    title: 'Unibox CRM',
    description: 'Multi-account email CRM for Video Production',
}

const themeScript = `(function(){try{var t=localStorage.getItem('unibox_theme');if(t==='dark'||t==='light'){document.body.setAttribute('data-theme',t)}else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches){document.body.setAttribute('data-theme','dark')}}catch(e){}})()`;

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
                            <div className="layout-container">
                                <ClientLayout>
                                    {children}
                                </ClientLayout>
                            </div>
                        </UndoToastProvider>
                    </UIProvider>
                </FilterProvider>
            </body>
        </html>
    )
}

