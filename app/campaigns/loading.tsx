'use client';
import { SkeletonStatCard, SkeletonCard, LoadingText } from '../components/LoadingStates';

export default function CampaignsLoading() {
    return (
        <div style={{ padding: '1.5rem', width: '100%', flex: 1 }}>
            <LoadingText context="campaigns" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginTop: '1rem', marginBottom: '1.5rem' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonStatCard key={i} index={i} />
                ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonCard key={i} index={i + 4} />
                ))}
            </div>
        </div>
    );
}
