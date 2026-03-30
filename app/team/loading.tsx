'use client';
import { SkeletonEmailRow } from '../components/LoadingStates';

export default function Loading() {
    return (
        <div style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
                <div className="skeleton-box shimmer" style={{ width: 200, height: 28, borderRadius: 8 }} />
                <div className="skeleton-box shimmer" style={{ width: 120, height: 36, borderRadius: 8 }} />
            </div>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonEmailRow key={i} />
                ))}
            </div>
        </div>
    );
}
