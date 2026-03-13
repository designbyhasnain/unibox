import type { Metadata } from 'next'
import './globals.css'

import { FilterProvider } from './context/FilterContext'
import { OwnerSessionTracker } from './components/OwnerSessionTracker'

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
                    <OwnerSessionTracker />
                    <div className="layout-container">
                        {children}
                    </div>
                </FilterProvider>
            </body>
        </html>
    )
}

