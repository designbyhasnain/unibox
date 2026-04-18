'use client';
import { SkeletonCard } from '../components/LoadingStates';

export default function TemplatesLoading() {
    return (
        <div style={{ padding: '1.5rem', width: '100%', flex: 1 }}>
            <div className="skeleton-row-stagger" style={{ marginBottom: '1.5rem' }}>
                <div className="skeleton-box shimmer" style={{ height: '2rem', width: '180px', borderRadius: '8px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonCard key={i} index={i} />
                ))}
            </div>
        </div>
    );
}
