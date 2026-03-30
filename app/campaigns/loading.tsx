'use client';

export default function CampaignsLoading() {
    return (
        <div style={{ padding: '1.5rem', width: '100%', flex: 1 }}>
            <div className="skeleton-box" style={{ height: '2rem', width: '200px', borderRadius: '8px', marginBottom: '1.5rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="skeleton-box" style={{ height: '72px', borderRadius: '8px' }} />
                ))}
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton-box" style={{ height: '72px', borderRadius: '8px', marginBottom: '0.5rem' }} />
            ))}
        </div>
    );
}
