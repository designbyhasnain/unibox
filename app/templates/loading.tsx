'use client';

export default function TemplatesLoading() {
    return (
        <div style={{ padding: '1.5rem', width: '100%', flex: 1 }}>
            <div className="skeleton-box" style={{ height: '2rem', width: '180px', borderRadius: '8px', marginBottom: '1.5rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="skeleton-box" style={{ height: '160px', borderRadius: '8px' }} />
                ))}
            </div>
        </div>
    );
}
