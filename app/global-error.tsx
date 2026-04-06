'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
    return (
        <html>
            <body style={{ fontFamily: 'system-ui', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', margin: 0, background: '#0a0a0a' }}>
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ color: '#e53e3e', fontSize: '1.5rem' }}>Something went wrong</h1>
                    <p style={{ color: '#888', fontSize: '0.9rem' }}>{error?.message || 'An unexpected error occurred'}</p>
                    <button onClick={reset} style={{ marginTop: 16, padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
}
