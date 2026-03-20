import type { Metadata } from 'next'
import './globals.css'

import { FilterProvider } from './context/FilterContext'
import { UIProvider } from './context/UIContext'
import ClientLayout from './components/ClientLayout'

export const metadata: Metadata = {
    title: 'VideoMail CRM',
    description: 'Gmail-inspired CRM for Video Production',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body suppressHydrationWarning>
                <FilterProvider>
                    <UIProvider>
                        <div className="layout-container">
                            <ClientLayout>
                                {children}
                            </ClientLayout>
                        </div>
                    </UIProvider>
                </FilterProvider>
            </body>
        </html>
    )
}

